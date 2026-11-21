import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router';
import { ApiError } from './api/client';
import { Shell } from './Shell';
import { useAuth, wasSignedIn } from './store/useAuth';
import './store/accountSync';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // A 4xx will not get better by repeating it.
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
    },
  },
});

// Cached responses belong to the account that fetched them: none of them may survive a logout, a lost
// session or a login as someone else.
useAuth.subscribe((state, prev) => {
  if (state.user?.id !== prev.user?.id) queryClient.clear();
});
void useAuth.getState().bootstrap();

// A tab opened before a deploy asks for code split off into chunks (the editor, the PDF) under names the new
// build no longer has: load the new version instead of failing. Not on a page that has only just loaded,
// so a chunk that is really missing cannot make it reload over and over.
window.addEventListener('vite:preloadError', (event) => {
  if (performance.now() < 10_000) return;
  event.preventDefault();
  window.location.reload();
});

const app = (
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Shell />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);

// index.html carries the landing page prerendered for search engines (scripts/prerender.mjs): hydrate
// it where the page is exactly that. Elsewhere (and for a browser that was logged in, which goes on to
// its plans) render from scratch.
const root = document.getElementById('root')!;
if (root.hasChildNodes() && window.location.pathname === '/' && !wasSignedIn()) {
  hydrateRoot(root, app);
} else {
  root.textContent = '';
  createRoot(root).render(app);
}
