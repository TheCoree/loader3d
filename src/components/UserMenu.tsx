import { ChevronDown, LayoutGrid, LogOut, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { initials } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useAuth } from '@/store/useAuth';

export function UserMenu({ compact = false, tone = 'light' }: { compact?: boolean; tone?: 'light' | 'dark' }) {
  const dark = tone === 'dark';
  const user = useAuth((s) => s.user);
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
        <Button
          variant="ghost"
          className={cn(
            'h-9 gap-2 rounded-full px-1.5 sm:pr-2.5',
            dark
              ? 'text-white hover:bg-white/10 hover:text-white aria-expanded:bg-white/10 aria-expanded:text-white'
              : 'data-[state=open]:bg-muted',
          )}
          aria-label="Меню аккаунта"
        >
          <Avatar className="size-7">
            <AvatarFallback
              className={cn('text-xs font-semibold', dark ? 'bg-white text-ink' : 'bg-ink text-white')}
            >
              {initials(user.displayName)}
            </AvatarFallback>
          </Avatar>
          {!compact && (
            <>
              <span className="hidden max-w-40 truncate text-sm font-medium sm:inline">{user.displayName}</span>
              <ChevronDown className={cn('hidden sm:inline', dark ? 'text-white/50' : 'text-muted-foreground')} />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <div className="truncate text-sm font-medium text-foreground">{user.displayName}</div>
          <div className="truncate text-xs text-muted-foreground">{user.email}</div>
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
            <DropdownMenuItem onSelect={() => navigate('/account#subscription')}>
              <Sparkles /> Тариф
              <span className="ml-auto text-xs text-muted-foreground">{user.subscription.name}</span>
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
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut /> Выйти
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
