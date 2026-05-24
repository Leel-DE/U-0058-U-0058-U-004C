import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getContext } from '@/lib/auth';
import { StoreForm } from '../_components/store-form';

export default async function NewCompetitorPage() {
  const ctx = await getContext();
  if (ctx.role === 'viewer') redirect('/competitors');
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Add competitor</h1>
        <p className="text-sm text-muted-foreground">
          Configure the store. You will set scraping selectors on the next step.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Store details</CardTitle>
        </CardHeader>
        <CardContent>
          <StoreForm mode="create" />
        </CardContent>
      </Card>
    </div>
  );
}
