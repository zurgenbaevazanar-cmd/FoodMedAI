import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

// Подключение базового Tailwind CSS v4
const style = document.createElement('style');
style.textContent = `@import "tailwindcss";`;
document.head.appendChild(style);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
