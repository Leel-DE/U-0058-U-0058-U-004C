import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getContext } from '@/lib/auth';

export default async function DangerZonePage() {
  const ctx = await getContext();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Danger zone</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div>
          <div className="font-medium">Delete organization</div>
          <p className="text-muted-foreground">
            Permanently delete <span className="font-medium">{ctx.orgs.find((o) => o.id === ctx.orgId)?.name}</span>{' '}
            and all its data. This cannot be undone.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            (Server action will land in Phase 12 — for MVP, contact support.)
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
