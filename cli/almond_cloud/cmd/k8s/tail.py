from typing import Iterable, List, NoReturn
from queue import Queue
from threading import Thread

from kubernetes import client, config
from kubernetes.watch import Watch
from kubernetes.client.models.v1_pod import V1Pod
from clavier import log as logging, arg_par, err, io

from almond_cloud.config import CONFIG

LOG = logging.getLogger(__name__)

DESC = f"""\
Follow logs of one or more pods.
"""


def add_parser(subparsers: arg_par.Subparsers):
    parser = subparsers.add_parser(
        "tail",
        target=tail,
        help=DESC.splitlines()[0],
        description=DESC,
    )

    parser.add_argument(
        "pod_names",
        nargs="+",
        help="Pods to follow, which are prefix-matched against the name",
    )


def match_pod_name(pod_names: Iterable[str], pod: V1Pod) -> bool:
    for name in pod_names:
        if pod.metadata.name == name or pod.metadata.name.startswith(
            f"{name}-"
        ):
            return True
    return False


def tail_one(api_v1: client.CoreV1Api, pod_name: str) -> NoReturn:
    watch = Watch()
    color_name = io.capture(f"[dim white]{pod_name}[/]", end="")
    for line in watch.stream(
        api_v1.read_namespaced_pod_log, pod_name, CONFIG.k8s.namespace
    ):
        print(f"{color_name}  {line}")


def _thread_tail(
    queue: Queue, api_v1: client.CoreV1Api, pod_name: str, pad_width: int
) -> NoReturn:
    watch = Watch()
    padded_name = ("{:<" + str(pad_width) + "}").format(pod_name)
    left_col = io.capture(f"[dim white]{padded_name}[/]", end="")
    for line in watch.stream(
        api_v1.read_namespaced_pod_log, pod_name, CONFIG.k8s.namespace
    ):
        queue.put(left_col + line)


def tail_many(api_v1: client.CoreV1Api, pod_names: List[str]) -> NoReturn:
    max_name_length = max(len(n) for n in pod_names)
    pad_width = (int(max_name_length / 4) + 1) * 4
    queue = Queue()
    threads = [
        Thread(target=_thread_tail, args=(queue, api_v1, pod_name, pad_width))
        for pod_name in pod_names
    ]
    for thread in threads:
        thread.setDaemon(True)
        thread.start()

    while True:
        print(queue.get())


def tail(pod_names: List[str]):
    config.load_kube_config()
    api_v1 = client.CoreV1Api()
    all_pods = api_v1.list_namespaced_pod(CONFIG.k8s.namespace).items
    pods = [pod for pod in all_pods if match_pod_name(pod_names, pod)]

    if len(pods) == 0:
        LOG.error(
            "No pods found.",
            pod_names=pod_names,
            available_pods=sorted([pod.metadata.name for pod in all_pods]),
        )
        raise err.UserError("No pods found.")

    if len(pods) == 1:
        tail_one(api_v1, pods[0].metadata.name)

    tail_many(api_v1, [pod.metadata.name for pod in pods])