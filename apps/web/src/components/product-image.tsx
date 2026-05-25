'use client';

import { useState } from 'react';
import { PackageSearch } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ProductImage({
  src,
  alt = '',
  className,
  imageClassName,
  iconClassName,
  priority = false,
}: {
  src: string | null | undefined;
  alt?: string;
  className?: string;
  imageClassName?: string;
  iconClassName?: string;
  sizes?: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const normalized = normalizeDisplaySrc(src);
  const showImage = Boolean(normalized) && !failed;

  return (
    <span
      className={cn(
        'border-border/70 bg-muted/60 relative flex shrink-0 items-center justify-center overflow-hidden rounded-md border',
        className,
      )}
    >
      {showImage ? (
        // Scraped product images can come from any competitor domain, including
        // http-only catalog fixtures, so next/image remote allowlists are too
        // brittle here.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={normalized ?? ''}
          alt={alt}
          className={cn('h-full w-full object-contain', imageClassName)}
          onError={() => setFailed(true)}
          loading={priority ? 'eager' : 'lazy'}
        />
      ) : (
        <PackageSearch className={cn('text-muted-foreground h-4 w-4', iconClassName)} />
      )}
    </span>
  );
}

function normalizeDisplaySrc(src: string | null | undefined): string | null {
  const trimmed = src?.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (trimmed.startsWith('/') || /^https?:\/\//i.test(trimmed) || /^data:image\//i.test(trimmed)) {
    return trimmed;
  }
  return null;
}
