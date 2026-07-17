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
    const lines = [
      `📦 <b>${escapeHtml(input.title)}</b>`,
      '',
      `🔎 <b>Трек-номер:</b> <code>${escapeHtml(input.trackingNumber)}</code>`,
      input.carrier ? `🚚 <b>Служба:</b> ${escapeHtml(input.carrier)}` : null,
      input.location ? `📍 <b>Где сейчас:</b> ${escapeHtml(input.location)}` : null,
      '',
      escapeHtml(input.description),
    ].filter((line): line is string => line !== null);
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_thread_id: process.env.TORQUECORE_TELEGRAM_SHIPMENTS_THREAD_ID
          ? Number(process.env.TORQUECORE_TELEGRAM_SHIPMENTS_THREAD_ID)
          : undefined,
        text: lines.join('\n'),
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
