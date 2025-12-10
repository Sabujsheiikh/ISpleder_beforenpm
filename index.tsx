// Polyfill for crypto.randomUUID for older WebView2 runtimes
if (typeof crypto !== 'undefined' && !(crypto as any).randomUUID) {
  try {
    (crypto as any).randomUUID = function () {
      const r = crypto.getRandomValues(new Uint8Array(16));
      r[6] = (r[6] & 0x0f) | 0x40; // version 4
      r[8] = (r[8] & 0x3f) | 0x80; // variant
      const toHex = (i: number) => r[i].toString(16).padStart(2, '0');
      return `${toHex(0)}${toHex(1)}${toHex(2)}${toHex(3)}-${toHex(4)}${toHex(5)}-${toHex(6)}${toHex(7)}-${toHex(8)}${toHex(9)}-${toHex(10)}${toHex(11)}${toHex(12)}${toHex(13)}${toHex(14)}${toHex(15)}`;
    };
  } catch (e) {
    // ignore; crypto may be unavailable in some test environments
  }
}

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Register Service Worker for Offline Support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => {
        console.log('SW registered: ', registration);
      })
      .catch(registrationError => {
        console.log('SW registration failed: ', registrationError);
      });
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);