import React from 'react';
import './Select.css';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>((props, ref) => {
  const { label, id, className = '', children, ...rest } = props;
  return (
    <label className="aintel-select" htmlFor={id}>
      {label && <span className="aintel-select__label">{label}</span>}
      <select id={id} ref={ref} className={`aintel-select__input ${className}`} {...rest}>
        {children}
      </select>
    </label>
  );
});
