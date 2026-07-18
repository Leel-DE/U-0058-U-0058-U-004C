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
interface LocalShipmentExport {
  id: string;
  tracking_number: string;
  tracking_enabled: boolean | null;
  current_status: string | null;
  last_checked_at: string | null;
  delivered_at: string | null;
  origin_country: string | null;
  destination_country: string | null;
  metadata_json: Record<string, unknown> | null;
}

// TorqueCore accepts a narrower canonical status set than Radar. Map the one
// diverging value and clamp anything unknown so the check constraint holds.
const TORQUECORE_STATUSES = new Set([
  'pending',
  'registered',
  'in_transit',
  'customs',
  'arrived_at_destination',
  'handed_to_local_carrier',
  'out_for_delivery',
  'delivered',
  'exception',
  'delayed',
  'returned',
  'unknown',
]);

function toTorqueCoreStatus(status: string | null | undefined): string {
  if (!status) return 'pending';
  const mapped = status === 'info_received' ? 'registered' : status;
  return TORQUECORE_STATUSES.has(mapped) ? mapped : 'unknown';
}

// TorqueCore stores ISO 3166-1 alpha-2 only; drop anything that is not two
// characters instead of tripping the length check.
function toAlpha2(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().toUpperCase();
  return trimmed.length === 2 ? trimmed : null;
}

// TorqueCore validates every stored source result against a fixed schema and
// rejects unknown shapes. Map Radar's provider evidence into that canonical
// shape (source/checkedAt/statusHint/excerpt/error) and drop sources TorqueCore
// does not know (e.g. Yanwen) so the admin run parser never throws.
const TORQUECORE_SOURCES = new Set([
  'ups',
  'postal_ninja',
  'parcelsapp',
  'ship24',
  '17track',
]);
const TORQUECORE_SOURCE_STATES = new Set([
  'success',
  'captcha',
  'blocked',
  'paywall',
  'not_found',
  'irrelevant',
  'not_configured',
  'timeout',
  'error',
]);
const TORQUECORE_STATUS_HINTS = new Set([
  'registered',
  'in_transit',
  'customs',
  'out_for_delivery',
  'delivered',
  'exception',
  'returned',
  'unknown',
]);

