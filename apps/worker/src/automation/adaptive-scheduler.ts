import type { SupabaseClient } from '@supabase/supabase-js';

export function nextShipmentCheck(status: string, now = Date.now()) {
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

export class AdaptiveScheduler {
  constructor(private readonly client: SupabaseClient) {}

  async enqueueDueShipments(limit = 25) {
    const now = new Date().toISOString();
    const { data, error } = await this.client
      .from('shipments')
      .select('id, org_id, tracking_number')
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
          manualContinuation: true,
        },
        dedupe_key: `shipment:${shipment.id}`,
      });
      if (insertError?.code === '23505') continue;
      if (insertError) throw insertError;
      queued += 1;
    }
    return queued;
  }
}
