import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// Keep a port open so background can detect when the panel closes
chrome.runtime.connect({ name: 'overlay-panel' });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
