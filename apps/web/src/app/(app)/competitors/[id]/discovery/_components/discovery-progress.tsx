'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { SkipForward } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  cancelSiteDiscovery,
  getSiteDiscoveryLogs,
  getSiteDiscoveryStatus,
  pauseSiteDiscovery,
  resumeSiteDiscovery,
  skipCurrentDiscoveryProduct,
} from '@/server/actions/discovery';

interface Status {
  status?: string;
  pagesDiscovered?: number;
  pagesCrawled?: number;
  categoriesFound?: number;
  productsFound?: number;
  errorsCount?: number;
  queueLength?: number;
  manualSession?: { status?: string; logs?: string[] } | null;
  manualItem?: { url?: string; depth?: number; discoveredFrom?: string } | null;
}

export function DiscoveryProgress({ storeId, runId }: { storeId: string; runId: string }) {
  const [status, setStatus] = useState<Status>({});
  const [logs, setLogs] = useState<Array<Record<string, unknown>>>([]);
  const [pending, startTransition] = useTransition();
  const terminal = useMemo(() => ['success', 'partial', 'failed', 'cancelled'].includes(String(status.status)), [status.status]);

  const refresh = useCallback(async () => {
    const [s, l] = await Promise.all([
      getSiteDiscoveryStatus({ storeId, runId }),
      getSiteDiscoveryLogs({ storeId, runId }),
    ]);
    if (s.ok && s.data) setStatus(s.data as Status);
    if (l.ok) setLogs(l.data);
  }, [storeId, runId]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => {
      void refresh();
    }, terminal ? 10000 : 2000);
    return () => window.clearInterval(id);
  }, [terminal, refresh]);

  function control(action: 'pause' | 'resume' | 'skip' | 'cancel') {
    startTransition(async () => {
      const fn =
        action === 'pause'
          ? pauseSiteDiscovery
          : action === 'resume'
            ? resumeSiteDiscovery
            : action === 'skip'
              ? skipCurrentDiscoveryProduct
              : cancelSiteDiscovery;
      const res = await fn({ storeId, runId });
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      if (action === 'skip') toast.success('Product skipped');
      await refresh();
    });
  }

  const progress = status.pagesDiscovered ? Math.round(((status.pagesCrawled ?? 0) / status.pagesDiscovered) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-5">
        <Metric label="Status" value={<Badge>{status.status ?? 'loading'}</Badge>} />
        <Metric label="Pages" value={`${status.pagesCrawled ?? 0}/${status.pagesDiscovered ?? 0}`} />
        <Metric label="Categories" value={status.categoriesFound ?? 0} />
        <Metric label="Products" value={status.productsFound ?? 0} />
        <Metric label="Errors" value={status.errorsCount ?? 0} />
      </div>
      <div className="h-2 rounded bg-muted">
        <div className="h-2 rounded bg-primary" style={{ width: `${Math.min(100, progress)}%` }} />
      </div>

      {status.status === 'manual_action_required' ? (
        <div className="rounded-md border border-amber-400/40 bg-amber-500/10 p-4 text-sm">
          <div className="flex items-center justify-between">
            <div className="font-medium">Manual captcha action required</div>
            {status.manualSession?.status ? (
              <Badge variant="outline">session: {status.manualSession.status}</Badge>
            ) : null}
          </div>
          <p className="mt-1 text-muted-foreground">
            A local browser window should have opened. Complete the challenge there, then resume discovery.
          </p>
          {status.manualItem?.url ? (
            <div className="mt-2 break-all rounded border border-amber-400/30 bg-background/60 px-2 py-1 text-xs text-muted-foreground">
              {status.manualItem.url}
            </div>
          ) : null}
          {status.manualSession?.logs?.length ? (
            <div className="mt-3 max-h-32 overflow-auto rounded border border-amber-400/30 bg-background/60 p-2 font-mono text-xs text-muted-foreground">
              {status.manualSession.logs.slice(-6).map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => control('resume')} disabled={pending}>
              Continue after captcha
            </Button>
            <Button variant="outline" onClick={() => control('skip')} disabled={pending}>
              <SkipForward className="mr-2 h-4 w-4" />
              Skip product
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => control('pause')} disabled={pending || terminal}>
          Pause
        </Button>
        <Button variant="outline" onClick={() => control('resume')} disabled={pending || terminal}>
          Resume
        </Button>
        <Button variant="destructive" onClick={() => control('cancel')} disabled={pending || terminal}>
          Cancel
        </Button>
        <Button asChild>
          <Link href={`/competitors/${storeId}/discovery/${runId}/report`}>Open report</Link>
        </Button>
      </div>

      <div className="rounded-md border">
        <div className="border-b px-3 py-2 text-sm font-medium">Live logs</div>
        <div className="max-h-96 space-y-1 overflow-auto p-3 font-mono text-xs">
          {logs.length === 0 ? <div className="text-muted-foreground">No logs yet.</div> : null}
          {logs.map((log, index) => {
            const ctx = log.context as Record<string, unknown> | undefined;
            const showCtx = (log.level === 'error' || log.level === 'warn') && ctx && Object.keys(ctx).length > 0;
            return (
              <div key={index} className={log.level === 'error' ? 'text-destructive' : log.level === 'warn' ? 'text-amber-500' : 'text-muted-foreground'}>
                <div>
                  {String(log.createdAt ?? '')} [{String(log.level ?? 'info')}] {String(log.message ?? '')}
                </div>
                {showCtx ? (
                  <div className="ml-6 opacity-70 whitespace-pre-wrap break-all">
                    {JSON.stringify(ctx, null, 2)}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}
