'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { schemas } from '@cr/shared';
import { db, schema } from '@/lib/db';
import { defineAction, fail, ok } from '@/lib/action';
import { ACTIVE_ORG_COOKIE, getMembership, requireUser } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export async function createOrganization(rawInput: unknown) {
  const parsed = schemas.createOrganizationSchema.safeParse(rawInput);
  if (!parsed.success) {
    return fail({
      code: 'validation',
      message: 'Invalid input',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    });
  }
  const user = await requireUser();
  try {
    const inserted = await db().transaction(async (tx) => {
      const [org] = await tx
        .insert(schema.organizations)
        .values({
          name: parsed.data.name,
          slug: parsed.data.slug,
          createdBy: user.id,
        })
        .returning();
      if (!org) throw new Error('Failed to create organization');

      await tx.insert(schema.memberships).values({
        orgId: org.id,
        userId: user.id,
        role: 'owner',
      });
      await tx.insert(schema.automationSettings).values({
        orgId: org.id,
        updatedBy: user.id,
      });
      return org;
    });

    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_ORG_COOKIE, inserted.id, {
      httpOnly: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });
    await logAudit({
      orgId: inserted.id,
      userId: user.id,
      action: 'organization.create',
      entity: 'organization',
      entityId: inserted.id,
      after: { name: inserted.name, slug: inserted.slug },
    });
    revalidatePath('/', 'layout');
    return ok({ id: inserted.id, slug: inserted.slug });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown';
    if (msg.includes('organizations_slug_unique')) {
      return fail({
        code: 'conflict',
        message: 'That slug is already taken.',
        fieldErrors: { slug: ['Slug already in use'] },
      });
    }
    console.error('[createOrganization]', err);
    return fail({ code: 'internal', message: msg });
  }
}

const switchOrgSchema = z.object({ orgId: z.string().uuid() });
export const switchOrganization = defineAction(switchOrgSchema, async ({ orgId }, ctx) => {
  const membership = await getMembership(orgId, ctx.user.id);
  if (!membership) throw new Error('Forbidden — not a member of that organization');
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORG_COOKIE, orgId, {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath('/', 'layout');
  return { id: orgId };
});

export const inviteMember = defineAction(
  schemas.inviteMemberSchema,
  async (input, ctx) => {
    const token = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '').slice(0, 16);
    const expiresAt = new Date(Date.now() + SEVEN_DAYS_MS);

    const [row] = await db()
      .insert(schema.invitations)
      .values({
        orgId: ctx.orgId,
        email: input.email,
        role: input.role,
        token,
        invitedBy: ctx.user.id,
        expiresAt,
      })
      .returning();
    if (!row) throw new Error('Failed to create invitation');

    await logAudit({
      orgId: ctx.orgId,
      userId: ctx.user.id,
      action: 'invitation.create',
      entity: 'invitation',
      entityId: row.id,
      after: { email: input.email, role: input.role },
    });

    revalidatePath('/settings/members');
    return { id: row.id, token, expiresAt };
  },
  { roles: ['owner'] },
);

export const updateMemberRole = defineAction(
  schemas.updateMemberRoleSchema,
  async (input, ctx) => {
    if (input.userId === ctx.user.id) {
      throw new Error('Forbidden — cannot change your own role');
    }
    await db()
      .update(schema.memberships)
      .set({ role: input.role })
      .where(
        and(eq(schema.memberships.orgId, ctx.orgId), eq(schema.memberships.userId, input.userId)),
      );
    await logAudit({
      orgId: ctx.orgId,
      userId: ctx.user.id,
      action: 'membership.role_change',
      entity: 'membership',
      entityId: input.userId,
      after: { role: input.role },
    });
    revalidatePath('/settings/members');
    return { ok: true as const };
  },
  { roles: ['owner'] },
);

const removeMemberSchema = z.object({ userId: z.string().uuid() });
export const removeMember = defineAction(
  removeMemberSchema,
  async (input, ctx) => {
    if (input.userId === ctx.user.id) {
      throw new Error('Forbidden — leave organization from your profile instead');
    }
    await db()
      .delete(schema.memberships)
      .where(
        and(eq(schema.memberships.orgId, ctx.orgId), eq(schema.memberships.userId, input.userId)),
      );
    await logAudit({
      orgId: ctx.orgId,
      userId: ctx.user.id,
      action: 'membership.remove',
      entity: 'membership',
      entityId: input.userId,
    });
    revalidatePath('/settings/members');
    return { ok: true as const };
  },
  { roles: ['owner'] },
);

const acceptSchema = z.object({ token: z.string().min(10) });
export async function acceptInvitation(rawInput: unknown) {
  const parsed = acceptSchema.safeParse(rawInput);
  if (!parsed.success) return fail({ code: 'validation', message: 'Invalid token' });
  const user = await requireUser();
  const rows = await db()
    .select()
    .from(schema.invitations)
    .where(eq(schema.invitations.token, parsed.data.token))
    .limit(1);
  const invite = rows[0];
  if (!invite) return fail({ code: 'not_found', message: 'Invitation not found' });
  if (invite.status !== 'pending') {
    return fail({ code: 'conflict', message: 'Invitation no longer valid' });
  }
  if (invite.expiresAt < new Date()) {
    return fail({ code: 'conflict', message: 'Invitation expired' });
  }
  if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
    return fail({
      code: 'forbidden',
      message: `Invitation was sent to ${invite.email}. Sign in with that account.`,
    });
  }

  await db().transaction(async (tx) => {
    await tx
      .insert(schema.memberships)
      .values({ orgId: invite.orgId, userId: user.id, role: invite.role })
      .onConflictDoNothing();
    await tx
      .update(schema.invitations)
      .set({ status: 'accepted', acceptedAt: new Date() })
      .where(eq(schema.invitations.id, invite.id));
  });

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORG_COOKIE, invite.orgId, {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath('/', 'layout');
  return ok({ orgId: invite.orgId });
}

export async function signOut() {
  const { createSupabaseServerClient } = await import('@/lib/supabase/server');
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_ORG_COOKIE);
  revalidatePath('/', 'layout');
}
