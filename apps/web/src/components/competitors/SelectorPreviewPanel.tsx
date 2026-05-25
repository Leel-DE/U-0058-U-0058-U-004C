import { CheckCircle2, ImageIcon, LinkIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { StoreAnalysisResult } from '@cr/shared';

export function SelectorPreviewPanel({ analysis }: { analysis: StoreAnalysisResult }) {
  const product = analysis.previews.product;
  const category = analysis.previews.category;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-md border p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
          <CheckCircle2 className="h-4 w-4 text-success" />
          Product preview
        </div>
        {product ? (
          <div className="space-y-2 text-sm">
            <PreviewRow label="Title" value={product.title} />
            <PreviewRow label="Price" value={priceText(product.price, product.currency)} />
            <PreviewRow label="Old price" value={priceText(product.oldPrice, product.currency)} />
            <PreviewRow label="Availability" value={product.availability} />
            <PreviewRow label="Image" value={product.image} icon={<ImageIcon className="h-3.5 w-3.5" />} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No product page preview was available.</p>
        )}
      </div>

      <div className="rounded-md border p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
          <CheckCircle2 className="h-4 w-4 text-success" />
          Category preview
        </div>
        {category ? (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">{category.cardCount} product cards detected</div>
            {category.cards.slice(0, 3).map((card, index) => (
              <div key={`${card.link ?? card.title ?? index}`} className="rounded-md bg-muted/40 p-3 text-sm">
                <div className="font-medium">{card.title ?? 'Untitled product'}</div>
                <div className="mt-1 text-muted-foreground">{priceText(card.price, card.currency) ?? 'No price'}</div>
                {card.link ? (
                  <div className="mt-1 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                    <LinkIcon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{card.link}</span>
                  </div>
                ) : null}
              </div>
            ))}
            {category.paginationNext ? <PreviewRow label="Pagination" value={category.paginationNext} /> : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No category preview was available.</p>
        )}
      </div>
    </div>
  );
}

function PreviewRow({ label, value, icon }: { label: string; value?: string | number; icon?: ReactNode }) {
  return (
    <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-3">
      <div className="text-muted-foreground">{label}</div>
      <div className="flex min-w-0 items-center gap-1">
        {icon}
        <span className="truncate">{value ?? 'Not detected'}</span>
      </div>
    </div>
  );
}

function priceText(value?: number, currency?: string) {
  if (value == null) return undefined;
  return `${value} ${currency ?? ''}`.trim();
}
