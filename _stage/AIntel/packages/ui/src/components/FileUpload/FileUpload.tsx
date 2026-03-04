import React from 'react';
import './FileUpload.css';

export interface FileUploadProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  onFileSelect?: (file: File | null, event: React.ChangeEvent<HTMLInputElement>) => void;
}

export const FileUpload = React.forwardRef<HTMLInputElement, FileUploadProps>((props, ref) => {
  const { label, id, onFileSelect, onChange, ...rest } = props;

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onFileSelect?.(event.target.files?.[0] ?? null, event);
    onChange?.(event);
  };

  return (
    <label className="aintel-file-upload" htmlFor={id}>
      {label && <span className="aintel-file-upload__label">{label}</span>}
      <input id={id} type="file" ref={ref} onChange={handleChange} {...rest} />
    </label>
  );
});
