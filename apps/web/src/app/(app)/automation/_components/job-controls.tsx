'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { Result } from '@cr/shared';
import { ConfirmationDialog } from '@/components/confirmation-dialog';
import {
  cancelAllAutomationJobs,
  cancelAutomationJob,
  deleteAutomationJob,
  deleteAllAutomationJobs,
} from '@/server/actions/automation';

function actionData<T>(result: Result<T>) {
  if (!result.ok) throw new Error(result.error.message ?? 'The action failed. Try again.');
  return result.data;
}

export function QueueControls({
  activeCount,
  totalCount,
  canStop,
  canDelete,
  automationEnabled = true,
  onChanged,
}: {
  activeCount: number;
  totalCount: number;
  canStop: boolean;
  canDelete: boolean;
  automationEnabled?: boolean;
  onChanged?: () => void;
}) {
  const router = useRouter();
  function refresh() {
    router.refresh();
    onChanged?.();
  }
  return (
    <div className="grid justify-items-start gap-2 sm:justify-items-end">
      <div className="flex flex-wrap gap-2">
        {canStop ? (
          <ConfirmationDialog
            triggerLabel="Pause & Stop All"
            title="Pause Automation & Stop All Jobs"
            description={`This pauses scheduled work for this organization and stops ${activeCount} running, queued, or CAPTCHA-paused job${activeCount === 1 ? '' : 's'}. Running browser contexts close immediately. Completed history is kept.`}
            confirmLabel="Pause & Stop All"
            confirmationText="PAUSE AUTOMATION"
            disabled={!automationEnabled && activeCount === 0}
            onConfirm={async () => {
              const result = await cancelAllAutomationJobs({ confirmation: 'PAUSE AUTOMATION' });
              actionData(result);
              toast('Automation paused and active jobs stopped');
              refresh();
            }}
          />
        ) : null}
        {canDelete ? (
          <ConfirmationDialog
            triggerLabel="Delete All Jobs"
            title="Delete All Jobs"
            description="This permanently deletes every completed job and its event history. Stop active jobs first. This cannot be undone."
            confirmLabel="Delete All Jobs"
            confirmationText="DELETE ALL JOBS"
            disabled={totalCount === 0 || activeCount > 0}
            onConfirm={async () => {
              const result = await deleteAllAutomationJobs({ confirmation: 'DELETE ALL JOBS' });
              const data = actionData(result);
              if (data.blocked) throw new Error('Stop active jobs before deleting job history.');
              toast(`${data.deleted} jobs deleted`);
              refresh();
            }}
          />
        ) : null}
      </div>
      {canDelete && activeCount > 0 ? (
        <p className="text-muted-foreground text-pretty text-base sm:text-sm">
          Stop active jobs before deleting job history.
        </p>
      ) : null}
      {!automationEnabled ? (
        <p className="text-muted-foreground text-pretty text-base sm:text-sm">
          Scheduled automation is paused for this organization.
        </p>
      ) : null}
    </div>
  );
}

export function CancelJobControl({ jobId, onChanged }: { jobId: string; onChanged?: () => void }) {
  const router = useRouter();
  return (
    <ConfirmationDialog
      triggerLabel="Stop Job"
      title="Stop Job"
      description="This cancels the queued job or closes its running browser context. Existing completed results are kept."
      confirmLabel="Stop Job"
      onConfirm={async () => {
        const result = await cancelAutomationJob({ jobId });
        actionData(result);
        toast('Job stopped');
        router.refresh();
        onChanged?.();
      }}
    />
  );
}

export function DeleteJobControl({ jobId }: { jobId: string }) {
  const router = useRouter();
  return (
    <ConfirmationDialog
      triggerLabel="Delete Job"
      title="Delete Job"
      description="This permanently deletes the job, its progress events, and stored provider results. This cannot be undone."
      confirmLabel="Delete Job"
      onConfirm={async () => {
        const result = await deleteAutomationJob({ jobId });
        const data = actionData(result);
        if (data.deleted === 0) throw new Error('Stop this job before deleting it.');
        toast('Job deleted');
        router.push('/jobs');
        router.refresh();
      }}
    />
  );
}
