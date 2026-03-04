import React from 'react';
import './Input.css';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>((props, ref) => {
  const { label, id, ...rest } = props;
  return (
    <label className="aintel-input" htmlFor={id}>
      {label && <span className="aintel-input__label">{label}</span>}
      <input id={id} ref={ref} {...rest} />
    </label>
  );
});
