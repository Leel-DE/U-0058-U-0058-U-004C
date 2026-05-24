import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function NotificationsSettings() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Notification preferences</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Per-user channel preferences (email digest cadence, webhook URLs) will land in the next
        release. For now, all members receive in-app notifications, and owners/managers also
        receive email.
      </CardContent>
    </Card>
  );
}
