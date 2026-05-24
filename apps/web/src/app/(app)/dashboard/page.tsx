import { Suspense } from 'react';
import { getContext } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { DashboardKpis } from './_components/kpis';
import { TopMovers } from './_components/top-movers';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const ctx = await getContext();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Overview of competitor activity across your organization.
        </p>
      </header>

      <Suspense fallback={<KpiSkeleton />}>
        <DashboardKpis orgId={ctx.orgId} />
      </Suspense>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Biggest price drops · 7 days</CardTitle>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<Skeleton className="h-40 w-full" />}>
              <TopMovers orgId={ctx.orgId} direction="down" />
            </Suspense>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Biggest price increases · 7 days</CardTitle>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<Skeleton className="h-40 w-full" />}>
              <TopMovers orgId={ctx.orgId} direction="up" />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full" />
      ))}
    </div>
  );
}
