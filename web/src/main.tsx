import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import Root from './app/Root';
import ServerWakeGate from './app/ServerWakeGate';

createRoot(document.getElementById('root')!).render(<StrictMode><ServerWakeGate><BrowserRouter><Root /></BrowserRouter></ServerWakeGate></StrictMode>);
