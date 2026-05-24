import { eq } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getContext } from '@/lib/auth';
import { db, schema } from '@/lib/db';
import { InviteForm } from './invite-form';
import { MembersTable } from './members-table';

export default async function MembersPage() {
  const ctx = await getContext();
  const members = await db()
    .select({
      userId: schema.memberships.userId,
      role: schema.memberships.role,
      createdAt: schema.memberships.createdAt,
      email: schema.profiles.email,
      fullName: schema.profiles.fullName,
    })
    .from(schema.memberships)
    .innerJoin(schema.profiles, eq(schema.memberships.userId, schema.profiles.id))
    .where(eq(schema.memberships.orgId, ctx.orgId));

  const invitations = await db()
    .select()
    .from(schema.invitations)
    .where(eq(schema.invitations.orgId, ctx.orgId));

  return (
    <div className="space-y-6">
      {ctx.role === 'owner' ? (
        <Card>
          <CardHeader>
            <CardTitle>Invite teammate</CardTitle>
          </CardHeader>
          <CardContent>
            <InviteForm />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent>
          <MembersTable
            currentUserId={ctx.user.id}
            currentRole={ctx.role}
            members={members.map((m) => ({
              ...m,
              createdAt: m.createdAt.toISOString(),
            }))}
            pendingInvites={invitations
              .filter((i) => i.status === 'pending')
              .map((i) => ({ id: i.id, email: i.email, role: i.role }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
