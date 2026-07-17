import { shipmentTrackingPayloadSchema } from '@cr/shared';
import { z } from 'zod';
import { PagePreparationService } from './page-handlers.js';
import { shipmentAdapters } from './shipment-adapters.js';
import type { BrowserJobHandler } from './types.js';
import {
  buildTrackingExcerpt,
  classifyTrackingPage,
  isUpsTrackingNumber,
} from '../shipments/tracking-core.js';
import { createAutomationClient } from './job-lease-manager.js';
import { OpenAIProcessingService } from './openai-processing-service.js';

const statusSchema = z.enum([
  'pending',
  'info_received',
  'in_transit',
  'customs',
  'out_for_delivery',
  'delivered',
  'exception',
  'returned',
  'unknown',
]);

function normalizeStatus(status: string | null) {
  const mapped = status === 'registered' ? 'info_received' : (status ?? 'unknown');
  return statusSchema.parse(mapped);
}

const rank: Record<z.infer<typeof statusSchema>, number> = {
  pending: 0,
  unknown: 1,
  info_received: 2,
  in_transit: 3,
  customs: 4,
  out_for_delivery: 5,
  exception: 6,
  returned: 7,
  delivered: 8,
};

function friendly(status: z.infer<typeof statusSchema>) {
  switch (status) {
    case 'info_received':
      return {
        title: 'Отправление зарегистрировано',
        description: 'Перевозчик получил информацию об отправлении.',
      };
    case 'in_transit':
      return {
        title: 'Посылка в пути',
        description: 'Отправление движется по маршруту к получателю.',
      };
    case 'customs':
      return {
        title: 'Посылка на таможне',
        description: 'Отправление проходит таможенное оформление.',
      };
    case 'out_for_delivery':
      return { title: 'Передано курьеру', description: 'Доставка ожидается в ближайшее время.' };
    case 'delivered':
      return {
        title: 'Посылка доставлена',
        description: 'Доставка подтверждена данными перевозчика.',
      };
    case 'exception':
      return {
        title: 'Требуется внимание',
        description: 'Перевозчик сообщил о проблеме с доставкой.',
      };
    case 'returned':
      return { title: 'Возврат отправителю', description: 'Посылка следует обратно отправителю.' };
    default:
      return { title: 'Статус уточняется', description: 'Свежих подтверждённых событий пока нет.' };
  }
}

