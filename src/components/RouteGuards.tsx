import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { LogoLoader } from '@/components/Logo';
import { useAuth } from '@/store/useAuth';

export function FullScreenLoader({ label = 'Загрузка…' }: { label?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-background">
      <div className="flex flex-col items-center gap-4 text-sm text-muted-foreground">
        <LogoLoader className="size-11 text-foreground" label={label} />
        <span className="flex items-center gap-2">
          {label}
        </span>
      </div>
    </div>
  );
}

/**
 * While the demo of the landing page loads (pages/DemoPage): the dark interface on the editor's picture the landing
 * page grew to the whole screen (pages/LandingDemo), so the demo opens where the picture was.
 */
export function DemoFallback() {
  return (
    <div className="dark relative grid min-h-dvh place-items-center overflow-hidden bg-background">
      <img src="/landing/editor.webp" alt="" className="absolute inset-0 size-full object-cover object-left-top opacity-25" />
      <div className="relative flex flex-col items-center gap-4 text-sm text-muted-foreground">
        <LogoLoader className="size-11 text-foreground" label="Открываем демо…" />
        Открываем демо…
      </div>
    </div>
  );
}

/** While the session is being restored on page load. */
export function SessionLoader() {
  const reconnecting = useAuth((s) => s.reconnecting);
  return <FullScreenLoader label={reconnecting ? 'Нет связи с сервером, переподключаемся…' : undefined} />;
}

/**
 * Pages for logged-in users; others go to /login and come back afterwards. An account whose email is not
 * confirmed yet goes to /verify-email first (`unverified` lets that page itself through).
 */
export function RequireAuth({ children, unverified = false }: { children: ReactNode; unverified?: boolean }) {
  const status = useAuth((s) => s.status);
  const verified = useAuth((s) => s.user?.emailVerified ?? true);
  const location = useLocation();
  if (status === 'loading') return <SessionLoader />;
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (!verified && !unverified) {
    return <Navigate to="/verify-email" replace state={{ from: location.pathname + location.search }} />;
  }
  return children;
}

/** The admin panel: other users go to their plans. */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const isAdmin = useAuth((s) => s.user?.isAdmin ?? false);
  return <RequireAuth>{isAdmin ? children : <Navigate to="/plans" replace />}</RequireAuth>;
}

/** Login / register: a logged-in user goes straight to the app. */
export function PublicOnly({ children }: { children: ReactNode }) {
  const status = useAuth((s) => s.status);
  const location = useLocation();
  if (status === 'loading') return <SessionLoader />;
  if (status === 'authenticated') {
    return <Navigate to={(location.state as { from?: string } | null)?.from ?? '/plans'} replace />;
  }
  return children;
}
