'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { openCaptchaBrowser, resumeCaptchaJob } from '@/server/actions/shipments';

export function ResumeButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await openCaptchaBrowser({ jobId });
              if (!result.ok) setError(result.error.message);
            })
          }
        >
          <ExternalLink className="h-4 w-4" />
          Открыть окно CAPTCHA
        </Button>
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await resumeCaptchaJob({ jobId });
              if (!result.ok) {
                setError(result.error.message);
                return;
              }
              router.refresh();
            })
          }
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ShieldCheck className="h-4 w-4" />
          )}
          Я прошёл CAPTCHA — продолжить
        </Button>
      </div>
      {error ? (
        <p className="text-destructive max-w-md text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
