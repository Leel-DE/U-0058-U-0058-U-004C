import { AutomationMonitor } from './_components/automation-monitor';

export const dynamic = 'force-dynamic';

export default function AutomationPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-balance text-2xl font-semibold tracking-tight">Automation Core</h1>
        <p className="text-muted-foreground max-w-[72ch] text-pretty text-base sm:text-sm">
          Automation Hub supervises every browser operation in one local runtime. Closing this
          window keeps the tray application, durable queue and adaptive scheduler online.
        </p>
      </header>
      <AutomationMonitor />
    </div>
  );
}
