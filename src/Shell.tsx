import { App } from './App';
import { MessageDialog } from './components/MessageDialog';
import { Toaster } from './components/ui/sonner';
import { TooltipProvider } from './components/ui/tooltip';
import { usePageTracking } from './lib/analytics';
import { usePresenceTracking } from './lib/presence';
import { useApplyTheme } from './lib/theme';
import { useAuth } from './store/useAuth';

/**
 * Everything inside the router and the query client. main.tsx renders it in the browser and
 * scripts/prerender.mjs on the server (the landing page), so the two trees match for hydration.
 */
export function Shell() {
  const theme = useApplyTheme();
  const status = useAuth((s) => s.status);
  // Visit statistics of the public pages for the admin panel (lib/analytics.ts).
  usePageTracking(status);
  // Who is on the site now (admin «Онлайн») and the messages of the team (lib/presence.ts).
  usePresenceTracking(status);
  return (
    <TooltipProvider delayDuration={300}>
      <App />
      <MessageDialog />
      <Toaster position="bottom-right" theme={theme} />
    </TooltipProvider>
  );
}
