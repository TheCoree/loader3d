import { ChevronDown, CreditCard, LayoutGrid, LogOut, ShieldCheck, SunMoon, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router';
import { THEME_OPTIONS } from '@/components/ThemeToggle';
import { SubscriptionStateBadge, TierBadge } from '@/components/TierBadge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { initials } from '@/lib/format';
import { subscriptionSummary } from '@/lib/tiers';
import { useAuth } from '@/store/useAuth';
import { useStore, type Theme } from '@/store/useStore';

export function UserMenu({ compact = false }: { compact?: boolean }) {
  const user = useAuth((s) => s.user);
  const theme = useStore((s) => s.settings.theme);
  const setSetting = useStore((s) => s.setSetting);
  const logout = useAuth((s) => s.logout);
  const navigate = useNavigate();
  if (!user) return null;

  const signOut = async () => {
    await logout().catch(() => {});
    navigate('/login', { replace: true });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 gap-2 rounded-full px-1.5 data-[state=open]:bg-muted sm:pr-2.5" aria-label="Меню аккаунта">
          <Avatar className="size-7">
            <AvatarFallback className="bg-foreground text-xs font-semibold text-background">
              {initials(user.displayName)}
            </AvatarFallback>
          </Avatar>
          {!compact && (
            <>
              <span className="hidden max-w-40 truncate text-sm font-medium sm:inline">{user.displayName}</span>
              <ChevronDown className="hidden text-muted-foreground sm:inline" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <div className="truncate text-sm font-medium text-foreground">{user.displayName}</div>
          <div className="truncate text-xs text-muted-foreground">{user.email}</div>
          {user.subscription && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <TierBadge tier={user.subscription.tier} />
              <SubscriptionStateBadge sub={user.subscription} />
              <span className="w-full text-xs text-muted-foreground">{subscriptionSummary(user.subscription)}</span>
            </div>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={() => navigate('/plans')}>
            <LayoutGrid /> Мои схемы
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => navigate('/account')}>
            <UserRound /> Аккаунт и устройства
          </DropdownMenuItem>
          {user.subscription && (
            <DropdownMenuItem onSelect={() => navigate('/billing')}>
              <CreditCard /> Тариф и оплата
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        {user.isAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate('/admin')}>
              <ShieldCheck /> Администрирование
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <SunMoon /> Тема
            <span className="ml-auto text-xs text-muted-foreground">
              {THEME_OPTIONS.find((o) => o.value === theme)?.label}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48">
            <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setSetting('theme', v as Theme)}>
              {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
                <DropdownMenuRadioItem key={value} value={value}>
                  <Icon /> {label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut /> Выйти
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
