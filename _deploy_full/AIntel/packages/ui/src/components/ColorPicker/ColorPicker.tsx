import React from 'react';
import './ColorPicker.css';

export interface ColorPickerProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const ColorPicker = React.forwardRef<HTMLInputElement, ColorPickerProps>((props, ref) => {
  const { label, id, ...rest } = props;
  return (
    <label className="aintel-color-picker" htmlFor={id}>
      {label && <span className="aintel-color-picker__label">{label}</span>}
      <input type="color" id={id} ref={ref} {...rest} />
    </label>
  );
});
