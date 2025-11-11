import React from 'react';
import ReactDOM from 'react-dom/client';
import { CRMPage } from './CRMPage';
import { applyTheme } from '@aintel/theme';
import './styles.css';

applyTheme('light');

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <CRMPage />
  </React.StrictMode>
);
