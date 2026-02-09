import React from 'react';
import ReactDOM from 'react-dom/client';
import { DashboardPage } from './DashboardPage';
import { applyTheme } from '@aintel/theme';
import './styles.css';

applyTheme('light');

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <DashboardPage />
  </React.StrictMode>
);
