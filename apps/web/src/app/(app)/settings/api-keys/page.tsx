import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function ApiKeysSettings() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>API keys</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Programmatic access via API keys is on the roadmap. Use Supabase service role for
        server-to-server access in the meantime.
      </CardContent>
    </Card>
  );
}
