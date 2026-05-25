import { redirect } from 'next/navigation';
import { IntelligentStoreOnboarding } from '@/components/competitors/IntelligentStoreOnboarding';
import { getContext } from '@/lib/auth';
import { StoreForm } from '../_components/store-form';

export default async function NewCompetitorPage() {
  const ctx = await getContext();
  if (ctx.role === 'viewer') redirect('/competitors');
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Add competitor</h1>
        <p className="text-sm text-muted-foreground">
          Paste a homepage URL. The platform will analyze structure, rendering, selectors, and scraping defaults before anything is saved.
        </p>
      </header>
      <IntelligentStoreOnboarding manualFallback={<StoreForm mode="create" />} />
    </div>
  );
}
