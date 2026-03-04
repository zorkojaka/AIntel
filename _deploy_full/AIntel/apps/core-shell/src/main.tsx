import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { applyTheme } from '@aintel/theme';
import { applySettingsTheme, fetchSettings } from '@aintel/module-settings';
import '@aintel/module-projects/src/globals.css';
import '@aintel/module-crm/src/styles.css';
import '@aintel/module-cenik/src/globals.css';
import '@aintel/module-dashboard/src/styles.css';
import '@aintel/module-employees/src/index.css';
import './index.css';

applyTheme('light');
void fetchSettings().then(applySettingsTheme).catch(() => {});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
