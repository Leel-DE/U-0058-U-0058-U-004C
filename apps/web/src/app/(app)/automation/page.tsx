import { AutomationMonitor } from './_components/automation-monitor';
import { getContext } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function AutomationPage() {
  const ctx = await getContext();
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-balance text-2xl font-semibold tracking-tight">Automation Core</h1>
        <p className="text-muted-foreground max-w-[72ch] text-pretty text-base sm:text-sm">
          Automation Hub supervises every browser operation in one local runtime. Closing this
          window keeps the tray application, durable queue and adaptive scheduler online.
        </p>
      </header>
      <AutomationMonitor canStop={ctx.role !== 'viewer'} canDelete={ctx.role === 'owner'} />
    </div>
  );
}
