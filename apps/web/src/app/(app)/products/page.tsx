import Link from 'next/link';
import { Download, GitCompare, PackageSearch, Plus, SlidersHorizontal } from 'lucide-react';
import { getContext } from '@/lib/auth';
import { formatCurrency } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { parseProductFilters } from '@/server/products/filters';
import { getProductFilterOptions, getProductIntelligenceList } from '@/server/products/queries';
import type { ProductCluster, ProductGroupSummary, ProductIntelligenceRow } from '@/server/products/types';
import { ProductsClusterTable } from './_components/products-cluster-table';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

export default async function ProductsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await getContext();
  const params = await searchParams;
  const filters = parseProductFilters(params);
  const [options, data] = await Promise.all([
    getProductFilterOptions(ctx.orgId),
    getProductIntelligenceList(ctx.orgId, filters),
  ]);
  const compareHref = `/products/compare?ids=${data.rows.slice(0, 4).map((row) => row.id).join(',')}`;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Products Intelligence</h1>
            <Badge variant="secondary">central entity layer</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Normalized product groups, competitor coverage, market pricing, volatility, stock signals, and trend intelligence.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm"><Link href="/products/new"><Plus className="mr-2 h-4 w-4" />Add my product</Link></Button>
          <Button asChild size="sm" variant="outline"><Link href={compareHref}><GitCompare className="mr-2 h-4 w-4" />Compare visible</Link></Button>
          <Button asChild size="sm" variant="outline"><Link href="/products/insights">Insights</Link></Button>
          <Button asChild size="sm" variant="outline"><Link href="/exports"><Download className="mr-2 h-4 w-4" />Export</Link></Button>
        </div>
      </header>

      <ProductFilters current={params} options={options} />

      {data.total === 0 ? (
        <EmptyState
          icon={<PackageSearch className="h-8 w-8" />}
          title="No product intelligence yet"
          description="Add competitors, run discovery, or create confirmed matches to populate normalized product analytics."
          action={<Button asChild><Link href="/competitors">Start with competitors</Link></Button>}
        />
      ) : (
        <>
          <IntelligenceSummary rows={data.rows} clusters={data.clusters} total={data.total} />
          <GroupSummary groups={data.groups} />
          <ProductsClusterTable
            clusters={data.clusters}
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
          />
        </>
      )}
    </div>
  );
}

