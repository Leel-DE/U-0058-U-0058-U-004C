import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getContext } from '@/lib/auth';
import { db, schema } from '@/lib/db';
import { AlertRuleForm } from './alert-rule-form';

export default async function NewAlertRulePage() {
  const ctx = await getContext();
  if (ctx.role === 'viewer') redirect('/alerts');

  const [stores, myProducts] = await Promise.all([
    db().select({ id: schema.stores.id, name: schema.stores.name }).from(schema.stores).where(eq(schema.stores.orgId, ctx.orgId)),
    db().select({ id: schema.myProducts.id, name: schema.myProducts.name }).from(schema.myProducts).where(eq(schema.myProducts.orgId, ctx.orgId)),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">New alert rule</h1>
        <p className="text-sm text-muted-foreground">
          We'll evaluate this rule on every new snapshot.
        </p>
      </header>
      <Card>
        <CardHeader><CardTitle>Rule</CardTitle></CardHeader>
        <CardContent>
          <AlertRuleForm stores={stores} myProducts={myProducts} />
        </CardContent>
      </Card>
    </div>
  );
}
