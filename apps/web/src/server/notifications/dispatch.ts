import { eq, and } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { serverEnv } from '@/lib/env';

interface DispatchInput {
  orgId: string;
  alertRuleId?: string;
  channels: ('in_app' | 'email' | 'webhook')[];
  title: string;
  body: string;
  payload?: Record<string, unknown>;
  dedupKey: string;
}

export async function dispatchNotification(input: DispatchInput): Promise<void> {
  // Per-user fan-out for in-app notifications
  const recipients = await db()
    .select({ userId: schema.memberships.userId, email: schema.profiles.email, role: schema.memberships.role })
    .from(schema.memberships)
    .innerJoin(schema.profiles, eq(schema.memberships.userId, schema.profiles.id))
    .where(eq(schema.memberships.orgId, input.orgId));

  if (input.channels.includes('in_app')) {
    for (const r of recipients) {
      // dedup per user+key+day
      const existing = await db()
        .select({ id: schema.notifications.id })
        .from(schema.notifications)
        .where(
          and(
            eq(schema.notifications.dedupKey, `${input.dedupKey}:${r.userId}`),
            eq(schema.notifications.userId, r.userId),
          ),
        )
        .limit(1);
      if (existing[0]) continue;

      await db().insert(schema.notifications).values({
        orgId: input.orgId,
        alertRuleId: input.alertRuleId,
        userId: r.userId,
        title: input.title,
        body: input.body,
        payload: input.payload ?? null,
        channel: 'in_app',
        status: 'sent',
        dedupKey: `${input.dedupKey}:${r.userId}`,
        sentAt: new Date(),
      });
    }
  }

  if (input.channels.includes('email')) {
    const env = serverEnv();
    const targets = recipients.filter((r) => r.role === 'owner' || r.role === 'manager');
    for (const r of targets) {
      const existing = await db()
        .select({ id: schema.notifications.id })
        .from(schema.notifications)
        .where(
          and(
            eq(schema.notifications.dedupKey, `${input.dedupKey}:email:${r.userId}`),
            eq(schema.notifications.channel, 'email'),
          ),
        )
        .limit(1);
      if (existing[0]) continue;

      const sent = await sendEmail({
        to: r.email,
        from: env.RESEND_FROM_EMAIL || 'Competitor Radar Local <admin@demo.local>',
        subject: input.title,
        body: input.body,
        resendApiKey: env.LOCAL_DEV_MODE ? undefined : env.RESEND_API_KEY,
      });

      await db().insert(schema.notifications).values({
        orgId: input.orgId,
        alertRuleId: input.alertRuleId,
        userId: r.userId,
        title: input.title,
        body: input.body,
        payload: sent.ok ? input.payload ?? null : { error: sent.error },
        channel: 'email',
        status: sent.ok ? 'sent' : 'failed',
        dedupKey: `${input.dedupKey}:email:${r.userId}`,
        sentAt: sent.ok ? new Date() : undefined,
      });
    }
  }
}

async function sendEmail(input: {
  to: string;
  from: string;
  subject: string;
  body: string;
  resendApiKey?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input.resendApiKey) {
    console.log(`[email:local] to=${input.to} subject="${input.subject}" body="${input.body}"`);
    return { ok: true };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${input.resendApiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: input.from,
        to: input.to,
        subject: input.subject,
        html: `<p>${escapeHtml(input.body)}</p><p style="color:#888;font-size:12px">Sent by Competitor Radar.</p>`,
      }),
    });
    if (!response.ok) {
      return { ok: false, error: `resend_http_${response.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
