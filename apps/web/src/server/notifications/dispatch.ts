import { eq, and } from 'drizzle-orm';
import { Resend } from 'resend';
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
    if (env.RESEND_API_KEY && env.RESEND_FROM_EMAIL && targets.length > 0) {
      const resend = new Resend(env.RESEND_API_KEY);
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

        try {
          await resend.emails.send({
            from: env.RESEND_FROM_EMAIL,
            to: r.email,
            subject: input.title,
            html: `<p>${escapeHtml(input.body)}</p><p style="color:#888;font-size:12px">Sent by Competitor Radar.</p>`,
          });
          await db().insert(schema.notifications).values({
            orgId: input.orgId,
            alertRuleId: input.alertRuleId,
            userId: r.userId,
            title: input.title,
            body: input.body,
            payload: input.payload ?? null,
            channel: 'email',
            status: 'sent',
            dedupKey: `${input.dedupKey}:email:${r.userId}`,
            sentAt: new Date(),
          });
        } catch (err) {
          console.error('[resend.send] failed', err);
          await db().insert(schema.notifications).values({
            orgId: input.orgId,
            alertRuleId: input.alertRuleId,
            userId: r.userId,
            title: input.title,
            body: input.body,
            payload: { error: (err as Error).message },
            channel: 'email',
            status: 'failed',
            dedupKey: `${input.dedupKey}:email:${r.userId}`,
          });
        }
      }
    } else {
      console.log(`[email] (skipped, Resend not configured) ${input.title}`);
    }
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