function ProductFilters({
  current,
  options,
}: {
  current: SearchParams;
  options: Awaited<ReturnType<typeof getProductFilterOptions>>;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Intelligence filters</CardTitle>
            <CardDescription>Search by title, SKU, EAN/GTIN, alias, brand, competitor, price, stock, and specs.</CardDescription>
          </div>
          <SlidersHorizontal className="h-5 w-5 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        <form className="grid gap-3">
          <div className="grid gap-3 lg:grid-cols-[minmax(260px,1.2fr)_repeat(4,minmax(150px,1fr))]">
            <input name="search" defaultValue={field(current.search)} placeholder="Search title, SKU, GTIN, alias..." className="h-10 rounded-md border bg-background px-3 text-sm" />
            <select name="category" defaultValue={field(current.category) ?? 'all'} className="h-10 rounded-md border bg-background px-3 text-sm">
              <option value="all">All categories</option>
              {options.categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <select name="brand" defaultValue={field(current.brand) ?? 'all'} className="h-10 rounded-md border bg-background px-3 text-sm">
              <option value="all">All brands</option>
              {options.brands.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <select name="competitor" defaultValue={field(current.competitor) ?? 'all'} className="h-10 rounded-md border bg-background px-3 text-sm">
              <option value="all">All competitors</option>
              {options.competitors.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <select name="sort" defaultValue={field(current.sort) ?? 'updated_desc'} className="h-10 rounded-md border bg-background px-3 text-sm">
              <option value="updated_desc">Updated desc</option>
              <option value="price_asc">Price asc</option>
              <option value="price_desc">Price desc</option>
              <option value="volatility_desc">Volatility desc</option>
              <option value="title_asc">Title</option>
              <option value="competitors_desc">Competitors desc</option>
            </select>
          </div>

          <details className="rounded-md border p-3">
            <summary className="cursor-pointer text-sm font-medium">Advanced filters</summary>
            <div className="mt-3 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              <input name="minPrice" defaultValue={field(current.minPrice)} placeholder="Min price" className="h-10 rounded-md border bg-background px-3 text-sm" />
              <input name="maxPrice" defaultValue={field(current.maxPrice)} placeholder="Max price" className="h-10 rounded-md border bg-background px-3 text-sm" />
              <select name="availability" defaultValue={field(current.availability) ?? 'all'} className="h-10 rounded-md border bg-background px-3 text-sm">
                <option value="all">Any availability</option>
                <option value="in_stock">In stock</option>
                <option value="out_of_stock">Out of stock</option>
                <option value="unknown">Unknown</option>
              </select>
              <select name="discount" defaultValue={field(current.discount) ?? 'all'} className="h-10 rounded-md border bg-background px-3 text-sm">
                <option value="all">Any discount</option>
                <option value="discounted">Discounted</option>
                <option value="not_discounted">No discount</option>
              </select>
              <select name="stock" defaultValue={field(current.stock) ?? 'all'} className="h-10 rounded-md border bg-background px-3 text-sm">
                <option value="all">Any stock status</option>
                <option value="in_stock">Only in stock</option>
                <option value="out_of_stock">Only out of stock</option>
                <option value="mixed">Mixed stock</option>
                <option value="unknown">Unknown stock</option>
              </select>
              <select name="advanced" defaultValue={field(current.advanced) ?? 'all'} className="h-10 rounded-md border bg-background px-3 text-sm">
                <option value="all">No advanced flag</option>
                <option value="newly_discovered">Newly discovered</option>
                <option value="stale_data">Stale data</option>
                <option value="missing_prices">Missing prices</option>
                <option value="high_discounts">High discounts</option>
                <option value="price_drops">Price drops</option>
                <option value="stock_changes">Stock changes</option>
                <option value="only_matched">Only matched</option>
                <option value="only_unmatched">Only unmatched</option>
                <option value="only_duplicates">Duplicate risk</option>
              </select>
              <select name="groupBy" defaultValue={field(current.groupBy) ?? 'none'} className="h-10 rounded-md border bg-background px-3 text-sm">
                <option value="none">No grouping</option>
                <option value="brand">Group by brand</option>
                <option value="category">Group by category</option>
                <option value="competitor">Group by competitor coverage</option>
                <option value="stock">Group by stock</option>
                <option value="volatility">Group by volatility</option>
                <option value="discount">Group by discount</option>
                <option value="price_range">Group by price range</option>
              </select>
              <input name="motor" defaultValue={field(current.motor)} placeholder="Motor" className="h-10 rounded-md border bg-background px-3 text-sm" />
              <input name="battery" defaultValue={field(current.battery)} placeholder="Battery / Wh" className="h-10 rounded-md border bg-background px-3 text-sm" />
              <input name="wheelSize" defaultValue={field(current.wheelSize)} placeholder="Wheel size" className="h-10 rounded-md border bg-background px-3 text-sm" />
              <input name="travel" defaultValue={field(current.travel)} placeholder="Travel" className="h-10 rounded-md border bg-background px-3 text-sm" />
              <input name="frameMaterial" defaultValue={field(current.frameMaterial)} placeholder="Frame material" className="h-10 rounded-md border bg-background px-3 text-sm" />
              <input name="year" defaultValue={field(current.year)} placeholder="Year" className="h-10 rounded-md border bg-background px-3 text-sm" />
            </div>
          </details>

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="submit">Apply filters</Button>
            <Button asChild variant="outline"><Link href="/products">Reset</Link></Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function IntelligenceSummary({
  rows,
  clusters,
  total,
}: {
  rows: ProductIntelligenceRow[];
  clusters: ProductCluster[];
  total: number;
}) {
  const prices = rows.map((row) => row.currentAvgPrice).filter((price): price is number => price != null);
  const volatile = rows.filter((row) => row.volatility >= 10).length;
  const discounted = rows.filter((row) => row.activeDiscounts > 0).length;
  const stale = rows.filter((row) => row.stale).length;
  const missingPrice = rows.filter((row) => row.missingPrice).length;
  const avg = prices.length > 0 ? prices.reduce((sum, price) => sum + price, 0) / prices.length : null;
  const multiStore = clusters.filter((cluster) => cluster.storeCount > 1).length;
  const savingsSamples = clusters
    .map((cluster) => cluster.savingsPct)
    .filter((value): value is number => value != null && value > 0);
  const bestSavings = savingsSamples.length > 0 ? Math.max(...savingsSamples) : null;
  const currency = clusters[0]?.currency ?? rows[0]?.currency ?? 'EUR';
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
      <Metric label="Products" value={total.toLocaleString()} hint={`${clusters.length.toLocaleString()} groups`} />
      <Metric label="Visible avg price" value={formatCurrency(avg, currency)} />
      <Metric
        label="Multi-store groups"
        value={multiStore.toLocaleString()}
        hint={`of ${clusters.length.toLocaleString()} visible`}
      />
      <Metric
        label="Best savings"
        value={bestSavings == null ? '—' : `−${bestSavings.toFixed(1)}%`}
        hint={bestSavings == null ? 'no spread' : 'cheapest vs highest'}
      />
      <Metric
        label="Discounted"
        value={discounted.toLocaleString()}
        hint={`${volatile.toLocaleString()} volatile`}
      />
      <Metric
        label="Needs attention"
        value={(missingPrice + stale).toLocaleString()}
        hint={`${missingPrice} no price · ${stale} stale`}
      />
    </div>
  );
}

function GroupSummary({ groups }: { groups: ProductGroupSummary[] }) {
  if (groups.length === 0) return null;
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {groups.slice(0, 8).map((group) => (
        <Card key={group.key}>
          <CardContent className="p-4">
            <div className="truncate text-sm font-medium">{group.label}</div>
            <div className="mt-2 flex items-end justify-between gap-3">
              <div className="text-2xl font-semibold">{group.count}</div>
              <div className="text-right text-xs text-muted-foreground">
                <div>{formatCurrency(group.avgPrice, 'EUR')}</div>
                <div>{group.volatility.toFixed(1)}% volatility</div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase text-muted-foreground">{label}</div>
        <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
        {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}

function field(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
