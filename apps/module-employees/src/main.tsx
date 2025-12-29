import React from 'react';
import ReactDOM from 'react-dom/client';
import { EmployeesApp } from './EmployeesApp';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <EmployeesApp />
  </React.StrictMode>
);
