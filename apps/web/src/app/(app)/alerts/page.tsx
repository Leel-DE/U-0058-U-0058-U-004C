import Link from 'next/link';
import { Plus, Bell } from 'lucide-react';
import { and, desc, eq } from 'drizzle-orm';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { EmptyState } from '@/components/ui/empty-state';
import { db, schema } from '@/lib/db';
import { getContext } from '@/lib/auth';
import { timeAgo } from '@/lib/utils';
import { RuleToggle } from './_components/rule-toggle';

export const dynamic = 'force-dynamic';

export default async function AlertsPage() {
  const ctx = await getContext();
  const [rules, notifications] = await Promise.all([
    db()
      .select()
      .from(schema.alertRules)
      .where(eq(schema.alertRules.orgId, ctx.orgId))
      .orderBy(desc(schema.alertRules.createdAt)),
    db()
      .select()
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.orgId, ctx.orgId),
          eq(schema.notifications.userId, ctx.user.id),
        ),
      )
      .orderBy(desc(schema.notifications.createdAt))
      .limit(50),
  ]);

  const canManage = ctx.role !== 'viewer';

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Alerts</h1>
          <p className="text-sm text-muted-foreground">
            Get notified about price drops, increases, stock changes and more.
          </p>
        </div>
        {canManage ? (
          <Button asChild>
            <Link href="/alerts/new"><Plus className="mr-1 h-4 w-4" /> New rule</Link>
          </Button>
        ) : null}
      </header>

      <Tabs defaultValue="feed">
        <TabsList>
          <TabsTrigger value="feed">Feed ({notifications.length})</TabsTrigger>
          <TabsTrigger value="rules">Rules ({rules.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="feed">
          {notifications.length === 0 ? (
            <EmptyState icon={<Bell className="h-8 w-8" />} title="Nothing yet" description="When alerts fire they'll show up here." />
          ) : (
            <Card>
              <CardContent className="p-0">
                <ul className="divide-y">
                  {notifications.map((n) => (
                    <li key={n.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium">{n.title}</div>
                          <div className="mt-0.5 text-sm text-muted-foreground">{n.body}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{timeAgo(n.createdAt)}</span>
                          {!n.readAt ? <Badge variant="secondary">New</Badge> : null}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="rules">
          {rules.length === 0 ? (
            <EmptyState
              icon={<Bell className="h-8 w-8" />}
              title="No alert rules yet"
              description="Create rules to be notified about meaningful changes."
              action={canManage ? <Button asChild><Link href="/alerts/new">Create rule</Link></Button> : null}
            />
          ) : (
            <Card>
              <CardHeader><CardTitle>Active rules</CardTitle></CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2">Name</th>
                      <th className="px-4 py-2">Type</th>
                      <th className="px-4 py-2">Channels</th>
                      <th className="px-4 py-2">Active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map((r) => (
                      <tr key={r.id} className="border-t">
                        <td className="px-4 py-2 font-medium">{r.name}</td>
                        <td className="px-4 py-2 text-muted-foreground">{r.type}</td>
                        <td className="px-4 py-2">
                          {(r.channels as string[]).map((c) => (
                            <Badge key={c} variant="outline" className="mr-1">{c}</Badge>
                          ))}
                        </td>
                        <td className="px-4 py-2">
                          <RuleToggle id={r.id} active={r.active} disabled={!canManage} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
