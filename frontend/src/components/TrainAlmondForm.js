import React from 'react';

import useForm from 'react-hook-form';

import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import FormControl from 'react-bootstrap/FormControl';
import MicInputButton from './MicInputButton';

export default props => {
  const { register, handleSubmit, errors } = useForm();
  const onSubmit = data => {
    console.log(data);
  };

  return (
    <Form onSubmit={handleSubmit(onSubmit)}>
      <Form.Group controlId="formCommand">
        <Form.Control
          name="command"
          type="text"
          placeholder="What do you want Almond to do?"
          ref={register({ required: true })}
          isInvalid={errors.command}
        />
        <Form.Control.Feedback type="invalid">
          {errors.command && 'This field is required.'}
        </Form.Control.Feedback>
        <Form.Text className="text-muted">
          You have trained Almond with 0 sentences. Thank you!
        </Form.Text>
      </Form.Group>
      <Form.Group controlId="formRecord">
        <MicInputButton />
      </Form.Group>
      <Form.Group controlId="formCheckbox">
        <Form.Check
          type="checkbox"
          name="edit_before_learning"
          label="Check me out"
          ref={register}
        />
      </Form.Group>
      <Button variant="primary" type="submit">
        Submit
      </Button>
    </Form>
  );
};