import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { Logo } from '@/components/Logo';
import { UserMenu } from '@/components/UserMenu';
import { cn } from '@/lib/utils';
import { useAuth } from '@/store/useAuth';

function Tab({ to, children }: { to: string; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        cn(
          'rounded-full px-3.5 py-1.5 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-white/30',
          isActive ? 'bg-white/[0.12] text-white' : 'text-white/60 hover:text-white',
        )
      }
    >
      {children}
    </NavLink>
  );
}

/** Header of the plans, account and admin pages: dark, like the site header. */
export function AppHeader({ children }: { children?: ReactNode }) {
  const isAdmin = useAuth((s) => s.user?.isAdmin);
  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-ink/95 text-white backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Logo to="/plans" />
        <nav aria-label="Разделы" className="hidden items-center gap-1 sm:flex">
          <Tab to="/plans">Схемы</Tab>
          <Tab to="/account">Аккаунт</Tab>
          {isAdmin && <Tab to="/admin">Администрирование</Tab>}
        </nav>
        <div className="flex flex-1 items-center justify-end gap-2">
          {children}
          <UserMenu tone="dark" />
        </div>
      </div>
    </header>
  );
}
