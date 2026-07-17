import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { BrowserAutomationJob } from '@cr/shared';

interface RemoteRun {
  id: string;
  shipment_id: string;
}
interface RemoteShipment {
  id: string;
  tracking_number: string;
  tracking_enabled?: boolean;
}

export class TorqueCoreShipmentBridge {
  private remote: SupabaseClient | null = null;
  private timer: NodeJS.Timeout | null = null;
  private syncing = false;
  private orgId: string | null = null;
  private lastSyncAt: string | null = null;
  private lastError: string | null = null;

  constructor(private readonly local: SupabaseClient) {
    const url = process.env.TORQUECORE_SUPABASE_URL?.trim();
    const key = process.env.TORQUECORE_SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (url && key)
      this.remote = createClient(url, key, {
        auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
      });
  }

  async start() {
    if (!this.remote) return;
    this.orgId =
      process.env.TORQUECORE_AUTOMATION_ORG_ID?.trim() || (await this.firstOrganizationId());
    if (!this.orgId) {
      this.lastError = 'No local organization is available for TorqueCore shipments.';
      return;
    }
    await this.sync();
    this.timer = setInterval(
      () => void this.sync(),
      Math.max(5_000, Number(process.env.TORQUECORE_BRIDGE_POLL_MS ?? 10_000)),
    );
    this.timer.unref();
  }

  async stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async firstOrganizationId() {
    const { data, error } = await this.local
      .from('organizations')
      .select('id')
      .order('created_at')
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data?.id ? String(data.id) : null;
  }

  private async sync() {
    if (!this.remote || !this.orgId || this.syncing) return;
    this.syncing = true;
    try {
      const { data: remoteShipments, error: shipmentError } = await this.remote
        .from('shipments')
        .select('id, tracking_number, tracking_enabled')
        .eq('tracking_enabled', true)
        .limit(500);
      if (shipmentError) throw shipmentError;
      const localByRemoteId = new Map<string, string>();
      for (const remoteShipment of (remoteShipments ?? []) as RemoteShipment[]) {
        const localId = await this.importShipment(remoteShipment);
        localByRemoteId.set(remoteShipment.id, localId);
      }

      const { data: runs, error: runError } = await this.remote
        .from('shipment_tracking_runs')
        .select('id, shipment_id')
        .eq('status', 'queued')
        .order('created_at')
        .limit(25);
      if (runError) throw runError;
      for (const run of (runs ?? []) as RemoteRun[]) {
        const remoteShipment = (remoteShipments ?? []).find(
          (shipment) => shipment.id === run.shipment_id,
        ) as RemoteShipment | undefined;
        if (!remoteShipment) continue;
        const localShipmentId =
          localByRemoteId.get(run.shipment_id) ?? (await this.importShipment(remoteShipment));
        const { error: queueError } = await this.local.from('automation_jobs').insert({
          org_id: this.orgId,
          type: 'shipment_tracking',
          priority: 'critical',
          payload_json: {
            inputVersion: 1,
            shipmentId: localShipmentId,
            trackingNumber: remoteShipment.tracking_number,
            externalShipmentId: remoteShipment.id,
            externalRunId: run.id,
            manualContinuation: true,
          },
          dedupe_key: `torquecore-run:${run.id}`,
        });
        if (queueError?.code !== '23505' && queueError) throw queueError;
        if (!queueError) {
          await this.remote
            .from('shipment_tracking_runs')
            .update({
              status: 'running',
              started_at: new Date().toISOString(),
              error_summary: null,
            })
            .eq('id', run.id)
            .eq('status', 'queued');
        }
      }
      this.lastSyncAt = new Date().toISOString();
      this.lastError = null;
    } catch (error) {
      this.lastError =
        error instanceof Error ? error.message.slice(0, 300) : 'Unknown TorqueCore bridge error';
    } finally {
      this.syncing = false;
    }
  }

  private async importShipment(shipment: RemoteShipment) {
    const trackingNumber = shipment.tracking_number.replace(/\s+/g, '').toUpperCase();
    const { data: existing, error: findError } = await this.local
      .from('shipments')
      .select('id, metadata_json')
      .eq('org_id', this.orgId!)
      .eq('tracking_number', trackingNumber)
      .maybeSingle();
    if (findError) throw findError;
    if (existing) return String(existing.id);
    const { data, error } = await this.local
      .from('shipments')
      .insert({
        id: shipment.id,
        org_id: this.orgId,
        tracking_number: trackingNumber,
        display_name: 'TorqueCore shipment',
        tracking_enabled: shipment.tracking_enabled ?? true,
        metadata_json: { torquecoreShipmentId: shipment.id },
      })
      .select('id')
      .single();
    if (error) throw error;
    return String(data.id);
  }

  async pushResult(job: BrowserAutomationJob, result: Record<string, unknown>) {
    if (!this.remote || job.type !== 'shipment_tracking') return;
    const externalShipmentId =
      typeof job.payload.externalShipmentId === 'string'
        ? job.payload.externalShipmentId
        : String(result.shipmentId);
    const externalRunId =
      typeof job.payload.externalRunId === 'string' ? job.payload.externalRunId : null;
    const status = String(result.status ?? 'unknown');
    const checkedAt = String(result.checkedAt ?? new Date().toISOString());
    if (result.manualActionRequired === 'captcha' || result.preserveLastConfirmed === true) {
      if (externalRunId) {
        await this.remote
          .from('shipment_tracking_runs')
          .update({
            status: 'partial',
            source_results: Array.isArray(result.providers) ? result.providers : [],
            error_summary:
              result.manualActionRequired === 'captcha'
                ? 'Local browser is waiting for manual CAPTCHA confirmation.'
                : 'No provider returned confirmed tracking data; the last confirmed status was preserved.',
            completed_at: checkedAt,
          })
          .eq('id', externalRunId)
          .eq('shipment_id', externalShipmentId);
      }
      return;
    }
    await this.remote
      .from('shipments')
      .update({
        current_status: status === 'info_received' ? 'registered' : status,
        last_provider_event: result.title ?? null,
        last_checked_at: checkedAt,
        provider_data_fetched_at: checkedAt,
        delivered_at: status === 'delivered' ? checkedAt : null,
      })
      .eq('id', externalShipmentId);
    if (externalRunId) {
      const providers = Array.isArray(result.providers) ? result.providers : [];
      await this.remote
        .from('shipment_tracking_runs')
        .update({
          status: providers.some(
            (provider) => (provider as Record<string, unknown>).state === 'success',
          )
            ? 'succeeded'
            : 'partial',
          source_results: providers,
          ai_presentation: {
            displayStatus: status,
            headline: result.title,
            summary: result.description,
            carrier: result.carrier ?? null,
            origin: null,
            destination: null,
            latestLocation: result.location ?? null,
            latestEvent: result.title ?? null,
            latestEventAt: checkedAt,
            nextStep: null,
            needsAttention: ['exception', 'returned'].includes(status),
            confidence: result.confidence ?? 0,
            factsUsed: [],
            language: 'ru',
          },
          error_summary: null,
          completed_at: checkedAt,
        })
        .eq('id', externalRunId)
        .eq('shipment_id', externalShipmentId);
    }
  }

  status() {
    return {
      enabled: Boolean(this.remote),
      lastSyncAt: this.lastSyncAt,
      lastError: this.lastError,
    };
  }
}
