'use client';

import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ProductCompetitorComparison } from '@/server/products/types';

export function OpenAllListingsButton({ competitors }: { competitors: ProductCompetitorComparison[] }) {
  const opens = competitors.filter((row) => Boolean(row.url));
  if (opens.length === 0) return null;
  return (
    <Button
      variant="outline"
      onClick={() => {
        if (typeof window === 'undefined') return;
        for (const row of opens.slice(0, 8)) {
          window.open(row.url, '_blank', 'noopener,noreferrer');
        }
      }}
    >
      <ExternalLink className="mr-2 h-4 w-4" /> Open all {opens.length} listings
    </Button>
  );
}
