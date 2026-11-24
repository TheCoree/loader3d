import { createContext, useContext } from 'react';

/**
 * True inside the demo of the landing page (pages/DemoPage): what the editor puts behind a badge there is
 * opened by a free registration, not by a tier — the badge says nothing about tariffs.
 */
export const DemoMode = createContext(false);

export function useDemoMode(): boolean {
  return useContext(DemoMode);
}
