import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { Logo } from '@/components/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { SubscriptionChip } from '@/components/TierBadge';
import { UserMenu } from '@/components/UserMenu';
import { cn } from '@/lib/utils';
import { useAuth } from '@/store/useAuth';

function Tab({ to, children, end = true }: { to: string; children: ReactNode; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'rounded-full px-3.5 py-1.5 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
          isActive ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
        )
      }
    >
      {children}
    </NavLink>
  );
}

/** Header of the plans, tariff, account and admin pages; follows the theme. */
export function AppHeader({ children }: { children?: ReactNode }) {
  const isAdmin = useAuth((s) => s.user?.isAdmin);
  const tiers = useAuth((s) => !!s.user?.subscription);
  return (
    <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Logo to="/plans" />
        <nav aria-label="Разделы" className="hidden items-center gap-1 sm:flex">
          <Tab to="/plans">Схемы</Tab>
          {tiers && <Tab to="/billing">Тариф</Tab>}
          <Tab to="/account" end={false}>
            Аккаунт
          </Tab>
          {isAdmin && <Tab to="/admin">Администрирование</Tab>}
        </nav>
        <div className="flex flex-1 items-center justify-end gap-1">
          {children}
          <SubscriptionChip />
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