function toTorqueCoreSourceResults(providers: unknown, checkedAt: string) {
  if (!Array.isArray(providers)) return [];
  const rows: Array<Record<string, unknown>> = [];
  for (const raw of providers) {
    if (!raw || typeof raw !== 'object') continue;
    const provider = raw as Record<string, unknown>;
    const source = typeof provider.provider === 'string' ? provider.provider : null;
    if (!source || !TORQUECORE_SOURCES.has(source)) continue;
    const state =
      typeof provider.state === 'string' && TORQUECORE_SOURCE_STATES.has(provider.state)
        ? provider.state
        : 'error';
    const rawStatus =
      typeof provider.status === 'string'
        ? provider.status === 'info_received'
          ? 'registered'
          : provider.status
        : null;
    const statusHint = rawStatus && TORQUECORE_STATUS_HINTS.has(rawStatus) ? rawStatus : null;
    const label =
      typeof provider.label === 'string' && provider.label.trim()
        ? provider.label.trim().slice(0, 80)
        : source;
    const excerpt =
      typeof provider.evidenceSummary === 'string' && provider.evidenceSummary.trim()
        ? provider.evidenceSummary.slice(0, 4000)
        : null;
    const httpStatus = typeof provider.httpStatus === 'number' ? provider.httpStatus : null;
    rows.push({ source, label, state, checkedAt, httpStatus, statusHint, excerpt, error: null });
  }
  return rows;
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
        const settings = await this.shipmentSettings(localShipmentId);
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
            respectRobotsTxt: settings.respectRobotsTxt,
            forceJavaScript: settings.forceJavaScript,
            useAi: settings.useAi,
            manualContinuation: settings.useManualCaptcha,
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

      await this.pushLocalShipments();
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

  // Reverse direction: shipments created inside Radar (no torquecoreShipmentId
  // in local metadata) are inserted into the TorqueCore shipments table so the
  // remote admin list mirrors them. Imported shipments already carry the marker
  // and are skipped, so this never pushes TorqueCore's own rows back.
  private async pushLocalShipments() {
    if (!this.remote || !this.orgId) return;
    const { data, error } = await this.local
      .from('shipments')
      .select(
        'id, tracking_number, tracking_enabled, current_status, last_checked_at, delivered_at, origin_country, destination_country, metadata_json',
      )
      .eq('org_id', this.orgId)
      .limit(500);
    if (error) throw error;
    for (const shipment of (data ?? []) as LocalShipmentExport[]) {
      const metadata = (shipment.metadata_json ?? {}) as Record<string, unknown>;
      if (typeof metadata.torquecoreShipmentId === 'string') continue;
      await this.exportShipment(shipment, metadata);
    }
  }

  private async exportShipment(
    shipment: LocalShipmentExport,
    metadata: Record<string, unknown>,
  ) {
    if (!this.remote || !this.orgId) return;
    const trackingNumber = shipment.tracking_number.replace(/\s+/g, '').toUpperCase();
    const { data: existing, error: findError } = await this.remote
      .from('shipments')
      .select('id')
      .eq('tracking_number', trackingNumber)
      .is('order_id', null)
      .maybeSingle();
    if (findError) throw findError;
    let remoteId = existing?.id ? String(existing.id) : null;
    if (!remoteId) {
      // Reuse the local id as the remote id so pushResult status updates target
      // the same row without an extra lookup. inbound_supplier with a null
      // supplier keeps the direction party check satisfied.
      const { data, error } = await this.remote
        .from('shipments')
        .insert({
          id: shipment.id,
          tracking_number: trackingNumber,
          shipment_direction: 'inbound_supplier',
          tracking_enabled: shipment.tracking_enabled ?? true,
          current_status: toTorqueCoreStatus(shipment.current_status),
          origin_country: toAlpha2(shipment.origin_country),
          destination_country: toAlpha2(shipment.destination_country),
          last_checked_at: shipment.last_checked_at ?? null,
          delivered_at: shipment.delivered_at ?? null,
        })
        .select('id')
        .single();
      if (error) {
        // A concurrent insert or a pre-existing TorqueCore row with the same
        // tracking number: adopt the remote id instead of failing the sync.
        if (error.code === '23505') {
          const { data: dup } = await this.remote
            .from('shipments')
            .select('id')
            .eq('tracking_number', trackingNumber)
            .is('order_id', null)
            .maybeSingle();
          remoteId = dup?.id ? String(dup.id) : null;
        } else {
          throw error;
        }
      } else {
        remoteId = String(data.id);
      }
    }
    if (!remoteId) return;
    await this.local
      .from('shipments')
      .update({ metadata_json: { ...metadata, torquecoreShipmentId: remoteId } })
      .eq('id', shipment.id)
      .eq('org_id', this.orgId);
  }

  private async resolveRemoteShipmentId(localShipmentId: string): Promise<string | null> {
    const { data, error } = await this.local
      .from('shipments')
      .select('metadata_json')
      .eq('id', localShipmentId)
      .maybeSingle();
    if (error || !data) return localShipmentId;
    const metadata = (data.metadata_json ?? {}) as Record<string, unknown>;
    return typeof metadata.torquecoreShipmentId === 'string'
      ? metadata.torquecoreShipmentId
      : localShipmentId;
  }

  private async shipmentSettings(shipmentId: string) {
    const { data, error } = await this.local
      .from('shipments')
      .select('respect_robots_txt, force_javascript, use_ai, use_manual_captcha')
      .eq('id', shipmentId)
      .eq('org_id', this.orgId!)
      .single();
    if (error) throw error;
    return {
      respectRobotsTxt: Boolean(data.respect_robots_txt),
      forceJavaScript: data.force_javascript !== false,
      useAi: data.use_ai !== false,
      useManualCaptcha: data.use_manual_captcha === true,
    };
  }

  async pushResult(job: BrowserAutomationJob, result: Record<string, unknown>) {
    if (!this.remote || job.type !== 'shipment_tracking') return;
    // TorqueCore-origin jobs carry externalShipmentId. Radar-origin jobs do
    // not, so resolve the remote id from the local metadata written by
    // exportShipment (falling back to the local id, which we reuse remotely).
    let externalShipmentId =
      typeof job.payload.externalShipmentId === 'string'
        ? job.payload.externalShipmentId
        : null;
    if (!externalShipmentId) {
      const localShipmentId =
        typeof job.payload.shipmentId === 'string'
          ? job.payload.shipmentId
          : typeof result.shipmentId === 'string'
            ? result.shipmentId
            : null;
      externalShipmentId = localShipmentId
        ? await this.resolveRemoteShipmentId(localShipmentId)
        : null;
    }
    if (!externalShipmentId) return;
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
            source_results: toTorqueCoreSourceResults(result.providers, checkedAt),
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
      const sourceResults = toTorqueCoreSourceResults(result.providers, checkedAt);
      await this.remote
        .from('shipment_tracking_runs')
        .update({
          status: sourceResults.some((row) => row.state === 'success')
            ? 'succeeded'
            : 'partial',
          source_results: sourceResults,
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
