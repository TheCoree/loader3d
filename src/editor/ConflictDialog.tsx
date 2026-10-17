import { useState } from 'react';
import { CloudDownload, Save } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { keepLocalVersion, loadServerVersion, usePlanSync } from './planSync';

/** The plan was saved elsewhere (another tab or device) since the editor loaded it. */
export function ConflictDialog() {
  const open = usePlanSync((s) => s.status === 'conflict');
  const [busy, setBusy] = useState<'local' | 'server' | null>(null);

  const run = async (kind: 'local' | 'server') => {
    setBusy(kind);
    try {
      if (kind === 'local') await keepLocalVersion();
      else await loadServerVersion();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Схему изменили в другом месте</AlertDialogTitle>
          <AlertDialogDescription>
            Пока вы работали, эту схему сохранили в другой вкладке или на другом устройстве. Какую версию оставить?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" disabled={busy !== null} onClick={() => void run('server')}>
            {busy === 'server' ? <Spinner /> : <CloudDownload />}
            Загрузить сохранённую
          </Button>
          <Button disabled={busy !== null} onClick={() => void run('local')}>
            {busy === 'local' ? <Spinner /> : <Save />}
            Оставить мою
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
