import { redirect } from 'next/navigation';
import { cache } from 'react';
import { eq, and } from 'drizzle-orm';
import { createSupabaseServerClient } from './supabase/server';
import { db, schema } from './db';
import type { OrgRole } from '@cr/shared';
import { cookies } from 'next/headers';

export interface AppUser {
  id: string;
  email: string;
  fullName: string | null;
}

export interface AppContext {
  user: AppUser;
  orgId: string;
  role: OrgRole;
  orgs: { id: string; name: string; slug: string; role: OrgRole }[];
}

export const ACTIVE_ORG_COOKIE = 'cr_active_org';

export const getUser = cache(async (): Promise<AppUser | null> => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  return {
    id: data.user.id,
    email: data.user.email ?? '',
    fullName: (data.user.user_metadata?.full_name as string | undefined) ?? null,
  };
});

export async function requireUser(): Promise<AppUser> {
  const user = await getUser();
  if (!user) redirect('/login');
  return user;
}

export const getUserOrgs = cache(async (userId: string) => {
  return db()
    .select({
      id: schema.organizations.id,
      name: schema.organizations.name,
      slug: schema.organizations.slug,
      role: schema.memberships.role,
    })
    .from(schema.memberships)
    .innerJoin(schema.organizations, eq(schema.memberships.orgId, schema.organizations.id))
    .where(eq(schema.memberships.userId, userId));
});

export async function getContext(): Promise<AppContext> {
  const user = await requireUser();
  const orgs = await getUserOrgs(user.id);
  if (orgs.length === 0) redirect('/onboarding');

  const cookieStore = await cookies();
  const wanted = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  const active = orgs.find((o) => o.id === wanted) ?? orgs[0]!;
  return { user, orgId: active.id, role: active.role, orgs };
}

export function assertRole(context: AppContext, allowed: OrgRole[]): void {
  if (!allowed.includes(context.role)) {
    throw new Error(`Forbidden — requires role one of: ${allowed.join(', ')}`);
  }
}

export async function getMembership(orgId: string, userId: string) {
  const rows = await db()
    .select()
    .from(schema.memberships)
    .where(and(eq(schema.memberships.orgId, orgId), eq(schema.memberships.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}
