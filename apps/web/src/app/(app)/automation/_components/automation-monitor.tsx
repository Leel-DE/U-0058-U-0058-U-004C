'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, Bot, Cable as Bridge, Clock3, Cpu, Database } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface RuntimeStatus {
  enabled: boolean;
  state: 'disabled' | 'starting' | 'idle' | 'running' | 'stopping' | 'error';
  activeJobs: string[];
  concurrency: number;
  pollMs: number;
  lastTickAt: string | null;
  lastError: string | null;
  browser: { connected: boolean; mode: string; activeContexts: number };
  torqueCoreBridge: { enabled: boolean; lastSyncAt?: string | null; lastError?: string | null };
}

interface RuntimeEvent {
  id: string;
  job_id: string;
  level: string;
  event: string;
  message: string;
  progress: number | null;
  created_at: string;
}

interface Payload {
  ok: boolean;
  automationHub?: RuntimeStatus;
  events?: RuntimeEvent[];
  message?: string;
}

function formatTime(value?: string | null) {
  return value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'medium' }).format(
        new Date(value),
      )
    : 'Ещё не было';
}

export function AutomationMonitor() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/automation', { cache: 'no-store' });
      const next = (await response.json()) as Payload;
      if (!response.ok || !next.ok || !next.automationHub)
        throw new Error(next.message ?? 'Runtime status is unavailable.');
      setPayload(next);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Runtime status is unavailable.');
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3_000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  const runtime = payload?.automationHub;
  if (!runtime && !error)
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <Clock3 className="h-4 w-4 animate-pulse" />
        Загрузка состояния…
      </p>
    );
  return (
    <div className="space-y-6">
      {error ? (
        <div className="border-destructive/30 bg-destructive/10 flex gap-2 rounded-md border p-4 text-sm">
          <AlertTriangle className="text-destructive h-4 w-4" />
          {error}
        </div>
      ) : null}
      {runtime ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Bot className="text-primary h-5 w-5" />
                <div>
                  <Badge
                    variant={
                      runtime.state === 'idle'
                        ? 'success'
                        : runtime.state === 'error'
                          ? 'destructive'
                          : 'warning'
                    }
                  >
                    {runtime.state}
                  </Badge>
                  <p className="text-muted-foreground mt-1 text-xs">Runtime</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Cpu className="text-primary h-5 w-5" />
                <div>
                  <p className="text-lg font-semibold">
                    {runtime.activeJobs.length}/{runtime.concurrency}
                  </p>
                  <p className="text-muted-foreground text-xs">Активные слоты</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Database className="text-primary h-5 w-5" />
                <div>
                  <p className="text-sm font-medium">{runtime.pollMs / 1000} сек.</p>
                  <p className="text-muted-foreground text-xs">Проверка очереди</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Bridge className="text-primary h-5 w-5" />
                <div>
                  <Badge variant={runtime.torqueCoreBridge.enabled ? 'success' : 'secondary'}>
                    {runtime.torqueCoreBridge.enabled ? 'connected' : 'optional'}
                  </Badge>
                  <p className="text-muted-foreground mt-1 text-xs">TorqueCore bridge</p>
                </div>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Browser Automation Core</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm sm:grid-cols-3">
              <div>
                <p className="text-muted-foreground text-xs">Браузер</p>
                <p>{runtime.browser.connected ? 'Подключён' : 'Ожидает задачу'}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Режим</p>
                <p>{runtime.browser.mode}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Контексты</p>
                <p>{runtime.browser.activeContexts}</p>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Последние события
          </CardTitle>
        </CardHeader>
        <CardContent>
          {payload?.events?.length ? (
            <ol className="space-y-4">
              {[...payload.events].reverse().map((event) => (
                <li key={event.id} className="border-primary/30 border-l-2 pl-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{event.message}</p>
                    <span className="text-muted-foreground text-xs">{event.progress ?? 0}%</span>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {event.event} · {formatTime(event.created_at)}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-muted-foreground text-sm">
              Событий пока нет. Очередь готова принять первую задачу.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
