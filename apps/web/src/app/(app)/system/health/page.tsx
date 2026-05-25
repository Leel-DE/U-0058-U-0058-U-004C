import { Activity, Bot, Brain, Database, HardDrive, Play, Server } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getSystemHealth, type HealthCheck, type HealthStatus } from '@/server/system/health';

export const dynamic = 'force-dynamic';

const ICONS = {
  db: Database,
  worker: Server,
  inngest: Bot,
  storage: HardDrive,
  playwright: Play,
  ai: Brain,
};

function variant(status: HealthStatus) {
  if (status === 'ok') return 'success';
  if (status === 'degraded') return 'warning';
  return 'destructive';
}

function HealthCard({ check }: { check: HealthCheck }) {
  const Icon = ICONS[check.service as keyof typeof ICONS] ?? Activity;
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="capitalize">{check.service}</CardTitle>
        </div>
        <Badge variant={variant(check.status)}>{check.status}</Badge>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">{check.message ?? 'No message'}</p>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span>Latency: {check.latencyMs == null ? 'n/a' : `${check.latencyMs}ms`}</span>
        </div>
        {check.metadata ? (
          <pre className="max-h-48 overflow-auto rounded-md bg-muted p-3 text-xs">
            {JSON.stringify(check.metadata, null, 2)}
          </pre>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default async function SystemHealthPage() {
  const health = await getSystemHealth();
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">System health</h1>
          <p className="text-sm text-muted-foreground">Runtime checks for local services and dependencies.</p>
        </div>
        <Badge variant={variant(health.status)}>{health.status}</Badge>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        {health.checks.map((check) => (
          <HealthCard key={check.service} check={check} />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Checked at {new Date(health.checkedAt).toLocaleString()}</p>
    </div>
  );
}
