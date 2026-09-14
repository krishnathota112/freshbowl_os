import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { syncEffectiveNow } from './lib/now';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: 1 },
  },
});

/*
  ASK THE DATABASE WHAT TIME IT IS, BEFORE DRAWING ANYTHING.

  The factory's effective clock lives on the server, because that is the clock the rest gates read.
  A screen that disagrees with the server about the time shows a countdown that reaches zero while
  the gate stays shut — and, when the demo clock is set, places every batch at the wrong hour.

  Deliberately NOT awaited before the first render. A blank screen while a request completes is a
  worse failure than a few hundred milliseconds on the browser clock, and every screen re-reads the
  offset on its next render anyway.
*/
void syncEffectiveNow();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);
