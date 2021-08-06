#!/usr/bin/env bash

# Common / useful `set` commands
set -Ee # Exit on error
set -o pipefail # Check status of piped commands
set -u # Error on undefined vars
# set -v # Print everything
# set -x # Print commands (with expanded vars)

cd "$(git rev-parse --show-toplevel)/dev/k8s" && \
	./bin/almond-dev.destroy.bash &&
	./bin/almond-dev.create.bash
