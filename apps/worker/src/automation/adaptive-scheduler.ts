import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * When the operator pinned a fixed interval on the shipment
 * (check_interval_override_minutes), it wins. Otherwise the interval adapts to
 * the current status: hot statuses are checked often, settled ones rarely.
 */
export function nextShipmentCheck(
  status: string,
  overrideMinutes?: number | null,
  now = Date.now(),
) {
  const override = Number(overrideMinutes);
  if (Number.isFinite(override) && override >= 15) {
    const minutes = Math.min(10_080, Math.round(override));
    return { minutes, at: new Date(now + minutes * 60_000) };
  }
  const minutes =
    status === 'out_for_delivery'
      ? 30
      : status === 'exception' || status === 'customs'
        ? 60
        : status === 'in_transit'
          ? 180
          : status === 'info_received'
            ? 360
            : status === 'delivered' || status === 'returned'
              ? 10_080
              : 720;
  return { minutes, at: new Date(now + minutes * 60_000) };
}

/**
 * Pick which finished shipment jobs to delete: for every shipment (grouped by
 * dedupe_key) keep the newest `keepPerShipment` terminal jobs and drop the
 * rest, so the job list always shows fresh history instead of piling up.
 * Pure so the retention contract is unit-tested.
 */
export function selectPrunableJobIds(
  rows: Array<{ id: string; dedupe_key: string | null; created_at: string }>,
  keepPerShipment: number,
): string[] {
  const byKey = new Map<string, Array<{ id: string; created_at: string }>>();
  for (const row of rows) {
    const key = row.dedupe_key ?? `job:${row.id}`;
    const list = byKey.get(key) ?? [];
    list.push({ id: row.id, created_at: row.created_at });
    byKey.set(key, list);
  }
  const prunable: string[] = [];
  for (const list of byKey.values()) {
    list.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    for (const row of list.slice(Math.max(0, keepPerShipment))) prunable.push(row.id);
  }
  return prunable;
}

export class AdaptiveScheduler {
  constructor(private readonly client: SupabaseClient) {}

  async enqueueDueShipments(limit = 25) {
    const now = new Date().toISOString();
    const { data: enabledSettings, error: settingsError } = await this.client
      .from('automation_settings')
      .select('org_id')
      .eq('enabled', true);
    if (settingsError) throw settingsError;
    const enabledOrgIds = (enabledSettings ?? []).map((settings) => settings.org_id);
    if (enabledOrgIds.length === 0) return 0;
    const { data, error } = await this.client
      .from('shipments')
      .select(
        'id, org_id, tracking_number, respect_robots_txt, force_javascript, use_ai, use_manual_captcha',
      )
      .in('org_id', enabledOrgIds)
      .eq('tracking_enabled', true)
      .lte('next_check_at', now)
      .order('next_check_at', { ascending: true })
      .limit(limit);
    if (error) throw error;
    let queued = 0;
    for (const shipment of data ?? []) {
      const { error: insertError } = await this.client.from('automation_jobs').insert({
        org_id: shipment.org_id,
        type: 'shipment_tracking',
        priority: 'normal',
        payload_json: {
          inputVersion: 1,
          shipmentId: shipment.id,
          trackingNumber: shipment.tracking_number,
          respectRobotsTxt: shipment.respect_robots_txt,
          forceJavaScript: shipment.force_javascript,
          useAi: shipment.use_ai,
          manualContinuation: shipment.use_manual_captcha,
        },
        dedupe_key: `shipment:${shipment.id}`,
      });
      if (insertError?.code === '23505') continue;
      if (insertError) throw insertError;
      queued += 1;
    }
    return queued;
  }

  /**
   * Delete old finished shipment jobs, keeping the newest `keepPerShipment`
   * per shipment. dead_letter jobs are preserved — they have their own page
   * and represent unresolved failures. Events/artifacts cascade via FKs.
   */
  async pruneFinishedShipmentJobs(keepPerShipment = 3) {
    const { data, error } = await this.client
      .from('automation_jobs')
      .select('id, dedupe_key, created_at, payload_json')
      .eq('type', 'shipment_tracking')
      .in('status', ['succeeded', 'partial', 'failed', 'cancelled'])
      .order('created_at', { ascending: false })
      .limit(1_000);
    if (error) throw error;
    // Group by the shipment itself, not the dedupe key: bridge-mirrored runs
    // carry a unique torquecore-run:<id> key each, which would otherwise make
    // every one of them its own group and exempt them from pruning.
    const rows = (data ?? []).map((job) => {
      const payload = (job.payload_json ?? {}) as Record<string, unknown>;
      const shipmentId = typeof payload.shipmentId === 'string' ? payload.shipmentId : null;
      return {
        id: String(job.id),
        dedupe_key: shipmentId ? `shipment:${shipmentId}` : ((job.dedupe_key as string | null) ?? null),
        created_at: String(job.created_at),
      };
    });
    const prunable = selectPrunableJobIds(rows, keepPerShipment);
    if (prunable.length === 0) return 0;
    const { error: deleteError } = await this.client
      .from('automation_jobs')
      .delete()
      .in('id', prunable);
    if (deleteError) throw deleteError;
    return prunable.length;
  }
}
