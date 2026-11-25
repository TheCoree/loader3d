/**
 * The referral code a visitor came with: `?ref=` of the link in a letter to a company (backend/app/outreach.py,
 * `/r/<code>` redirects to `/?ref=<code>&utm_…`). Kept in memory only — nothing of the app goes into the
 * browser's storage — so it travels from the landing page to the registration within the visit and is sent
 * with it (User.ref). Read once in main.tsx, never while rendering (the landing page is prerendered).
 */

const REF = /^[a-z0-9]{4,12}$/;

let current: string | null = null;

/** Reads `?ref=` of the address the visit started at. */
export function captureRef(search: string): void {
  const value = new URLSearchParams(search).get('ref')?.trim().toLowerCase();
  if (value && REF.test(value)) current = value;
}

export function currentRef(): string | null {
  return current;
}
