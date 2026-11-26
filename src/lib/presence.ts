import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { create } from 'zustand';
import { api } from '@/api/client';
import type { PresenceDetail, UserMessage } from '@/api/types';
import { analyticsSnapshot } from './analytics';

/**
 * «Who is on the site» for the admin «Онлайн» tab (backend/app/presence.py): every open tab reports every
 * VISIBLE_EVERY while it is on screen (HIDDEN_EVERY in the background) and when it closes — the page, the
 * section of the landing page, what is open in the editor (setPresenceDetail) and how long ago the visitor
 * moved. The server keeps it in memory only. The tab's id lives in memory too: nothing is written to the
 * browser.
 *
 * The answer brings the messages of the team waiting for a signed-in user (components/MessageDialog.tsx), so
 * a message sent from the admin panel shows up within seconds.
 *
 * Nothing here touches window or document at module level or while rendering (the landing page is
 * prerendered): it starts from an effect.
 */

const VISIBLE_EVERY = 15_000;
const HIDDEN_EVERY = 60_000;

interface PresenceState {
  /** Messages of the team waiting to be shown, oldest first. */
  messages: UserMessage[];
}

export const usePresence = create<PresenceState>()(() => ({ messages: [] }));

const state = {
  started: false,
  tab: '',
  path: '/',
  signedIn: false,
  detail: null as PresenceDetail | null,
  timer: 0,
  sending: false,
};

/** What is open in this tab (the editor, the demo); null when it closes. */
export function setPresenceDetail(detail: PresenceDetail | null): void {
  state.detail = detail;
}

/** A message answered here: the next one follows (the server stops sending it too). */
export function dropMessage(id: string): void {
  usePresence.setState((s) => ({ messages: s.messages.filter((m) => m.id !== id) }));
}

function report(leaving = false) {
  const { visitId, section, idleSeconds } = analyticsSnapshot();
  return {
    tab: state.tab,
    visitId,
    path: state.path,
    section,
    detail: state.detail,
    visible: document.visibilityState !== 'hidden',
    idleSeconds,
    leaving,
  };
}

function schedule(): void {
  window.clearTimeout(state.timer);
  state.timer = window.setTimeout(() => void beat(), document.visibilityState === 'hidden' ? HIDDEN_EVERY : VISIBLE_EVERY);
}

async function beat(): Promise<void> {
  schedule();
  if (state.sending) return;
  state.sending = true;
  try {
    const { messages } = await api<{ messages: UserMessage[] }>('/presence', { method: 'POST', body: report() });
    usePresence.setState({ messages: state.signedIn ? messages : [] });
  } catch {
    // Presence must never break the page.
  } finally {
    state.sending = false;
  }
}

function start(): void {
  if (state.started) return;
  state.started = true;
  state.tab = crypto.randomUUID();
  document.addEventListener('visibilitychange', () => void beat());
  window.addEventListener('pagehide', () => {
    try {
      const body = new Blob([JSON.stringify(report(true))], { type: 'application/json' });
      navigator.sendBeacon?.('/api/presence', body);
    } catch {
      /* the tab is gone anyway: the server forgets it after a few minutes */
    }
  });
}

/** In the Shell: reports on every route and sign-in change, then on a timer. */
export function usePresenceTracking(status: 'loading' | 'authenticated' | 'anonymous'): void {
  const { pathname } = useLocation();
  useEffect(() => {
    if (status === 'loading') return;
    start();
    state.path = pathname;
    state.signedIn = status === 'authenticated';
    if (!state.signedIn) usePresence.setState({ messages: [] });
    void beat();
  }, [pathname, status]);
}
