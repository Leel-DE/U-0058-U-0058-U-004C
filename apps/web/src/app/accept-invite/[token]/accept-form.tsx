'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/form-message';
import { acceptInvitation } from '@/server/actions/org';
import { useState } from 'react';

export function AcceptForm({ token }: { token: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function accept() {
    start(async () => {
      setError(null);
      const r = await acceptInvitation({ token });
      if (!r.ok) {
        setError(r.error.message);
        return;
      }
      toast.success('Invitation accepted');
      router.replace('/dashboard');
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <Button className="w-full" disabled={pending} onClick={accept}>
        {pending ? 'Accepting…' : 'Accept invitation'}
      </Button>
      <FormError message={error} />
    </div>
  );
}
