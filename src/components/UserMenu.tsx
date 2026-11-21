import { ChevronDown, CreditCard, LayoutGrid, LogOut, Megaphone, ShieldCheck, SunMoon, UserRound } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { THEME_OPTIONS } from '@/components/ThemeToggle';
import { SubscriptionStateBadge, TierBadge } from '@/components/TierBadge';
import { UnseenCount } from '@/components/updates';
import { UserAvatar } from '@/components/settings';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
import { subscriptionSummary } from '@/lib/tiers';
import { useAuth } from '@/store/useAuth';
import { useStore, type Theme } from '@/store/useStore';

export function UserMenu({ compact = false }: { compact?: boolean }) {
  const user = useAuth((s) => s.user);
  const theme = useStore((s) => s.settings.theme);
  const setSetting = useStore((s) => s.setSetting);
  const [confirmOut, setConfirmOut] = useState(false);
  const navigate = useNavigate();
  if (!user) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-9 gap-2 rounded-full px-1.5 data-[state=open]:bg-muted lg:pr-2.5" aria-label="Меню аккаунта">
            <UserAvatar user={user} />
            {!compact && (
              <>
                <span className="hidden max-w-40 truncate text-sm font-medium lg:inline">{user.displayName}</span>
                <ChevronDown className="hidden text-muted-foreground lg:inline" />
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
              <UserRound /> Аккаунт
            </DropdownMenuItem>
            {user.subscription && (
              <DropdownMenuItem onSelect={() => navigate('/billing')}>
                <CreditCard /> Тариф и оплата
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => navigate('/updates')}>
              <Megaphone /> Что нового
              <UnseenCount className="ml-auto" />
            </DropdownMenuItem>
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
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmOut(true)}>
            <LogOut /> Выйти
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SignOutDialog open={confirmOut} onOpenChange={setConfirmOut} />
    </>
  );
}

/** «Выйти из аккаунта?» — signing out always asks first (the menu and the account page). */
export function SignOutDialog({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  const logout = useAuth((s) => s.logout);
  const navigate = useNavigate();
  const signOut = async () => {
    await logout().catch(() => {});
    navigate('/login', { replace: true });
  };
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Выйти из аккаунта?</AlertDialogTitle>
          <AlertDialogDescription>Чтобы вернуться, нужно будет снова ввести email и пароль.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => void signOut()}>
            Выйти
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