function evidenceSummary(value: unknown) {
  const lines = String(value ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const relevant = lines.filter((line) =>
    /label|information received|info received|in transit|customs|out for delivery|delivered|exception|returned|shipper|carrier|origin|destination|\b[A-Z]{2,3}\b/i.test(
      line,
    ),
  );
  return [...new Set(relevant)].slice(0, 8).join(' · ').slice(0, 600) || null;
}

export function createShipmentTrackingHandler(): BrowserJobHandler {
  const preparation = new PagePreparationService();
  const ai = new OpenAIProcessingService();
  return async ({ job, browserContext, log, heartbeat, signal }) => {
    const payload = shipmentTrackingPayloadSchema.parse(job.payload);
    const configured = new Set(
      payload.providerIds ?? shipmentAdapters.map((adapter) => adapter.id),
    );
    const client = createAutomationClient();
    const { data: disabledRows } = await client
      .from('provider_health')
      .select('provider, disabled_until')
      .eq('org_id', job.orgId)
      .gt('disabled_until', new Date().toISOString());
    const disabled = new Set((disabledRows ?? []).map((row) => String(row.provider)));
    const adapters = shipmentAdapters.filter(
      (adapter) => configured.has(adapter.id) && !disabled.has(adapter.id),
    );
    const results: Array<
      Record<string, unknown> & {
        provider: string;
        state: string;
        status: z.infer<typeof statusSchema>;
      }
    > = [];
    const captchaProviders: string[] = [];

    for (let index = 0; index < adapters.length; index += 1) {
      if (signal.aborted) throw new Error('job_cancelled');
      const adapter = adapters[index]!;
      if (adapter.id === 'ups' && !isUpsTrackingNumber(payload.trackingNumber)) continue;
      const progress = Math.round((index / Math.max(adapters.length, 1)) * 90);
      await heartbeat({ progress, provider: adapter.id });
      await log({
        level: 'info',
        event: 'provider_started',
        message: `Проверяется ${adapter.label}`,
        progress,
      });
      const startedAt = Date.now();
      const page = await browserContext.newPage();
      try {
        const response = await page.goto(adapter.buildUrl(payload.trackingNumber).toString(), {
          waitUntil: 'domcontentloaded',
          timeout: 45_000,
        });
        const prepared = await preparation.prepare(page);
        if (prepared.captchaDetected) {
          captchaProviders.push(adapter.id);
          results.push({
            provider: adapter.id,
            label: adapter.label,
            state: 'captcha',
            status: 'unknown',
            durationMs: Date.now() - startedAt,
          });
          await log({
            level: 'warn',
            event: 'captcha_detected',
            message: `${adapter.label}: требуется ручная проверка CAPTCHA`,
            progress,
          });
          continue;
        }
        await adapter.waitForResult(page);
        const text = String(await adapter.extract(page, payload.trackingNumber));
        const classified = classifyTrackingPage({ text, trackingNumber: payload.trackingNumber });
        const status = normalizeStatus(classified.statusHint);
        results.push({
          provider: adapter.id,
          label: adapter.label,
          state: classified.state,
          status,
          excerpt: buildTrackingExcerpt(text, payload.trackingNumber, 1_500),
          httpStatus: response?.status() ?? null,
          durationMs: Date.now() - startedAt,
        });
        await log({
          level: classified.state === 'success' ? 'info' : 'warn',
          event: 'provider_completed',
          message: `${adapter.label}: ${classified.state}`,
          progress: progress + 10,
        });
      } catch (error) {
        results.push({
          provider: adapter.id,
          label: adapter.label,
          state: error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'failed',
          status: 'unknown',
          errorCode:
            error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'provider_error',
          durationMs: Date.now() - startedAt,
        });
        await log({
          level: 'warn',
          event: 'provider_failed',
          message: `${adapter.label}: источник временно недоступен`,
          progress,
        });
      } finally {
        await page.close().catch(() => undefined);
      }
    }

    const useful = results.filter((result) => result.state === 'success');
    const consensusStatus =
      useful.map((result) => result.status).sort((a, b) => rank[b] - rank[a])[0] ?? 'unknown';
    const confidence = useful.length === 0 ? 0 : Math.min(0.98, 0.55 + useful.length * 0.12);
    const fallbackPresentation = friendly(consensusStatus);
    const presentation =
      useful.length > 0
        ? await ai
            .improve({
              status: consensusStatus,
              title: fallbackPresentation.title,
              description: fallbackPresentation.description,
              facts: useful.map((item) => String(item.excerpt ?? '').slice(0, 500)).filter(Boolean),
            })
            .catch(() => ({ ...fallbackPresentation, nextStep: null }))
        : { ...fallbackPresentation, nextStep: null };
    const publicProviders = results.map(({ excerpt, ...provider }) => ({
      ...provider,
      evidenceSummary: evidenceSummary(excerpt),
    }));
    const report = {
      resultVersion: 1,
      shipmentId: payload.shipmentId,
      trackingNumber: payload.trackingNumber,
      status: consensusStatus,
      ...presentation,
      carrier: useful.find((result) => result.provider === 'ups') ? 'UPS' : null,
      confidence,
      checkedAt: new Date().toISOString(),
      providers: publicProviders,
      captchaProviders,
      preserveLastConfirmed: useful.length === 0,
    };

    if (useful.length === 0 && captchaProviders.length > 0 && payload.manualContinuation) {
      return { status: 'awaiting_user', result: { ...report, manualActionRequired: 'captcha' } };
    }
    return { status: useful.length === adapters.length ? 'succeeded' : 'partial', result: report };
  };
}
