import type { SupabaseClient } from '@supabase/supabase-js';

const IMPORTANT = new Set([
  'info_received',
  'in_transit',
  'customs',
  'out_for_delivery',
  'delivered',
  'exception',
  'returned',
]);

function escapeHtml(value: string) {
  return value.replace(
    /[&<>]/g,
    (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[character]!,
  );
}

function formatCheckedAt(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Europe/Berlin',
  }).format(date);
}

const ATTENTION_STATUSES = new Set(['exception', 'returned']);

// Mirror the rich canonical-path layout (buildCloudTrackingTelegramMessage in
// ../shipments/telegram.ts): a status header with a state emoji, a Детали
// block, and a "Что дальше" block. The automation path has fewer confirmed
// facts (no route, no per-event timestamp), so those lines are simply omitted.
function buildShipmentNotification(input: {
  trackingNumber: string;
  status: string;
  title: string;
  description: string;
  carrier?: string | null;
  location?: string | null;
  origin?: string | null;
  destination?: string | null;
  nextStep?: string | null;
  eventAt?: string | null;
  checkedAt?: string | null;
}): string {
  const attention = ATTENTION_STATUSES.has(input.status);
  const lines = [
    '📦 <b>Статус посылки</b>',
    `🔎 <code>${escapeHtml(input.trackingNumber)}</code>`,
    '',
    `${attention ? '⚠️' : '🟢'} <b>${escapeHtml(input.title)}</b>`,
  ];
  if (input.description.trim()) lines.push(escapeHtml(input.description.trim()));

  const details: string[] = [];
  if (input.carrier) details.push(`🚚 <b>Служба:</b> ${escapeHtml(input.carrier)}`);
  if (input.origin && input.destination) {
    details.push(
      `🌍 <b>Маршрут:</b> ${escapeHtml(input.origin)} → ${escapeHtml(input.destination)}`,
    );
  } else if (input.origin) {
    details.push(`🌍 <b>Отправлено из:</b> ${escapeHtml(input.origin)}`);
  } else if (input.destination) {
    details.push(`🌍 <b>Направление:</b> ${escapeHtml(input.destination)}`);
  }
  if (input.location) details.push(`📍 <b>Последняя отметка:</b> ${escapeHtml(input.location)}`);
  // Prefer the carrier's confirmed event time; fall back to when we checked.
  const updatedAt = formatCheckedAt(input.eventAt) ?? formatCheckedAt(input.checkedAt);
  if (updatedAt) details.push(`🗓 <b>Обновлено:</b> ${escapeHtml(updatedAt)}`);
  if (details.length > 0) lines.push('', '<b>Детали</b>', ...details);

  if (input.nextStep?.trim()) {
    lines.push('', '➡️ <b>Что дальше</b>', escapeHtml(input.nextStep.trim()));
  }

  return lines.join('\n').slice(0, 4_000);
}

export class NotificationService {
  constructor(private readonly client: SupabaseClient) {}

  async shipmentChanged(input: {
    orgId: string;
    shipmentId: string;
    trackingNumber: string;
    previousStatus: string | null;
    status: string;
    title: string;
    description: string;
    carrier?: string | null;
    location?: string | null;
    origin?: string | null;
    destination?: string | null;
    nextStep?: string | null;
    eventAt?: string | null;
    checkedAt?: string | null;
  }) {
    if (input.previousStatus === input.status || !IMPORTANT.has(input.status))
      return { sent: false, reason: 'not_important' };
    const dedupeKey = `telegram:${input.shipmentId}:${input.status}`;
    const { data, error } = await this.client
      .from('notification_deliveries')
      .insert({
        org_id: input.orgId,
        shipment_id: input.shipmentId,
        channel: 'telegram',
        dedupe_key: dedupeKey,
      })
      .select('id')
      .maybeSingle();
    if (error?.code === '23505') return { sent: false, reason: 'duplicate' };
    if (error) throw error;

    const token = process.env.TORQUECORE_TELEGRAM_BOT_TOKEN?.trim();
    const chatId = process.env.TORQUECORE_TELEGRAM_CHAT_ID?.trim();
    if (!token || !chatId) {
      await this.client
        .from('notification_deliveries')
        .update({ status: 'failed', error_summary: 'telegram_not_configured' })
        .eq('id', data!.id);
      return { sent: false, reason: 'not_configured' };
    }
    const text = buildShipmentNotification({
      trackingNumber: input.trackingNumber,
      status: input.status,
      title: input.title,
      description: input.description,
      carrier: input.carrier,
      location: input.location,
      origin: input.origin,
      destination: input.destination,
      nextStep: input.nextStep,
      eventAt: input.eventAt,
      checkedAt: input.checkedAt,
    });
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_thread_id: process.env.TORQUECORE_TELEGRAM_SHIPMENTS_THREAD_ID
          ? Number(process.env.TORQUECORE_TELEGRAM_SHIPMENTS_THREAD_ID)
          : undefined,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    await this.client
      .from('notification_deliveries')
      .update(
        response.ok
          ? { status: 'sent', sent_at: new Date().toISOString() }
          : { status: 'failed', error_summary: `telegram_http_${response.status}` },
      )
      .eq('id', data!.id);
    return { sent: response.ok, reason: response.ok ? 'sent' : 'http_error' };
  }
}
