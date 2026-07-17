import type { SupabaseClient } from '@supabase/supabase-js';
import type { BrowserAutomationJob } from '@cr/shared';
import { createHash } from 'node:crypto';
import { nextShipmentCheck } from './adaptive-scheduler.js';
import { NotificationService } from './notification-service.js';

function providerStatus(state: string) {
  if (state === 'success') return 'succeeded';
  if (state === 'captcha') return 'captcha';
  if (state === 'blocked') return 'blocked';
  if (['not_found', 'irrelevant', 'paywall'].includes(state)) return 'no_data';
  return 'failed';
}

export class ShipmentResultStore {
  private readonly notifications: NotificationService;
  constructor(private readonly client: SupabaseClient) {
    this.notifications = new NotificationService(client);
  }

  async persist(job: BrowserAutomationJob, result: Record<string, unknown>) {
    const shipmentId = String(result.shipmentId);
    const { data: shipment, error: readError } = await this.client
      .from('shipments')
      .select('current_status, tracking_number')
      .eq('id', shipmentId)
      .eq('org_id', job.orgId)
      .single();
    if (readError) throw readError;
    const status = String(result.status ?? 'unknown');
    const schedule = nextShipmentCheck(status);
    const providers = Array.isArray(result.providers)
      ? (result.providers as Array<Record<string, unknown>>)
      : [];
    if (providers.length > 0) {
      const { error } = await this.client.from('shipment_provider_results').upsert(
        providers.map((provider) => ({
          org_id: job.orgId,
          shipment_id: shipmentId,
          job_id: job.id,
          provider: String(provider.provider),
          status: providerStatus(String(provider.state)),
          normalized_json: provider,
          confidence: result.confidence ?? null,
          error_code: provider.errorCode ?? null,
          duration_ms: provider.durationMs ?? null,
        })),
        { onConflict: 'job_id,provider' },
      );
      if (error) throw error;
      await Promise.all(
        providers.map((provider) => this.updateProviderHealth(job.orgId, provider)),
      );
    }

    // CAPTCHA is a workflow state, not a new parcel status. Keep the last
    // confirmed shipment result visible while the job waits for a person.
    if (result.manualActionRequired === 'captcha' || result.preserveLastConfirmed === true) return;

    const update = {
      previous_status: shipment.current_status,
      current_status: status,
      status_title: result.title ?? null,
      status_description: result.description ?? null,
      last_carrier: result.carrier ?? null,
      confidence: result.confidence ?? null,
      last_checked_at: result.checkedAt ?? new Date().toISOString(),
      next_check_at: schedule.at.toISOString(),
      check_interval_minutes: schedule.minutes,
      delivered_at: status === 'delivered' ? new Date().toISOString() : null,
      tracking_enabled: !['delivered', 'returned'].includes(status),
      updated_at: new Date().toISOString(),
    };
    const { error: updateError } = await this.client
      .from('shipments')
      .update(update)
      .eq('id', shipmentId)
      .eq('org_id', job.orgId);
    if (updateError) throw updateError;

    const eventHash = createHash('sha256')
      .update(
        `${shipmentId}|${status}|${String(result.title ?? '')}|${String(result.checkedAt ?? '')}`,
      )
      .digest('hex');
    const { error: eventError } = await this.client.from('shipment_events').insert({
      org_id: job.orgId,
      shipment_id: shipmentId,
      job_id: job.id,
      status,
      title: String(result.title ?? 'Статус обновлён'),
      description: result.description ?? null,
      carrier: result.carrier ?? null,
      provider: 'consensus',
      event_at: result.checkedAt ?? new Date().toISOString(),
      event_hash: eventHash,
    });
    if (eventError?.code !== '23505' && eventError) throw eventError;

    await this.notifications.shipmentChanged({
      orgId: job.orgId,
      shipmentId,
      trackingNumber: shipment.tracking_number,
      previousStatus: shipment.current_status,
      status,
      title: String(result.title ?? 'Статус посылки'),
      description: String(result.description ?? ''),
      carrier: result.carrier ? String(result.carrier) : null,
    });
  }

  private async updateProviderHealth(orgId: string, provider: Record<string, unknown>) {
    // Respecting robots.txt is an operator policy, not a provider outage.
    if (provider.state === 'robots_disallowed') return;
    const providerId = String(provider.provider);
    const succeeded = provider.state === 'success';
    const captcha = provider.state === 'captcha';
    const { data: current } = await this.client
      .from('provider_health')
      .select('success_rate, captcha_rate, avg_duration_ms, consecutive_failures')
      .eq('org_id', orgId)
      .eq('provider', providerId)
      .maybeSingle();
    const successRate = current
      ? Number(current.success_rate) * 0.8 + (succeeded ? 0.2 : 0)
      : succeeded
        ? 1
        : 0;
    const captchaRate = current
      ? Number(current.captcha_rate) * 0.8 + (captcha ? 0.2 : 0)
      : captcha
        ? 1
        : 0;
    const duration = Number(provider.durationMs ?? 0);
    const avgDuration = current?.avg_duration_ms
      ? Math.round(Number(current.avg_duration_ms) * 0.8 + duration * 0.2)
      : duration || null;
    const consecutiveFailures = succeeded ? 0 : Number(current?.consecutive_failures ?? 0) + 1;
    const state = successRate >= 0.7 ? 'healthy' : successRate >= 0.3 ? 'degraded' : 'unhealthy';
    const { error } = await this.client.from('provider_health').upsert(
      {
        org_id: orgId,
        provider: providerId,
        state,
        success_rate: successRate,
        captcha_rate: captchaRate,
        avg_duration_ms: avgDuration,
        consecutive_failures: consecutiveFailures,
        last_success_at: succeeded ? new Date().toISOString() : current ? undefined : null,
        last_failure_at: succeeded ? undefined : new Date().toISOString(),
        disabled_until:
          consecutiveFailures >= 5 ? new Date(Date.now() + 30 * 60_000).toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'org_id,provider' },
    );
    if (error) throw error;
  }
}
