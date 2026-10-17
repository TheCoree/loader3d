import { create } from 'zustand';
import { onSessionLost, refreshSession, setAccessToken } from '../api/client';
import { authApi } from '../api/endpoints';
import type { AuthResponse, User } from '../api/types';

/** Who is logged in. The access token itself is kept by api/client.ts (memory only). */
interface AuthState {
  status: 'loading' | 'authenticated' | 'anonymous';
  user: User | null;
  /** Restores the session from the refresh cookie on page load. */
  bootstrap(): Promise<void>;
  login(email: string, password: string): Promise<void>;
  register(email: string, password: string, displayName?: string): Promise<void>;
  logout(): Promise<void>;
  setUser(user: User): void;
  /** The server ended the session (revoked, expired, account deleted). */
  sessionEnded(): void;
}

let bootstrapping: Promise<void> | null = null;

export const useAuth = create<AuthState>()((set) => {
  const signedIn = (auth: AuthResponse) => {
    setAccessToken(auth.accessToken);
    set({ status: 'authenticated', user: auth.user });
  };

  onSessionLost(() => useAuth.getState().sessionEnded());

  return {
    status: 'loading',
    user: null,

    bootstrap() {
      bootstrapping ??= refreshSession()
        .catch(() => null) // server unreachable: show the login page, it reports the error
        .then((auth) => {
          if (auth) signedIn(auth);
          else set({ status: 'anonymous', user: null });
        })
        .finally(() => {
          bootstrapping = null;
        });
      return bootstrapping;
    },

    async login(email, password) {
      signedIn(await authApi.login(email, password));
    },

    async register(email, password, displayName) {
      signedIn(await authApi.register(email, password, displayName));
    },

    async logout() {
      try {
        await authApi.logout();
      } finally {
        setAccessToken(null);
        set({ status: 'anonymous', user: null });
      }
    },

    setUser(user) {
      set({ user });
    },

    sessionEnded() {
      setAccessToken(null);
      set({ status: 'anonymous', user: null });
    },
  };
});
