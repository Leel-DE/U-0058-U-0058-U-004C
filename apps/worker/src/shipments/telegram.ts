import { z } from 'zod';

import type {
  ShipmentCloudRunCompletionStatus,
  ShipmentTrackingPresentation,
  ShipmentTrackingSourceResult,
} from './tracking-core.js';

const telegramResponseSchema = z.object({
  ok: z.boolean(),
  result: z
    .object({
      message_id: z.number().int(),
      chat: z.object({ id: z.number().int() }),
      message_thread_id: z.number().int().optional(),
    })
    .optional(),
});

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
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

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

export function buildCloudTrackingTelegramMessage(input: {
  trackingNumber: string;
  status: ShipmentCloudRunCompletionStatus;
  results: ShipmentTrackingSourceResult[];
  presentation: ShipmentTrackingPresentation | null;
  presentationIsStale?: boolean;
  presentationCheckedAt?: string | null;
}): string {
  const lines = ['📦 <b>Статус посылки</b>', `🔎 <code>${escapeHtml(input.trackingNumber)}</code>`];

  if (input.presentation) {
    if (input.presentationIsStale) {
      const checkedAt = formatCheckedAt(input.presentationCheckedAt);
      lines.push(
        '',
        '⚠️ <b>Свежие данные пока недоступны</b>',
        checkedAt
          ? `Последний подтверждённый результат: ${escapeHtml(checkedAt)}.`
          : 'Показан последний подтверждённый результат.',
      );
    }

    const value = input.presentation;
    lines.push(
      '',
      `${value.needsAttention ? '⚠️' : '🟢'} <b>${escapeHtml(value.displayStatus)}</b>`,
      escapeHtml(truncate(value.headline, 320)),
    );

    const details: string[] = [];
    if (value.carrier) {
      details.push(`🚚 <b>Служба:</b> ${escapeHtml(value.carrier)}`);
    }
    if (value.origin && value.destination) {
      details.push(
        `🌍 <b>Маршрут:</b> ${escapeHtml(value.origin)} → ${escapeHtml(value.destination)}`,
      );
    } else if (value.origin) {
      details.push(`🌍 <b>Отправлено из:</b> ${escapeHtml(value.origin)}`);
    } else if (value.destination) {
      details.push(`🌍 <b>Направление:</b> ${escapeHtml(value.destination)}`);
    }
    if (value.latestLocation) {
      details.push(`📍 <b>Последняя отметка:</b> ${escapeHtml(value.latestLocation)}`);
    }
    if (value.latestEventAt) {
      details.push(`🗓 <b>Обновлено:</b> ${escapeHtml(value.latestEventAt)}`);
    }
    if (details.length > 0) lines.push('', '<b>Детали</b>', ...details);

    lines.push('', escapeHtml(truncate(value.summary, 700)));
    if (value.nextStep) {
      lines.push('', '➡️ <b>Что дальше</b>', escapeHtml(truncate(value.nextStep, 350)));
    }
  } else {
    const explicitNotFound = input.results.some((result) => result.state === 'not_found');
    const accessLimited = input.results.some((result) =>
      ['blocked', 'captcha'].includes(result.state),
    );
    lines.push(
      '',
      explicitNotFound
        ? 'ℹ️ По этому трек-номеру пока нет данных. Возможно, отправление ещё не зарегистрировано.'
        : accessLimited
          ? '⚠️ Свежие данные получить не удалось: сайты отслеживания ограничили автоматическую проверку. Radar повторит попытку позже.'
          : input.status === 'failed'
            ? '⚠️ Актуальный статус получить не удалось. Radar повторит попытку позже.'
            : 'ℹ️ Проверка завершена, но подтверждённый статус пока не найден.',
    );
  }

  return lines.join('\n').slice(0, 4_000);
}

export async function sendCloudTrackingTelegramMessage(input: {
  botToken: string;
  chatId: string;
  text: string;
  messageThreadId?: number;
}): Promise<{ messageId: number; chatId: number; messageThreadId?: number }> {
  const response = await fetch(`https://api.telegram.org/bot${input.botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      chat_id: input.chatId,
      text: input.text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...(input.messageThreadId ? { message_thread_id: input.messageThreadId } : {}),
    }),
    signal: AbortSignal.timeout(8_000),
  });

  const parsed = telegramResponseSchema.safeParse(await response.json().catch(() => null));
  if (!response.ok || !parsed.success || !parsed.data.ok || !parsed.data.result) {
    throw new Error('Telegram notification failed.');
  }

  return {
    messageId: parsed.data.result.message_id,
    chatId: parsed.data.result.chat.id,
    messageThreadId: parsed.data.result.message_thread_id,
  };
}
