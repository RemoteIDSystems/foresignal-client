import './app/global.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App, createSession } from './app';

const root = document.getElementById('root');
if (!root) {
  throw new Error('ForeSignal Client: the #root element is missing from index.html.');
}

const session = createSession();

createRoot(root).render(
  <StrictMode>
    <App session={session} />
  </StrictMode>,
);
