'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const STEPS = [
  'Detecting domain',
  'Detecting store name',
  'Checking robots.txt',
  'Detecting rendering strategy',
  'Detecting framework',
  'Detecting category pages',
  'Detecting product pages',
  'Detecting product cards',
  'Detecting selectors',
  'Detecting pagination',
  'Detecting anti-bot signals',
  'Running validation',
];

export function StoreAnalysisProgress({ active }: { active: boolean }) {
  const [completed, setCompleted] = useState(0);

  useEffect(() => {
    if (!active) return;
    setCompleted(0);
    const timer = window.setInterval(() => {
      setCompleted((value) => Math.min(STEPS.length - 1, value + 1));
    }, 650);
    return () => window.clearInterval(timer);
  }, [active]);

  return (
    <div className="rounded-md border bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <div className="font-medium">Analyzing store...</div>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {STEPS.map((step, index) => {
          const done = index <= completed;
          return (
            <div key={step} className="flex items-center gap-2 text-sm">
              <CheckCircle2 className={cn('h-4 w-4', done ? 'text-success' : 'text-muted-foreground/40')} />
              <span className={done ? 'text-foreground' : 'text-muted-foreground'}>{step}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
