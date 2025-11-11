import React from 'react';
import './DateInput.css';

export interface DateInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>((props, ref) => {
  const { label, id, className = '', ...rest } = props;
  return (
    <label className="aintel-date-input" htmlFor={id}>
      {label && <span className="aintel-date-input__label">{label}</span>}
      <input id={id} ref={ref} type="date" className={`aintel-date-input__field ${className}`} {...rest} />
    </label>
  );
});
