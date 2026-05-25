'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, ExternalLink, Store } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ProductImage } from '@/components/product-image';
import { formatCurrency, formatPct, timeAgo } from '@/lib/utils';
import type {
  ProductCluster,
  ProductStockStatus,
  ProductStoreMember,
  ProductTrend,
} from '@/server/products/types';
import { ProductSparkline } from './product-charts';

type SortKey = 'stores' | 'savings' | 'min_price' | 'volatility' | 'title' | 'updated';

interface Props {
  clusters: ProductCluster[];
  page: number;
  pageSize: number;
  total: number;
}

export function ProductsClusterTable({ clusters, page, pageSize, total }: Props) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('stores');
  const [expandAll, setExpandAll] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    const trimmed = search.trim().toLowerCase();
    const base = trimmed
      ? clusters.filter((cluster) => {
          const haystack = [
            cluster.representative.canonicalTitle,
            cluster.representative.brand ?? '',
            cluster.representative.category ?? '',
            cluster.cheapestStoreName ?? '',
            ...cluster.members.map((member) => member.storeName),
          ]
            .join(' ')
            .toLowerCase();
          return haystack.includes(trimmed);
        })
      : clusters;

    const sorted = [...base];
    sorted.sort((a, b) => sortClusters(a, b, sortKey));
    return sorted;
  }, [clusters, search, sortKey]);

  const isExpanded = (key: string) => expandAll || expanded[key] === true;

  function toggle(key: string) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleAll() {
    setExpandAll((prev) => !prev);
    setExpanded({});
  }

  const multiStoreCount = clusters.filter((cluster) => cluster.storeCount > 1).length;
  const totalListings = clusters.reduce((sum, cluster) => sum + cluster.members.length, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <CardTitle>Product intelligence groups</CardTitle>
            <CardDescription>
              {clusters.length.toLocaleString()} groups · {totalListings.toLocaleString()} listings
              · {multiStoreCount.toLocaleString()} sold by 2+ stores · server-paginated at{' '}
              {pageSize} rows ({total.toLocaleString()} entities).
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Filter visible groups…"
              className="h-9 w-56"
            />
            <select
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as SortKey)}
              className="bg-background h-9 rounded-md border px-3 text-sm"
            >
              <option value="stores">Most stores</option>
              <option value="savings">Best savings</option>
              <option value="min_price">Cheapest first</option>
              <option value="volatility">Most volatile</option>
              <option value="updated">Recently updated</option>
              <option value="title">A → Z</option>
            </select>
            <Button size="sm" variant="outline" onClick={toggleAll}>
              {expandAll ? 'Collapse all' : 'Expand all'}
            </Button>
            <Badge variant="outline">page {page}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full min-w-[1400px] text-sm">
          <thead className="bg-muted/30 text-muted-foreground border-y text-left text-xs uppercase">
            <tr>
              <th className="w-10 px-2" aria-label="Expand" />
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Brand / Category</th>
              <th className="px-3 py-2">Stores</th>
              <th className="px-3 py-2">Cheapest at</th>
              <th className="px-3 py-2">Min · Avg · Max</th>
              <th className="px-3 py-2">Savings</th>
              <th className="px-3 py-2">Stock</th>
              <th className="px-3 py-2">Trend</th>
              <th className="px-3 py-2">Volatility</th>
              <th className="px-3 py-2">Updated</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={11} className="text-muted-foreground px-6 py-10 text-center text-sm">
                  No groups match your filter.
                </td>
              </tr>
            ) : (
              filtered.map((cluster) => (
                <ClusterRow
                  key={cluster.key}
                  cluster={cluster}
                  expanded={isExpanded(cluster.key)}
                  onToggle={() => toggle(cluster.key)}
                />
              ))
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function ClusterRow({
  cluster,
  expanded,
  onToggle,
}: {
  cluster: ProductCluster;
  expanded: boolean;
  onToggle: () => void;
}) {
  const rep = cluster.representative;
  const imageUrl =
    rep.imageUrl ?? cluster.members.find((member) => member.imageUrl)?.imageUrl ?? null;
  const expandable = cluster.members.length > 0;
  return (
    <>
      <tr
        className={
          'border-b last:border-0 ' +
          (expandable ? 'hover:bg-muted/40 cursor-pointer' : 'hover:bg-muted/20')
        }
        onClick={expandable ? onToggle : undefined}
      >
        <td className="px-2 py-3 align-top">
          {expandable ? (
            <button
              type="button"
              className="bg-background text-muted-foreground hover:text-foreground flex h-6 w-6 items-center justify-center rounded-md border"
              onClick={(event) => {
                event.stopPropagation();
                onToggle();
              }}
              aria-label={expanded ? 'Collapse group' : 'Expand group'}
            >
              {expanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
          ) : null}
        </td>
        <td className="px-3 py-3 align-top">
          <div className="flex items-start gap-3">
            <ProductImage src={imageUrl} className="h-12 w-12" sizes="48px" />
            <div className="min-w-0">
              <Link
                href={`/products/${rep.id}`}
                onClick={(event) => event.stopPropagation()}
                className="line-clamp-2 font-medium hover:underline"
              >
                {rep.canonicalTitle}
              </Link>
              <div className="mt-1 flex flex-wrap gap-1">
                <Badge variant={rep.entityType === 'normalized' ? 'success' : 'secondary'}>
                  {rep.entityType === 'normalized' ? 'matched' : 'raw'}
                </Badge>
                {rep.duplicateRisk ? <Badge variant="warning">duplicate risk</Badge> : null}
                {rep.missingPrice ? <Badge variant="destructive">missing price</Badge> : null}
                {rep.stale ? <Badge variant="outline">stale data</Badge> : null}
              </div>
            </div>
          </div>
        </td>
        <td className="px-3 py-3 align-top">
          <div className="font-medium">
            {rep.brand ? (
              <Link
                href={`/products/brands/${encodeURIComponent(rep.brand)}`}
                onClick={(event) => event.stopPropagation()}
                className="hover:underline"
              >
                {rep.brand}
              </Link>
            ) : (
              <span className="text-muted-foreground">Unknown brand</span>
            )}
          </div>
          <div className="text-muted-foreground text-xs">
            {rep.category ? (
              <Link
                href={`/products/categories/${encodeURIComponent(rep.category)}`}
                onClick={(event) => event.stopPropagation()}
                className="hover:underline"
              >
                {rep.category}
              </Link>
            ) : (
              'Uncategorized'
            )}
          </div>
        </td>
        <td className="px-3 py-3 align-top">
          <div className="flex items-center gap-1.5 tabular-nums">
            <Store className="text-muted-foreground h-3.5 w-3.5" aria-hidden="true" />
            <span className="font-semibold">{cluster.storeCount}</span>
          </div>
          <div className="text-muted-foreground text-xs">{cluster.members.length} listings</div>
        </td>
        <td className="px-3 py-3 align-top">
          {cluster.cheapestStoreName ? (
            <div className="space-y-1">
              <div className="text-sm font-medium">{cluster.cheapestStoreName}</div>
              <div className="text-success text-xs">
                {formatCurrency(cluster.minPrice, cluster.currency)}
              </div>
            </div>
          ) : (
            <span className="text-muted-foreground text-xs">No price</span>
          )}
        </td>
        <td className="px-3 py-3 align-top tabular-nums">
          <div>{formatCurrency(cluster.minPrice, cluster.currency)}</div>
          <div className="text-muted-foreground text-xs">
            {formatCurrency(cluster.avgPrice, cluster.currency)} ·{' '}
            {formatCurrency(cluster.maxPrice, cluster.currency)}
          </div>
        </td>
        <td className="px-3 py-3 align-top tabular-nums">
          <SavingsCell pct={cluster.savingsPct} />
        </td>
        <td className="px-3 py-3 align-top">
          <StockSummary
            status={rep.stockStatus}
            inStock={cluster.inStockStores}
            outOfStock={cluster.outOfStockStores}
          />
        </td>
        <td className="px-3 py-3 align-top">
          <TrendCell trend={rep.marketTrend} data={rep.sparkline} />
        </td>
        <td className="px-3 py-3 align-top">
          <VolatilityBadge value={rep.volatility} />
        </td>
        <td className="text-muted-foreground px-3 py-3 align-top">
          {timeAgo(cluster.lastChange ?? rep.updatedAt)}
        </td>
      </tr>
      {expanded && expandable ? (
        <tr className="bg-muted/10">
          <td className="px-2" />
          <td colSpan={10} className="px-3 pb-4 pt-1">
            <MembersPanel cluster={cluster} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function MembersPanel({ cluster }: { cluster: ProductCluster }) {
  const minPrice = cluster.minPrice;
  return (
    <div className="bg-background rounded-md border">
      <div className="bg-muted/30 text-muted-foreground grid grid-cols-[minmax(170px,1.05fr)_minmax(0,1.65fr)_96px_90px_116px_104px_96px] gap-3 border-b px-3 py-2 text-[11px] uppercase">
        <span>Store</span>
        <span>Listing</span>
        <span>Price</span>
        <span>Was</span>
        <span>Vs cheapest</span>
        <span>Stock</span>
        <span>Updated</span>
      </div>
      {cluster.members.map((member) => (
        <MemberRow key={member.competitorProductId} member={member} cheapestPrice={minPrice} />
      ))}
    </div>
  );
}

function MemberRow({
  member,
  cheapestPrice,
}: {
  member: ProductStoreMember;
  cheapestPrice: number | null;
}) {
  const delta =
    cheapestPrice != null && member.price != null && cheapestPrice > 0
      ? ((member.price - cheapestPrice) / cheapestPrice) * 100
      : null;
  const discount =
    member.price != null && member.oldPrice != null && member.oldPrice > member.price
      ? ((member.oldPrice - member.price) / member.oldPrice) * 100
      : null;
  const isCheapest = cheapestPrice != null && member.price === cheapestPrice;
  return (
    <div className="grid grid-cols-[minmax(170px,1.05fr)_minmax(0,1.65fr)_96px_90px_116px_104px_96px] items-center gap-3 border-b px-3 py-2.5 text-sm last:border-0">
      <div className="flex min-w-0 items-center gap-2">
        <ProductImage src={member.imageUrl} className="h-8 w-8" sizes="32px" />
        <div className="min-w-0">
          <div className="truncate font-medium">{member.storeName}</div>
          {isCheapest ? <Badge variant="success">cheapest</Badge> : null}
        </div>
      </div>
      <div className="min-w-0 overflow-hidden">
        {member.url ? (
          <a
            href={member.url}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground flex min-w-0 max-w-full items-center gap-1 text-xs hover:underline"
            onClick={(event) => event.stopPropagation()}
            title={member.title}
          >
            <span className="block min-w-0 flex-1 truncate">{member.title}</span>
            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
          </a>
        ) : (
          <span className="text-muted-foreground block truncate text-xs" title={member.title}>
            {member.title}
          </span>
        )}
      </div>
      <div className="min-w-0 tabular-nums">
        <div className="font-medium">{formatCurrency(member.price, member.currency)}</div>
        {discount != null ? (
          <div className="text-success text-xs">−{discount.toFixed(0)}%</div>
        ) : null}
      </div>
      <div className="text-muted-foreground min-w-0 tabular-nums">
        {member.oldPrice != null ? (
          <span className="line-through">{formatCurrency(member.oldPrice, member.currency)}</span>
        ) : (
          <span>—</span>
        )}
      </div>
      <div className="min-w-0 tabular-nums">
        {delta == null ? (
          <span className="text-muted-foreground">—</span>
        ) : delta === 0 ? (
          <Badge variant="success">match</Badge>
        ) : (
          <span className={delta > 0 ? 'text-destructive' : 'text-success'}>
            {delta > 0 ? '+' : ''}
            {delta.toFixed(1)}%
          </span>
        )}
      </div>
      <div className="min-w-0">
        <AvailabilityBadge value={member.availability} />
      </div>
      <div className="text-muted-foreground min-w-0 truncate text-xs">
        {timeAgo(member.lastScrapedAt)}
      </div>
    </div>
  );
}

function SavingsCell({ pct }: { pct: number | null }) {
  if (pct == null || pct <= 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  const variant = pct >= 25 ? 'destructive' : pct >= 10 ? 'warning' : 'secondary';
  return <Badge variant={variant}>−{pct.toFixed(1)}%</Badge>;
}

function StockSummary({
  status,
  inStock,
  outOfStock,
}: {
  status: ProductStockStatus;
  inStock: number;
  outOfStock: number;
}) {
  const variant =
    status === 'in_stock'
      ? 'success'
      : status === 'out_of_stock'
        ? 'destructive'
        : status === 'mixed'
          ? 'warning'
          : 'secondary';
  return (
    <div className="space-y-1">
      <Badge variant={variant}>{status.replace(/_/g, ' ')}</Badge>
      {inStock + outOfStock > 0 ? (
        <div className="text-muted-foreground text-xs tabular-nums">
          {inStock} in · {outOfStock} out
        </div>
      ) : null}
    </div>
  );
}

function AvailabilityBadge({ value }: { value: string | null }) {
  if (value === 'in_stock') return <Badge variant="success">in stock</Badge>;
  if (value === 'out_of_stock') return <Badge variant="destructive">out of stock</Badge>;
  return <Badge variant="secondary">unknown</Badge>;
}

function TrendCell({
  trend,
  data,
}: {
  trend: ProductTrend;
  data: { date: string; price: number | null }[];
}) {
  const icon =
    trend === 'falling' ? (
      <ArrowDown className="h-3.5 w-3.5" />
    ) : trend === 'rising' ? (
      <ArrowUp className="h-3.5 w-3.5" />
    ) : null;
  return (
    <div className="flex items-center gap-2">
      <div
        className={
          trend === 'falling'
            ? 'text-success'
            : trend === 'rising'
              ? 'text-destructive'
              : 'text-muted-foreground'
        }
      >
        {icon}
      </div>
      <ProductSparkline data={data} />
    </div>
  );
}

function VolatilityBadge({ value }: { value: number }) {
  const variant = value >= 20 ? 'destructive' : value >= 8 ? 'warning' : 'secondary';
  return <Badge variant={variant}>{formatPct(value)}</Badge>;
}

function sortClusters(a: ProductCluster, b: ProductCluster, key: SortKey): number {
  switch (key) {
    case 'stores':
      if (b.storeCount !== a.storeCount) return b.storeCount - a.storeCount;
      return (b.savingsPct ?? 0) - (a.savingsPct ?? 0);
    case 'savings':
      return (b.savingsPct ?? 0) - (a.savingsPct ?? 0);
    case 'min_price':
      if (a.minPrice == null && b.minPrice == null) return 0;
      if (a.minPrice == null) return 1;
      if (b.minPrice == null) return -1;
      return a.minPrice - b.minPrice;
    case 'volatility':
      return b.representative.volatility - a.representative.volatility;
    case 'updated':
      return (b.lastChange ?? '').localeCompare(a.lastChange ?? '');
    case 'title':
      return a.representative.canonicalTitle.localeCompare(b.representative.canonicalTitle);
    default:
      return 0;
  }
}
