import { App } from './App';
import { Toaster } from './components/ui/sonner';
import { TooltipProvider } from './components/ui/tooltip';
import { useApplyTheme } from './lib/theme';

/**
 * Everything inside the router and the query client. main.tsx renders it in the browser and
 * scripts/prerender.mjs on the server (the landing page), so the two trees match for hydration.
 */
export function Shell() {
  const theme = useApplyTheme();
  return (
    <TooltipProvider delayDuration={300}>
      <App />
      <Toaster position="bottom-right" theme={theme} />
    </TooltipProvider>
  );
}
