'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { removeMember, updateMemberRole } from '@/server/actions/org';

type Role = 'owner' | 'manager' | 'viewer';

interface Member {
  userId: string;
  role: Role;
  email: string;
  fullName: string | null;
  createdAt: string;
}

interface Props {
  currentUserId: string;
  currentRole: Role;
  members: Member[];
  pendingInvites: { id: string; email: string; role: Role }[];
}

export function MembersTable({ currentUserId, currentRole, members, pendingInvites }: Props) {
  const router = useRouter();
  const [, start] = useTransition();
  const canManage = currentRole === 'owner';

  function changeRole(userId: string, role: Role) {
    start(async () => {
      const r = await updateMemberRole({ userId, role });
      if (!r.ok) toast.error(r.error.message);
      else router.refresh();
    });
  }

  function remove(userId: string) {
    if (!confirm('Remove this member?')) return;
    start(async () => {
      const r = await removeMember({ userId });
      if (!r.ok) toast.error(r.error.message);
      else {
        toast.success('Member removed');
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="pb-2">User</th>
            <th className="pb-2">Role</th>
            <th className="pb-2">Joined</th>
            <th className="pb-2" />
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.userId} className="border-t">
              <td className="py-3">
                <div className="font-medium">{m.fullName ?? m.email}</div>
                <div className="text-xs text-muted-foreground">{m.email}</div>
              </td>
              <td className="py-3">
                {canManage && m.userId !== currentUserId ? (
                  <Select value={m.role} onValueChange={(v) => changeRole(m.userId, v as Role)}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="viewer">Viewer</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="owner">Owner</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="secondary">{m.role}</Badge>
                )}
              </td>
              <td className="py-3 text-muted-foreground">{new Date(m.createdAt).toLocaleDateString()}</td>
              <td className="py-3 text-right">
                {canManage && m.userId !== currentUserId ? (
                  <Button variant="ghost" size="sm" onClick={() => remove(m.userId)}>
                    Remove
                  </Button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {pendingInvites.length > 0 ? (
        <div className="rounded-md border p-3">
          <div className="mb-2 text-sm font-medium">Pending invitations</div>
          <ul className="space-y-1 text-sm">
            {pendingInvites.map((i) => (
              <li key={i.id} className="flex items-center justify-between">
                <span>{i.email}</span>
                <Badge variant="outline">{i.role}</Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
