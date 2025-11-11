import React from 'react';
import ReactDOM from 'react-dom/client';
import { ProjectsPage } from './ProjectsPage';
import { applyTheme } from '@aintel/theme';
import './styles.css';

applyTheme('light');

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ProjectsPage />
  </React.StrictMode>
);
