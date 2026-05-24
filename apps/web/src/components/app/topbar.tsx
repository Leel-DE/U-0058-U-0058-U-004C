import { Suspense } from 'react';
import { OrgSwitcher } from './org-switcher';
import { UserMenu } from './user-menu';
import { ThemeToggle } from './theme-toggle';
import type { AppContext } from '@/lib/auth';
import { NotificationBell } from './notification-bell';

export function Topbar({ ctx }: { ctx: AppContext }) {
  return (
    <header className="flex h-14 items-center justify-between gap-4 border-b bg-background px-6">
      <div className="flex items-center gap-3">
        <OrgSwitcher
          current={{ id: ctx.orgId, name: ctx.orgs.find((o) => o.id === ctx.orgId)?.name ?? '', role: ctx.role }}
          orgs={ctx.orgs}
        />
      </div>
      <div className="flex items-center gap-2">
        <Suspense fallback={null}>
          <NotificationBell orgId={ctx.orgId} userId={ctx.user.id} />
        </Suspense>
        <ThemeToggle />
        <UserMenu email={ctx.user.email} fullName={ctx.user.fullName} />
      </div>
    </header>
  );
}
