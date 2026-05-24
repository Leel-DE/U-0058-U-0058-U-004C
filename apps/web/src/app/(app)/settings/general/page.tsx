import { eq } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getContext } from '@/lib/auth';
import { db, schema } from '@/lib/db';
import { getAiWorkerStatus } from '@/server/actions/scrape';

export default async function GeneralSettingsPage() {
  const ctx = await getContext();
  const rows = await db().select().from(schema.organizations).where(eq(schema.organizations.id, ctx.orgId)).limit(1);
  const org = rows[0];
  const ai = await getAiWorkerStatus();
  const cache = ai.cache as { hitRate?: number; hits?: number; misses?: number } | undefined;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Organization</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row label="Name" value={org?.name ?? '-'} />
          <Row label="Slug" value={org?.slug ?? '-'} />
          <Row label="Plan" value={org?.plan ?? 'free'} />
          <Row label="Your role" value={ctx.role} />
          <Row label="Created" value={org?.createdAt ? new Date(org.createdAt).toLocaleString() : '-'} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI-assisted scraping</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row label="Provider status" value={ai.enabled ? 'enabled' : 'disabled'} />
          <Row label="Provider" value={String(ai.provider ?? 'gemini')} />
          <Row label="Gemini model" value={String(ai.model ?? 'not configured')} />
          <Row label="Fallback model" value={String(ai.fallbackModel ?? 'not configured')} />
          <Row label="Cache hit rate" value={`${Math.round((cache?.hitRate ?? 0) * 100)}%`} />
          <Row label="Total AI cache requests" value={String((cache?.hits ?? 0) + (cache?.misses ?? 0))} />
          <Row label="Max HTML chars" value={String(ai.maxHtmlChars ?? 60000)} />
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b py-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="break-all text-right font-medium">{value}</span>
    </div>
  );
}
