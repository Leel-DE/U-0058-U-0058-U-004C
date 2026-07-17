import { asc, eq } from 'drizzle-orm';
import { HeartPulse } from 'lucide-react';
import { db, schema } from '@/lib/db';
import { getContext } from '@/lib/auth';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { timeAgo } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export default async function ProviderHealthPage() {
  const ctx = await getContext();
  const providers = await db()
    .select()
    .from(schema.providerHealth)
    .where(eq(schema.providerHealth.orgId, ctx.orgId))
    .orderBy(asc(schema.providerHealth.provider));
  return (
    <div className="space-y-6">
      <header>
        <p className="text-primary text-sm font-medium">Advanced</p>
        <h1 className="text-2xl font-semibold tracking-tight">Provider health</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Стабильность публичных источников, CAPTCHA и время ответа.
        </p>
      </header>
      {providers.length === 0 ? (
        <EmptyState
          icon={<HeartPulse className="h-8 w-8" />}
          title="Телеметрия ещё собирается"
          description="Показатели появятся после первых проверок."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {providers.map((provider) => (
            <Card key={provider.id}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">{provider.provider}</h2>
                  <Badge
                    variant={
                      provider.state === 'healthy'
                        ? 'success'
                        : provider.state === 'degraded'
                          ? 'warning'
                          : 'destructive'
                    }
                  >
                    {provider.state}
                  </Badge>
                </div>
                <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <dt className="text-muted-foreground text-xs">Успешность</dt>
                    <dd className="mt-1 text-lg font-semibold">
                      {Math.round(Number(provider.successRate) * 100)}%
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">CAPTCHA</dt>
                    <dd className="mt-1 text-lg font-semibold">
                      {Math.round(Number(provider.captchaRate) * 100)}%
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">Среднее время</dt>
                    <dd>{provider.avgDurationMs ? `${provider.avgDurationMs} ms` : '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">Последний успех</dt>
                    <dd>{timeAgo(provider.lastSuccessAt)}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
