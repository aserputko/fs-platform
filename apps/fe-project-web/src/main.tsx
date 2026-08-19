import { OnetalentUIKitProvider } from 'fe-ui-kit';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app';
import 'fe-ui-kit/styles.css';
import './styles/index.scss';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element #root not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <OnetalentUIKitProvider>
      <App />
    </OnetalentUIKitProvider>
  </StrictMode>,
);
