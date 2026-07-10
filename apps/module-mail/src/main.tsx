import React from 'react';
import ReactDOM from 'react-dom/client';
import { PostaPage } from './PostaPage';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <PostaPage />
  </React.StrictMode>,
);
