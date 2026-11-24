import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft, CircleHelp, Download, Ellipsis, Eye, FileText, FileUp, FolderOpen, Redo2, Save, Sparkles, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { ProBadge } from '@/components/UpgradeDialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { useStore } from '@/store/useStore';
import { useUi } from '@/store/useUi';
import { CargoButton, DisplayItems, DisplayMenu, ICON, IconTip, OverflowDot } from './EditorHeader';
import { createLandingDemoPlan, demoAccountLink, openDemoGate } from './demo';

/**
 * The header of the demo (pages/DemoPage): back to the landing page, what this is («Демо — не сохраняется»),
 * undo/redo, the «Вид» and «Файл» menus of the editor (files need an account) and the way into an account
 * with the plan on screen — «Сохранить схему».
 */
export function DemoHeader() {
  const canUndo = useStore((s) => s.history.past.length > 0);
  const canRedo = useStore((s) => s.history.future.length > 0);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const setHelpOpen = useUi((s) => s.setHelpOpen);

  return (
    <header className="z-20 flex h-14 shrink-0 items-center gap-1 border-b bg-background px-2 text-foreground">
      <IconTip label="На главную">
        <Button variant="ghost" size="icon-lg" asChild aria-label="На главную">
          <Link to="/" data-track="demo_back">
            <ArrowLeft className={ICON} />
          </Link>
        </Button>
      </IconTip>
      <div className="flex min-w-0 flex-1 items-center gap-2 pl-1">
        <span className="truncate font-display text-base font-medium tracking-[-0.01em]">Демо-схема</span>
        <span
          className="hidden h-6 shrink-0 items-center rounded-full bg-muted px-2.5 text-xs text-muted-foreground md:inline-flex"
          title="Схема живёт только в этой вкладке: ничего не уходит на сервер"
        >
          Демо · не сохраняется
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-px">
        <IconTip label="Отменить" keys="Ctrl+Z">
          <Button variant="ghost" size="icon-lg" disabled={!canUndo} onClick={undo} aria-label="Отменить">
            <Undo2 className={ICON} />
          </Button>
        </IconTip>
        <IconTip label="Повторить" keys="Ctrl+Y">
          <Button variant="ghost" size="icon-lg" disabled={!canRedo} onClick={redo} aria-label="Повторить" className="max-sm:hidden">
            <Redo2 className={ICON} />
          </Button>
        </IconTip>
        <div className="hidden items-center gap-px sm:flex">
          <Separator orientation="vertical" className="mx-1 h-5 data-vertical:self-center" />
          <DisplayMenu />
          <DropdownMenu>
            <IconTip label="Файл">
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-lg" aria-label="Файл">
                  <FolderOpen className={ICON} />
                </Button>
              </DropdownMenuTrigger>
            </IconTip>
            <DropdownMenuContent align="end" className="w-60">
              <DemoFileItems />
            </DropdownMenuContent>
          </DropdownMenu>
          <IconTip label="Управление и клавиши">
            <Button variant="ghost" size="icon-lg" onClick={() => setHelpOpen(true)} aria-label="Справка">
              <CircleHelp className={ICON} />
            </Button>
          </IconTip>
        </div>
        <div className="sm:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-lg" aria-label="Ещё" className="relative">
                <Ellipsis className={ICON} />
                <OverflowDot />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Eye /> Вид и привязка
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-64">
                  <DisplayItems />
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DemoFileItems />
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setHelpOpen(true)}>
                <CircleHelp /> Управление
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <SaveButton />
        <CargoButton compact />
      </div>
    </header>
  );
}

/** «Файл» of the demo: the PDF (counted, editor/demo.ts), the example again; files need an account. */
function DemoFileItems() {
  const loadPlan = useStore((s) => s.loadPlan);
  const setPdfOpen = useUi((s) => s.setPdfOpen);
  return (
    <>
      <DropdownMenuItem onSelect={() => setPdfOpen(true)}>
        <FileText /> Экспорт в PDF…
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => openDemoGate('file')}>
        <Download /> Скачать JSON
        <ProBadge />
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => openDemoGate('file')}>
        <FileUp /> Заменить из JSON…
        <ProBadge />
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() => {
          loadPlan(createLandingDemoPlan());
          toast('Пример загружен заново', { description: 'Отменить — Ctrl+Z' });
        }}
      >
        <Sparkles /> Начать с примера
      </DropdownMenuItem>
    </>
  );
}

/** The way into an account: the registration, the plan on screen goes along. */
function SaveButton() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      className="ml-1.5 h-9 gap-1.5 rounded-full px-3"
      disabled={busy}
      data-track="demo_save"
      onClick={async () => {
        setBusy(true);
        try {
          const { to, state } = await demoAccountLink('register');
          navigate(to, { state });
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Spinner /> : <Save className={ICON} />}
      <span>Сохранить</span>
      <span className="hidden lg:inline">схему</span>
    </Button>
  );
}
