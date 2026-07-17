import type { SupabaseClient } from '@supabase/supabase-js';
import type { BrowserAutomationJob } from '@cr/shared';
import type { RuntimeLogEntry } from './types.js';

export class RuntimeLogger {
  constructor(private readonly client: SupabaseClient) {}

  async write(job: BrowserAutomationJob, entry: RuntimeLogEntry) {
    const safeMetadata = entry.metadata
      ? JSON.parse(JSON.stringify(entry.metadata).slice(0, 5_000))
      : {};
    const { error } = await this.client.from('automation_job_events').insert({
      org_id: job.orgId,
      job_id: job.id,
      level: entry.level,
      event: entry.event.slice(0, 100),
      message: entry.message.slice(0, 500),
      progress: entry.progress ?? null,
      metadata_json: safeMetadata,
    });
    if (error) throw error;
  }
}
