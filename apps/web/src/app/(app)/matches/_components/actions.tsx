'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Sparkles, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { confirmMatch, refreshMatchSuggestions, rejectMatch } from '@/server/actions/matches';

export function RefreshButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await refreshMatchSuggestions({});
          if (!r.ok) toast.error(r.error.message);
          else {
            toast.success(`Generated ${r.data.suggested} suggestion(s)`);
            router.refresh();
          }
        })
      }
    >
      <Sparkles className="mr-1 h-4 w-4" /> {pending ? 'Generating…' : 'Generate suggestions'}
    </Button>
  );
}

export function DecisionButtons({ matchId, disabled }: { matchId: string; disabled?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  function decide(action: 'confirm' | 'reject') {
    start(async () => {
      const r = action === 'confirm' ? await confirmMatch({ matchId }) : await rejectMatch({ matchId });
      if (!r.ok) toast.error(r.error.message);
      else router.refresh();
    });
  }
  return (
    <div className="flex justify-end gap-1">
      <Button size="sm" variant="ghost" disabled={pending || disabled} onClick={() => decide('reject')}>
        <X className="h-4 w-4" />
      </Button>
      <Button size="sm" disabled={pending || disabled} onClick={() => decide('confirm')}>
        <Check className="h-4 w-4" />
      </Button>
    </div>
  );
}
