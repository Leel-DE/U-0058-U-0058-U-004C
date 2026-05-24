import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getUser } from '@/lib/auth';
import { AcceptForm } from './accept-form';

export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const user = await getUser();
  if (!user) redirect(`/login?next=/accept-invite/${token}`);

  return (
    <main className="container flex min-h-screen items-center justify-center py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>You&apos;ve been invited</CardTitle>
          <CardDescription>
            Accept the invitation to join the organization in Competitor Radar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <AcceptForm token={token} />
          <Button asChild variant="ghost" className="w-full">
            <Link href="/dashboard">Decline and go back</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
