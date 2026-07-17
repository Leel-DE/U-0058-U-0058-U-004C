import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { browserAutomationJobSchema, type BrowserAutomationJob } from '@cr/shared';

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing_environment:${name}`);
  return value;
}

export function createAutomationClient() {
  return createClient(required('NEXT_PUBLIC_SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

export class JobLeaseManager {
  readonly client: SupabaseClient;
  constructor(
    private readonly workerId: string,
    private readonly leaseSeconds = 120,
    client = createAutomationClient(),
  ) {
    this.client = client;
  }

  async claim(): Promise<BrowserAutomationJob | null> {
    const { data, error } = await this.client.rpc('claim_automation_job', {
      p_worker_id: this.workerId,
      p_lease_seconds: this.leaseSeconds,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : null;
    if (!row) return null;
    return browserAutomationJobSchema.parse({
      id: row.id,
      orgId: row.org_id,
      type: row.type,
      priority: row.priority,
      status: row.status,
      payload: row.payload_json,
      attemptCount: row.attempt_count,
      maxAttempts: row.max_attempts,
      leaseToken: row.lease_token,
      inputVersion: row.input_version,
    });
  }

  async heartbeat(job: BrowserAutomationJob, progress?: Record<string, unknown>) {
    const { data, error } = await this.client.rpc('heartbeat_automation_job', {
      p_job_id: job.id,
      p_lease_token: job.leaseToken,
      p_lease_seconds: this.leaseSeconds,
      p_progress: progress ?? null,
    });
    if (error) throw error;
    if (!data) throw new Error('job_lease_lost');
  }

  async complete(
    job: BrowserAutomationJob,
    status: 'succeeded' | 'partial' | 'awaiting_user',
    result: Record<string, unknown>,
  ) {
    const { data, error } = await this.client
      .from('automation_jobs')
      .update({
        status,
        result_json: result,
        progress_json: { progress: 100 },
        error_code: null,
        error_summary: null,
        finished_at: status === 'awaiting_user' ? null : new Date().toISOString(),
        lease_owner: null,
        lease_token: null,
        leased_until: null,
        heartbeat_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id)
      .eq('lease_token', job.leaseToken)
      .eq('status', 'running')
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('job_lease_lost');
  }

  async cancel(job: BrowserAutomationJob) {
    const { error } = await this.client
      .from('automation_jobs')
      .update({
        status: 'cancelled',
        finished_at: new Date().toISOString(),
        error_code: 'cancelled_by_user',
        error_summary: 'The job was stopped by an operator.',
        lease_owner: null,
        lease_token: null,
        leased_until: null,
        heartbeat_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id)
      .eq('lease_token', job.leaseToken)
      .eq('status', 'running');
    if (error) throw error;
  }

  async fail(job: BrowserAutomationJob, error: unknown) {
    const exhausted = job.attemptCount >= job.maxAttempts;
    const message = error instanceof Error ? error.message.slice(0, 300) : 'Unknown worker error';
    const { data, error: updateError } = await this.client
      .from('automation_jobs')
      .update({
        status: exhausted ? 'dead_letter' : 'queued',
        scheduled_at: exhausted
          ? undefined
          : new Date(Date.now() + Math.min(300_000, 15_000 * job.attemptCount)).toISOString(),
        finished_at: exhausted ? new Date().toISOString() : null,
        error_code: exhausted ? 'attempts_exhausted' : 'execution_failed',
        error_summary: message,
        lease_owner: null,
        lease_token: null,
        leased_until: null,
        heartbeat_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id)
      .eq('lease_token', job.leaseToken)
      .select('id')
      .maybeSingle();
    if (updateError) throw updateError;
    if (!data) throw new Error('job_lease_lost');
  }

  async recoverStale() {
    const { data, error } = await this.client.rpc('recover_stale_automation_jobs');
    if (error) throw error;
    return data;
  }
}
