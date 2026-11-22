import { onTierLimit } from '../api/client';
import { userApi } from '../api/endpoints';
import { TIERS_ENABLED } from '../lib/tiers';
import { useAuth } from './useAuth';

/**
 * Keeps `user.subscription` current while the app is open. The server applies a tier the moment it starts
 * or ends — a payment confirmed by the provider's webhook, an admin's change, the end of the period — but
 * the app hears about the account only at sign-in and when the token is refreshed. GET /users/me again:
 *  - a second after the subscription ends (`expiresAt`): the badge, the limits and the «Pro» features
 *    switch then, not on some later request;
 *  - when the tab comes back into view (at most once in FOCUS_GAP): a payment finished in another tab,
 *    a tier assigned by an admin;
 *  - after the API refused something over a tier limit: the limits the app checked were out of date.
 */

const FOCUS_GAP = 30_000;
// Long timers are re-armed: setTimeout cannot wait more than ~24.8 days.
const MAX_WAIT = 24 * 3_600_000;
// The server still reports the tier after the end the app expected (its clock runs behind the
// device's): ask again this much later.
const RECHECK = 30_000;

let lastAsked = 0;
let asking: Promise<void> | null = null;
let timer = 0;

function refresh(): Promise<void> {
  asking ??= (async () => {
    const before = useAuth.getState();
    if (before.status !== 'authenticated' || !before.user) return;
    lastAsked = Date.now();
    try {
      const user = await userApi.me();
      const now = useAuth.getState();
      if (now.status === 'authenticated' && now.user?.id === user.id) now.setUser(user);
    } catch {
      /* offline or the session is over (api() handles that): the next chance comes */
    }
  })().finally(() => {
    asking = null;
  });
  return asking;
}

function schedule(expiresAt: string | null | undefined, atLeast = 0): void {
  window.clearTimeout(timer);
  if (!expiresAt) return;
  const wait = Math.max(new Date(expiresAt).getTime() - Date.now() + 1000, atLeast);
  if (wait > MAX_WAIT) {
    timer = window.setTimeout(() => schedule(expiresAt), MAX_WAIT);
    return;
  }
  timer = window.setTimeout(() => {
    void refresh().then(() => {
      // Still the same end: the server has not reached it yet.
      const current = useAuth.getState().user?.subscription?.expiresAt;
      if (current === expiresAt) schedule(current, RECHECK);
    });
  }, wait);
}

function seen(): void {
  if (document.visibilityState === 'visible' && Date.now() - lastAsked > FOCUS_GAP) void refresh();
}

if (TIERS_ENABLED && typeof window !== 'undefined') {
  useAuth.subscribe((state, previous) => {
    const end = state.status === 'authenticated' ? (state.user?.subscription?.expiresAt ?? null) : null;
    const before = previous.status === 'authenticated' ? (previous.user?.subscription?.expiresAt ?? null) : null;
    if (end !== before || state.user?.id !== previous.user?.id) schedule(end);
  });
  document.addEventListener('visibilitychange', seen);
  window.addEventListener('focus', seen);
  onTierLimit(() => void refresh());
}
