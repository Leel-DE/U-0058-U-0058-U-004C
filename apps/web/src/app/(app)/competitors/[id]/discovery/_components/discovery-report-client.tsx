'use client';

import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ProductImage } from '@/components/product-image';
import { saveDiscoveredProducts } from '@/server/actions/discovery';

interface Product {
  id: string;
  url: string;
  title: string | null;
  price: string | null;
  oldPrice: string | null;
  currency: string | null;
  availability: string | null;
  imageUrl: string | null;
  brand: string | null;
  sku: string | null;
  ean: string | null;
  gtin: string | null;
  rating: string | null;
  shipping: string | null;
  categoryPath: string | null;
  confidence: string | null;
  source: string;
  rawCardJson: unknown;
  rawDetailJson: unknown;
}

interface Category {
  id: string;
  url: string;
  name: string;
  path: string | null;
  productsFound: number;
  breadcrumbs: unknown;
  confidence: string | null;
}

export function DiscoveryReportClient({
  storeId,
  runId,
  products,
  categories,
}: {
  storeId: string;
  runId: string;
  products: Product[];
  categories: Category[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [onlyDiscounted, setOnlyDiscounted] = useState(false);
  const [onlyMissingPrice, setOnlyMissingPrice] = useState(false);
  const [drawerProduct, setDrawerProduct] = useState<Product | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    return products.filter((product) => {
      if (
        query &&
        !`${product.title ?? ''} ${product.brand ?? ''} ${product.sku ?? ''} ${product.url}`
          .toLowerCase()
          .includes(query.toLowerCase())
      )
        return false;
      if (category && product.categoryPath !== category) return false;
      if (onlyDiscounted && !(Number(product.oldPrice) > Number(product.price))) return false;
      if (onlyMissingPrice && product.price) return false;
      return true;
    });
  }, [products, query, category, onlyDiscounted, onlyMissingPrice]);

  const categoryOptions = [
    ...new Set(products.map((product) => product.categoryPath).filter(Boolean)),
  ] as string[];

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function download(kind: 'csv' | 'json') {
    const rows = filtered.map((product) => ({
      title: product.title,
      price: product.price,
      oldPrice: product.oldPrice,
      currency: product.currency,
      availability: product.availability,
      brand: product.brand,
      sku: product.sku,
      gtin: product.gtin ?? product.ean,
      categoryPath: product.categoryPath,
      url: product.url,
      confidence: product.confidence,
    }));
    const content =
      kind === 'json'
        ? JSON.stringify(rows, null, 2)
        : [
            Object.keys(rows[0] ?? { title: '', price: '', url: '' }).join(','),
            ...rows.map((row) =>
              Object.values(row)
                .map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`)
                .join(','),
            ),
          ].join('\n');
    const blob = new Blob([content], {
      type: kind === 'json' ? 'application/json' : 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `discovery-${runId}.${kind}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function save(saveAllValid: boolean) {
    startTransition(async () => {
      const res = await saveDiscoveredProducts({
        storeId,
        runId,
        productIds: saveAllValid ? undefined : [...selected],
        saveAllValid,
      });
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      toast.success(`Saved ${res.data.imported} products, skipped ${res.data.skipped}`);
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="rounded-md border p-4">
          <div className="mb-3 font-medium">Category tree</div>
          <div className="max-h-80 space-y-2 overflow-auto text-sm">
            {categories.length === 0 ? (
              <p className="text-muted-foreground">No categories detected.</p>
            ) : null}
            {categories.map((cat) => (
              <div key={cat.id} className="rounded border p-2">
                <div className="font-medium">{cat.name}</div>
                <div className="text-muted-foreground break-all text-xs">{cat.path ?? cat.url}</div>
                <div className="text-muted-foreground mt-1 text-xs">
                  {cat.productsFound} products · {Math.round(Number(cat.confidence ?? 0) * 100)}%
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-2 rounded-md border p-4">
          <Button
            className="w-full"
            onClick={() => save(false)}
            disabled={pending || selected.size === 0}
          >
            Save selected ({selected.size})
          </Button>
          <Button
            className="w-full"
            variant="outline"
            onClick={() => save(true)}
            disabled={pending}
          >
            Save all valid
          </Button>
          <Button className="w-full" variant="outline" onClick={() => download('csv')}>
            Export CSV
          </Button>
          <Button className="w-full" variant="outline" onClick={() => download('csv')}>
            Export Excel CSV
          </Button>
          <Button className="w-full" variant="outline" onClick={() => download('json')}>
            Export JSON
          </Button>
        </div>
      </div>

      <div className="space-y-3 rounded-md border p-4">
        <div className="grid gap-3 md:grid-cols-5">
          <Input
            placeholder="Search title, brand, sku..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            className="bg-background rounded-md border px-3 text-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {categoryOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={onlyDiscounted}
              onChange={(e) => setOnlyDiscounted(e.target.checked)}
            />{' '}
            discounted
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={onlyMissingPrice}
              onChange={(e) => setOnlyMissingPrice(e.target.checked)}
            />{' '}
            missing price
          </label>
          <Button variant="outline" onClick={() => setSelected(new Set(filtered.map((p) => p.id)))}>
            Select filtered
          </Button>
        </div>

        <div className="overflow-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="text-muted-foreground text-left text-xs uppercase">
              <tr>
                <th className="py-2"></th>
                <th className="py-2">Image</th>
                <th className="py-2">Title</th>
                <th className="py-2">Price</th>
                <th className="py-2">Old</th>
                <th className="py-2">Availability</th>
                <th className="py-2">Brand</th>
                <th className="py-2">SKU/EAN</th>
                <th className="py-2">Category</th>
                <th className="py-2">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((product) => (
                <tr key={product.id} className="border-t">
                  <td className="py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(product.id)}
                      onChange={() => toggle(product.id)}
                    />
                  </td>
                  <td className="py-2">
                    <ProductImage src={product.imageUrl} className="h-12 w-12" sizes="48px" />
                  </td>
                  <td className="max-w-sm py-2">
                    <button
                      className="text-left font-medium hover:underline"
                      onClick={() => setDrawerProduct(product)}
                    >
                      {product.title ?? 'Missing title'}
                    </button>
                    <div className="text-muted-foreground break-all text-xs">{product.url}</div>
                  </td>
                  <td className="py-2 font-medium">
                    {product.price ? `${product.price} ${product.currency ?? ''}` : '-'}
                  </td>
                  <td className="text-muted-foreground py-2">{product.oldPrice ?? '-'}</td>
                  <td className="py-2">
                    <Badge variant="outline">{product.availability ?? 'unknown'}</Badge>
                  </td>
                  <td className="py-2">{product.brand ?? '-'}</td>
                  <td className="py-2">{product.sku ?? product.gtin ?? product.ean ?? '-'}</td>
                  <td className="text-muted-foreground max-w-xs py-2">
                    {product.categoryPath ?? '-'}
                  </td>
                  <td className="py-2">{Math.round(Number(product.confidence ?? 0) * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog
        open={Boolean(drawerProduct)}
        onOpenChange={(open) => !open && setDrawerProduct(null)}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{drawerProduct?.title ?? 'Product detail'}</DialogTitle>
            <DialogDescription>{drawerProduct?.url}</DialogDescription>
          </DialogHeader>
          <pre className="bg-muted max-h-[60vh] overflow-auto rounded p-3 text-xs">
            {drawerProduct ? JSON.stringify(drawerProduct, null, 2) : ''}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}
