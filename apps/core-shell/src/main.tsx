import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { applyTheme } from '@aintel/theme';
import './index.css';

applyTheme('light');

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
