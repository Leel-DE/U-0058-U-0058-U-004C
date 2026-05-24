import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getUser, getUserOrgs } from '@/lib/auth';
import { OnboardingForm } from './onboarding-form';

export const metadata = { title: 'Create organization — Competitor Radar' };

export default async function OnboardingPage() {
  const user = await getUser();
  if (!user) redirect('/login');
  const orgs = await getUserOrgs(user.id);
  if (orgs.length > 0) redirect('/dashboard');

  return (
    <main className="container flex min-h-screen items-center justify-center py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create your organization</CardTitle>
          <CardDescription>
            All your competitors, products and alerts live inside an organization. You can invite
            teammates later.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OnboardingForm />
        </CardContent>
      </Card>
    </main>
  );
}
