'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { toggleAlertRule } from '@/server/actions/alerts';

export function RuleToggle({ id, active, disabled }: { id: string; active: boolean; disabled?: boolean }) {
  const router = useRouter();
  const [, start] = useTransition();
  return (
    <Switch
      disabled={disabled}
      checked={active}
      onCheckedChange={(v) =>
        start(async () => {
          const r = await toggleAlertRule({ id, active: v });
          if (!r.ok) toast.error(r.error.message);
          else router.refresh();
        })
      }
    />
  );
}
