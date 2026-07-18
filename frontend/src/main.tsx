import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Home from './TraceLoop';
import { QueryProvider } from './lib/providers';
import { AuthGate } from './lib/AuthGate';
import './traceloop.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryProvider>
      <AuthGate>
        <Home />
      </AuthGate>
    </QueryProvider>
  </StrictMode>,
);
