import type { SupabaseClient } from '@supabase/supabase-js';
import type { BrowserAutomationJob } from '@cr/shared';

export class CompetitionResultStore {
  constructor(private readonly client: SupabaseClient) {}

  async record(job: BrowserAutomationJob, succeeded: boolean) {
    const productId =
      typeof job.payload.competitorProductId === 'string' ? job.payload.competitorProductId : null;
    if (productId) {
      const { data: settings, error: settingsError } = await this.client
        .from('automation_settings')
        .select('competitor_interval_minutes')
        .eq('org_id', job.orgId)
        .maybeSingle();
      if (settingsError) throw settingsError;
      const intervalMinutes = Number(settings?.competitor_interval_minutes ?? 1440);
      const { error: scheduleError } = await this.client
        .from('competitor_products')
        .update({
          next_run_at: new Date(Date.now() + intervalMinutes * 60_000).toISOString(),
        })
        .eq('id', productId)
        .eq('org_id', job.orgId);
      if (scheduleError) throw scheduleError;
    }

    const runId = typeof job.payload.scrapeRunId === 'string' ? job.payload.scrapeRunId : null;
    if (!runId) return;
    const { data: run, error } = await this.client
      .from('scrape_runs')
      .select('products_total, products_ok, products_failed, started_at')
      .eq('id', runId)
      .eq('org_id', job.orgId)
      .maybeSingle();
    if (error) throw error;
    if (!run) return;
    const ok = Number(run.products_ok) + (succeeded ? 1 : 0);
    const failed = Number(run.products_failed) + (succeeded ? 0 : 1);
    const finished = ok + failed >= Number(run.products_total);
    const { error: updateError } = await this.client
      .from('scrape_runs')
      .update({
        status: finished ? (failed === 0 ? 'success' : ok > 0 ? 'partial' : 'failed') : 'running',
        started_at: run.started_at ?? new Date().toISOString(),
        finished_at: finished ? new Date().toISOString() : null,
        products_ok: ok,
        products_failed: failed,
      })
      .eq('id', runId)
      .eq('org_id', job.orgId);
    if (updateError) throw updateError;
  }
}
