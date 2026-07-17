import { AutomationMonitor } from './_components/automation-monitor';
import { AutomationSettingsForm } from './_components/automation-settings-form';
import { getContext } from '@/lib/auth';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export default async function AutomationPage() {
  const ctx = await getContext();
  const settingsRows = await db()
    .select()
    .from(schema.automationSettings)
    .where(eq(schema.automationSettings.orgId, ctx.orgId))
    .limit(1);
  const settings = settingsRows[0];
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-balance text-2xl font-semibold tracking-tight">Automation Core</h1>
        <p className="text-muted-foreground max-w-[72ch] text-pretty text-base sm:text-sm">
          Automation Hub supervises every browser operation in one local runtime. Closing this
          window keeps the tray application, durable queue and adaptive scheduler online.
        </p>
      </header>
      <AutomationSettingsForm
        initialValue={{
          enabled: settings?.enabled ?? true,
          competitorIntervalMinutes: settings?.competitorIntervalMinutes ?? 1440,
          maxConcurrentJobs: settings?.maxConcurrentJobs ?? 1,
        }}
        canManage={ctx.role !== 'viewer'}
      />
      <AutomationMonitor canStop={ctx.role !== 'viewer'} canDelete={ctx.role === 'owner'} />
    </div>
  );
}
