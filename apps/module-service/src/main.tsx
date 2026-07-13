import React from 'react';
import ReactDOM from 'react-dom/client';
import { ServicePage } from './ServicePage';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ServicePage />
  </React.StrictMode>,
);
