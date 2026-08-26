import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { HostedApp } from './HostedApp';
import './style.css';

declare global {
  interface ImportMeta {
    readonly env: { readonly VITE_HOSTED?: string };
  }
}

const RootApp = import.meta.env.VITE_HOSTED === '1' ? HostedApp : App;
createRoot(document.getElementById('root')!).render(<React.StrictMode><RootApp/></React.StrictMode>);
