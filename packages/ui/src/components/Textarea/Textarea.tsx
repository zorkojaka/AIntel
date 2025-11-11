import React from 'react';
import './Textarea.css';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>((props, ref) => {
  const { label, id, className = '', ...rest } = props;
  return (
    <label className="aintel-textarea" htmlFor={id}>
      {label && <span className="aintel-textarea__label">{label}</span>}
      <textarea id={id} ref={ref} className={`aintel-textarea__field ${className}`} {...rest} />
    </label>
  );
});
