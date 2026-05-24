import { eq } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getContext } from '@/lib/auth';
import { db, schema } from '@/lib/db';

export default async function GeneralSettingsPage() {
  const ctx = await getContext();
  const rows = await db().select().from(schema.organizations).where(eq(schema.organizations.id, ctx.orgId)).limit(1);
  const org = rows[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Organization</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <Row label="Name" value={org?.name ?? '—'} />
        <Row label="Slug" value={org?.slug ?? '—'} />
        <Row label="Plan" value={org?.plan ?? 'free'} />
        <Row label="Your role" value={ctx.role} />
        <Row label="Created" value={org?.createdAt ? new Date(org.createdAt).toLocaleString() : '—'} />
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b py-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
