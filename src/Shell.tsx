import { App } from './App';
import { Toaster } from './components/ui/sonner';
import { TooltipProvider } from './components/ui/tooltip';
import { usePageTracking } from './lib/analytics';
import { useApplyTheme } from './lib/theme';
import { useAuth } from './store/useAuth';

/**
 * Everything inside the router and the query client. main.tsx renders it in the browser and
 * scripts/prerender.mjs on the server (the landing page), so the two trees match for hydration.
 */
export function Shell() {
  const theme = useApplyTheme();
  // Visit statistics of the public pages for the admin panel (lib/analytics.ts).
  usePageTracking(useAuth((s) => s.status));
  return (
    <TooltipProvider delayDuration={300}>
      <App />
      <Toaster position="bottom-right" theme={theme} />
    </TooltipProvider>
  );
}
