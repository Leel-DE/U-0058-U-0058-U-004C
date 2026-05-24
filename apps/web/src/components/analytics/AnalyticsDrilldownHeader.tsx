import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function AnalyticsDrilldownHeader({
  title,
  description,
  backHref = '/analytics',
}: {
  title: string;
  description: string;
  backHref?: string;
}) {
  return (
    <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Button asChild variant="outline"><Link href={backHref}>Analytics home</Link></Button>
    </header>
  );
}
