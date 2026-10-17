import type { Plan } from '../core/types';
import { api } from './client';
import type { AuthResponse, PlanPage, PlanRecord, PlanSort, SessionInfo, User } from './types';

/** One function per backend endpoint (see README → «Бэкенд»). */

export const authApi = {
  login: (email: string, password: string) =>
    api<AuthResponse>('/auth/login', { method: 'POST', body: { email, password }, auth: false }),
  register: (email: string, password: string, displayName?: string) =>
    api<AuthResponse>('/auth/register', {
      method: 'POST',
      body: { email, password, displayName: displayName || undefined },
      auth: false,
    }),
  logout: () => api<void>('/auth/logout', { method: 'POST', auth: false }),
  sessions: () => api<SessionInfo[]>('/auth/sessions'),
  revokeSession: (id: string) => api<void>(`/auth/sessions/${id}`, { method: 'DELETE' }),
  revokeOtherSessions: () => api<void>('/auth/sessions', { method: 'DELETE' }),
};

export const userApi = {
  me: () => api<User>('/users/me'),
  update: (displayName: string) => api<User>('/users/me', { method: 'PATCH', body: { displayName } }),
  changePassword: (currentPassword: string, newPassword: string) =>
    api<void>('/users/me/password', { method: 'POST', body: { currentPassword, newPassword } }),
  deleteAccount: (password: string) => api<void>('/users/me', { method: 'DELETE', body: { password } }),
};

export interface PlanListQuery {
  q?: string;
  sort?: PlanSort;
  limit?: number;
  offset?: number;
}

export const planApi = {
  list: (query: PlanListQuery, signal?: AbortSignal) =>
    api<PlanPage>('/plans', { query: { ...query }, signal }),
  get: (id: string) => api<PlanRecord>(`/plans/${id}`),
  create: (name: string, data?: Plan) => api<PlanRecord>('/plans', { method: 'POST', body: { name, data } }),
  update: (id: string, body: { version: number; name?: string; data?: Plan }) =>
    api<PlanRecord>(`/plans/${id}`, { method: 'PATCH', body }),
  duplicate: (id: string, name?: string) =>
    api<PlanRecord>(`/plans/${id}/duplicate`, { method: 'POST', body: { name } }),
  remove: (id: string) => api<void>(`/plans/${id}`, { method: 'DELETE' }),
};
