import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { extractProductSpecs } from './spec-extractor';
import { confidenceFromSignals, inferTrend } from './normalization';
import { discountPct, priceRangeLabel, stockRatio, stockStatus, volatilityScore } from './metrics';
import type {
  CrossStoreCandidate,
  ProductAnalyticsPageData,
  ProductCluster,
  ProductCompetitorComparison,
  ProductDetail,
  ProductDetailPoint,
  ProductEvent,
  ProductFilterOptions,
  ProductGroupSummary,
  ProductIdentifiers,
  ProductInsight,
  ProductIntelligenceFilters,
  ProductIntelligenceList,
  ProductIntelligenceRow,
  ProductMissingStore,
  ProductPriceStats,
  ProductSparkPoint,
  ProductSpreadPoint,
  ProductStoreMember,
} from './types';
import { buildStoreSearchUrl } from './search-urls';

interface EntityRow extends Record<string, unknown> {
  total_count: number;
  id: string;
  entity_type: 'normalized' | 'raw_competitor';
  canonical_title: string | null;
  brand: string | null;
  category: string | null;
  image_url: string | null;
  competitors_count: number;
  current_min_price: string | null;
  current_avg_price: string | null;
  current_max_price: string | null;
  currency: string | null;
  hist_min: string | null;
  hist_avg: string | null;
  hist_max: string | null;
  first_price: string | null;
  last_price: string | null;
  in_stock_count: number;
  out_stock_count: number;
  unknown_stock_count: number;
  active_discounts: number;
  last_change: string | null;
  discovered_at: string | null;
  updated_at: string | null;
  matched: boolean;
  duplicate_risk: boolean;
  stale: boolean;
  missing_price: boolean;
  has_gtin: boolean;
  has_sku: boolean;
  sparkline: unknown;
  members: unknown;
  cluster_key: string | null;
}

interface FilterOptionRow extends Record<string, unknown> {
  value: string | null;
  label: string | null;
  count: number;
}

export async function getProductFilterOptions(orgId: string): Promise<ProductFilterOptions> {
  const [brands, categories, competitors] = await Promise.all([
    db().execute<FilterOptionRow>(sql`
      select coalesce(brand, 'Unknown') as value, coalesce(brand, 'Unknown') as label, count(*)::int as count
      from (
        select brand from my_products where org_id = ${orgId}
        union all
        select brand from competitor_products where org_id = ${orgId}
      ) x
      group by coalesce(brand, 'Unknown')
      order by count desc, label asc
      limit 80
    `),
    db().execute<FilterOptionRow>(sql`
      select c.id::text as value, c.name as label, count(mp.id)::int as count
      from categories c
      left join my_products mp on mp.category_id = c.id
      where c.org_id = ${orgId}
      group by c.id, c.name
      order by c.name asc
    `),
    db().execute<FilterOptionRow>(sql`
      select st.id::text as value, st.name as label, count(cp.id)::int as count
      from stores st
      left join competitor_products cp on cp.store_id = st.id
      where st.org_id = ${orgId}
      group by st.id, st.name
      order by st.name asc
    `),
  ]);

  return {
    brands: brands.map((row) => ({
      value: row.value ?? 'Unknown',
      label: row.label ?? 'Unknown',
      count: Number(row.count),
    })),
    categories: categories.map((row) => ({
      value: row.value ?? '',
      label: row.label ?? 'Uncategorized',
      count: Number(row.count),
    })),
    competitors: competitors.map((row) => ({
      value: row.value ?? '',
      label: row.label ?? 'Unknown',
      count: Number(row.count),
    })),
  };
}

export async function getProductIntelligenceList(
  orgId: string,
  filters: ProductIntelligenceFilters,
): Promise<ProductIntelligenceList> {
  const offset = (filters.page - 1) * filters.pageSize;
  const rows = await db().execute<EntityRow>(
    entitiesQuery(
      orgId,
      filters,
      sql`
    select *, count(*) over()::int as total_count
    from filtered_entities
    order by
      case when ${filters.sort} = 'price_asc' then current_avg_price end asc nulls last,
      case when ${filters.sort} = 'price_desc' then current_avg_price end desc nulls last,
      case when ${filters.sort} = 'volatility_desc' then ((hist_max - hist_min) / nullif(hist_avg, 0)) end desc nulls last,
      case when ${filters.sort} = 'title_asc' then canonical_title end asc,
      case when ${filters.sort} = 'competitors_desc' then competitors_count end desc,
      updated_at desc nulls last,
      discovered_at desc nulls last
    limit ${filters.pageSize}
    offset ${offset}
  `,
    ),
  );

  const mapped = rows.map(mapEntityRow);
  return {
    rows: mapped,
    clusters: buildClusters(mapped),
    groups: buildGroups(mapped, filters.groupBy),
    total: Number(rows[0]?.total_count ?? 0),
    page: filters.page,
    pageSize: filters.pageSize,
  };
}

export async function getProductDetail(orgId: string, id: string): Promise<ProductDetail | null> {
  const [header] = await db().execute<EntityRow>(
    entitiesQuery(
      orgId,
      {
        groupBy: 'none',
        sort: 'updated_desc',
        page: 1,
        pageSize: 1,
        specs: {},
      },
      sql`
    select *, 1::int as total_count
    from filtered_entities
    where id = ${id}
    limit 1
  `,
    ),
  );

  if (!header) return null;
  const entity = mapEntityRow(header);

  const [competitors, timeline, identifiersAndOwn, missingFromStores] = await Promise.all([
    getProductCompetitors(orgId, id, entity.entityType),
    getProductTimeline(orgId, id, entity.entityType),
    getProductIdentifiers(orgId, id, entity.entityType),
    getMissingFromStores(orgId, id, entity.entityType, entity.canonicalTitle, entity.brand),
  ]);

  const spread = buildSpreadTimeline(timeline);
  const events = buildProductEvents(timeline, competitors);
  const imageUrl =
    normalizeImageUrl(entity.imageUrl, identifiersAndOwn.url) ??
    competitors.find((row) => row.imageUrl)?.imageUrl ??
    null;
  const prices = competitors
    .map((row) => row.currentPrice)
    .filter((price): price is number => price != null);
  const highestPrice = prices.length > 0 ? Math.max(...prices) : null;
  const minPrice = prices.length > 0 ? Math.min(...prices) : null;
  const cheapest = competitors
    .filter((row) => row.currentPrice != null)
    .sort((a, b) => Number(a.currentPrice) - Number(b.currentPrice))[0];
  const activeDiscounts = competitors
    .map((row) => row.discountPct)
    .filter((value): value is number => value != null);
  const inStockCount = competitors.filter((row) => row.availability === 'in_stock').length;
  const outOfStockCount = competitors.filter((row) => row.availability === 'out_of_stock').length;

  const priceStats = computePriceStats(timeline);
  const spreadAmount =
    entity.currentMinPrice != null && entity.currentMaxPrice != null
      ? Number((entity.currentMaxPrice - entity.currentMinPrice).toFixed(2))
      : null;
  const spreadPct =
    entity.currentMinPrice != null && entity.currentMaxPrice != null && entity.currentMaxPrice > 0
      ? Number(
          (
            ((entity.currentMaxPrice - entity.currentMinPrice) / entity.currentMaxPrice) *
            100
          ).toFixed(1),
        )
      : null;

  return {
    id: entity.id,
    entityType: entity.entityType,
    canonicalTitle: entity.canonicalTitle,
    imageUrl,
    brand: entity.brand,
    category: entity.category,
    specs: extractProductSpecs(entity.canonicalTitle, entity.brand),
    confidence: entity.confidence,
    competitorsCount: entity.competitorsCount,
    lastUpdated: entity.updatedAt,
    url: identifiersAndOwn.url,
    myPrice: identifiersAndOwn.myPrice,
    identifiers: identifiersAndOwn.identifiers,
    overview: {
      cheapestCompetitor: cheapest?.competitorName ?? null,
      highestPrice,
      minPrice,
      averagePrice: entity.currentAvgPrice,
      currentDiscountPct: activeDiscounts.length > 0 ? Math.max(...activeDiscounts) : null,
      stockRatio: stockRatio(inStockCount, competitors.length),
      volatilityScore: entity.volatility,
      marketTrend: entity.marketTrend,
      competitorSpread: spreadAmount,
      spreadPct,
      inStockCount,
      outOfStockCount,
      currency: entity.currency,
    },
    priceStats,
    competitors,
    missingFromStores,
    priceTimeline: timeline,
    spreadTimeline: spread,
    events,
  };
}

interface IdentifierBundle {
  identifiers: ProductIdentifiers;
  url: string | null;
  myPrice: number | null;
}

interface IdentifierRow extends Record<string, unknown> {
  brand: string | null;
  sku: string | null;
  gtin: string | null;
  url: string | null;
  my_price: string | null;
  competitor_skus: string[] | null;
  competitor_gtins: string[] | null;
  competitor_titles: string[] | null;
}

async function getProductIdentifiers(
  orgId: string,
  id: string,
  entityType: 'normalized' | 'raw_competitor',
): Promise<IdentifierBundle> {
  if (entityType === 'normalized') {
    const [row] = await db().execute<IdentifierRow>(sql`
      with my as (
        select id, brand, sku, gtin, url, my_price::text as my_price
        from my_products
        where org_id = ${orgId} and id = ${id}
        limit 1
      ),
      matched as (
        select cp.sku, cp.gtin, cp.title
        from product_matches pm
        join competitor_products cp on cp.id = pm.competitor_product_id
        where pm.org_id = ${orgId}
          and pm.my_product_id = ${id}
          and pm.status = 'confirmed'
      )
      select
        my.brand,
        my.sku,
        my.gtin,
        my.url,
        my.my_price,
        array_remove(array(select distinct sku from matched where sku is not null and sku <> ''), null) as competitor_skus,
        array_remove(array(select distinct gtin from matched where gtin is not null and gtin <> ''), null) as competitor_gtins,
        array_remove(array(select distinct title from matched where title is not null and title <> ''), null) as competitor_titles
      from my
    `);
    if (!row) return emptyIdentifierBundle();
    return {
      identifiers: {
        brand: row.brand,
        sku: row.sku,
        gtin: row.gtin,
        competitorSkus: row.competitor_skus ?? [],
        competitorGtins: row.competitor_gtins ?? [],
        competitorTitles: row.competitor_titles ?? [],
      },
      url: row.url,
      myPrice: numberOrNull(row.my_price),
    };
  }
  const [row] = await db().execute<IdentifierRow>(sql`
    select brand, sku, gtin, url, null::text as my_price,
           array[]::text[] as competitor_skus,
           array[]::text[] as competitor_gtins,
           array[]::text[] as competitor_titles
    from competitor_products
    where org_id = ${orgId} and id = ${id}
    limit 1
  `);
  if (!row) return emptyIdentifierBundle();
  return {
    identifiers: {
      brand: row.brand,
      sku: row.sku,
      gtin: row.gtin,
      competitorSkus: row.sku ? [row.sku] : [],
      competitorGtins: row.gtin ? [row.gtin] : [],
      competitorTitles: [],
    },
    url: row.url,
    myPrice: null,
  };
}

function emptyIdentifierBundle(): IdentifierBundle {
  return {
    identifiers: {
      brand: null,
      sku: null,
      gtin: null,
      competitorSkus: [],
      competitorGtins: [],
      competitorTitles: [],
    },
    url: null,
    myPrice: null,
  };
}

interface MissingStoreRow extends Record<string, unknown> {
  store_id: string;
  store_name: string;
  store_domain: string | null;
  currency: string | null;
  status: string | null;
  framework: string | null;
  discovery_preset: string | null;
  scraped_count: number;
}

async function getMissingFromStores(
  orgId: string,
  id: string,
  entityType: 'normalized' | 'raw_competitor',
  title: string,
  brand: string | null,
): Promise<ProductMissingStore[]> {
  const matchedStoresExpr =
    entityType === 'normalized'
      ? sql`
        select distinct cp.store_id
        from product_matches pm
        join competitor_products cp on cp.id = pm.competitor_product_id
        where pm.org_id = ${orgId}
          and pm.my_product_id = ${id}
          and pm.status = 'confirmed'
      `
      : sql`
        select store_id
        from competitor_products
        where org_id = ${orgId} and id = ${id}
      `;
  const rows = await db().execute<MissingStoreRow>(sql`
    select
      st.id::text as store_id,
      st.name as store_name,
      st.domain as store_domain,
      st.currency,
      st.status::text as status,
      cprof.framework,
      st.discovery_preset,
      (
        select count(*)::int from competitor_products cp
        where cp.org_id = ${orgId} and cp.store_id = st.id
      ) as scraped_count
    from stores st
    left join competitor_profiles cprof on cprof.store_id = st.id
    where st.org_id = ${orgId}
      and st.id not in (${matchedStoresExpr})
    order by st.status asc, st.name asc
  `);
  const query = [brand, title].filter(Boolean).join(' ').trim() || title;
  return rows.map((row) => ({
    storeId: row.store_id,
    storeName: row.store_name,
    storeDomain: row.store_domain,
    currency: row.currency,
    status: row.status,
    scrapedCount: Number(row.scraped_count ?? 0),
    searchUrl: buildStoreSearchUrl(query, {
      domain: row.store_domain ?? '',
      framework: row.framework,
      discoveryPreset: row.discovery_preset,
    }),
  }));
}

interface CrossStoreCandidateRow extends Record<string, unknown> {
  competitor_product_id: string;
  store_id: string;
  store_name: string;
  store_domain: string | null;
  title: string;
  url: string;
  image_url: string | null;
  brand: string | null;
  sku: string | null;
  gtin: string | null;
  price: string | null;
  old_price: string | null;
  currency: string | null;
  availability: string | null;
  last_scraped_at: string | null;
  title_sim: string | null;
  gtin_match: boolean;
  sku_match: boolean;
  brand_match: boolean;
}

/**
 * Find candidate competitor_products from the org's already-scraped data
 * that look like the same model as the source product. No external network
 * call — pure DB lookup over GTIN/SKU exact match + Postgres pg_trgm title
 * similarity, scoped to the given stores (defaults to all stores where the
 * product is not yet matched).
 */
export async function findCrossStoreCandidates(
  orgId: string,
  id: string,
  entityType: 'normalized' | 'raw_competitor',
  options: { storeIds?: string[]; perStoreLimit?: number; minSimilarity?: number } = {},
): Promise<Record<string, CrossStoreCandidate[]>> {
  const perStoreLimit = options.perStoreLimit ?? 6;
  const minSimilarity = options.minSimilarity ?? 0.2;
  const storeFilter =
    options.storeIds && options.storeIds.length > 0
      ? sql`and st.id in (${sql.join(
          options.storeIds.map((id) => sql`${id}`),
          sql`, `,
        )})`
      : sql``;

  const sourceCte =
    entityType === 'normalized'
      ? sql`
        select id::text as id, name as title, brand, sku, gtin
        from my_products
        where org_id = ${orgId} and id = ${id}
        limit 1
      `
      : sql`
        select id::text as id, coalesce(title, url) as title, brand, sku, gtin
        from competitor_products
        where org_id = ${orgId} and id = ${id}
        limit 1
      `;

  // Build a per-store ranked list using a window function so we can keep
  // perStoreLimit candidates per store without making N queries.
  const rows = await db().execute<CrossStoreCandidateRow>(sql`
    with src as (${sourceCte}),
    candidates as (
      select
        cp.id::text as competitor_product_id,
        st.id::text as store_id,
        st.name as store_name,
        st.domain as store_domain,
        coalesce(cp.title, cp.url) as title,
        cp.url,
        coalesce(nullif(cp.image_url, ''), nullif(latest.image_url, '')) as image_url,
        cp.brand,
        cp.sku,
        cp.gtin,
        cp.last_snapshot_price::text as price,
        null::text as old_price,
        cp.last_snapshot_currency as currency,
        cp.last_snapshot_availability as availability,
        cp.last_scraped_at::text as last_scraped_at,
        similarity(coalesce(cp.title, ''), src.title)::text as title_sim,
        (cp.gtin is not null and src.gtin is not null and cp.gtin = src.gtin) as gtin_match,
        (cp.sku is not null and src.sku is not null and lower(cp.sku) = lower(src.sku)) as sku_match,
        (cp.brand is not null and src.brand is not null and lower(cp.brand) = lower(src.brand)) as brand_match
      from competitor_products cp
      join stores st on st.id = cp.store_id
      cross join src
      left join lateral (
        select ps.image_url
        from price_snapshots ps
        where ps.competitor_product_id = cp.id
          and ps.org_id = ${orgId}
        order by ps.scraped_at desc
        limit 1
      ) latest on true
      where cp.org_id = ${orgId}
        ${storeFilter}
        and not exists (
          select 1 from product_matches pm
          where pm.org_id = ${orgId}
            and pm.competitor_product_id = cp.id
            and ${entityType === 'normalized' ? sql`pm.my_product_id = src.id::uuid` : sql`true`}
            and pm.status in ('confirmed', 'rejected')
        )
        and (
          (cp.gtin is not null and src.gtin is not null and cp.gtin = src.gtin)
          or (cp.sku is not null and src.sku is not null and lower(cp.sku) = lower(src.sku))
          or similarity(coalesce(cp.title, ''), src.title) >= ${minSimilarity}
        )
    ),
    ranked as (
      select *,
        row_number() over (
          partition by store_id
          order by
            case when gtin_match then 1 when sku_match then 2 else 3 end,
            title_sim::numeric desc nulls last
        ) as rn
      from candidates
    )
    select *
    from ranked
    where rn <= ${perStoreLimit}
    order by store_id, rn
  `);

  const grouped: Record<string, CrossStoreCandidate[]> = {};
  for (const row of rows) {
    const candidate = mapCrossStoreCandidate(row);
    const bucket = grouped[row.store_id] ?? [];
    bucket.push(candidate);
    grouped[row.store_id] = bucket;
  }
  return grouped;
}

function mapCrossStoreCandidate(row: CrossStoreCandidateRow): CrossStoreCandidate {
  const titleSim = numberOrNull(row.title_sim) ?? 0;
  let similarity = titleSim;
  let method: CrossStoreCandidate['matchMethod'] = 'title_similarity';
  const reasons: string[] = [];

  if (row.gtin_match) {
    similarity = 0.99;
    method = 'gtin';
    reasons.push('GTIN exact match');
  } else if (row.sku_match) {
    similarity = 0.95;
    method = 'sku';
    reasons.push('SKU exact match');
  } else {
    const brandBonus = row.brand_match ? 0.12 : 0;
    similarity = Math.min(0.92, titleSim + brandBonus);
    if (row.brand_match && titleSim >= 0.35) {
      method = 'brand_model';
      reasons.push(`Brand match + title similarity ${(titleSim * 100).toFixed(0)}%`);
    } else {
      reasons.push(`Title similarity ${(titleSim * 100).toFixed(0)}%`);
    }
  }

  return {
    competitorProductId: row.competitor_product_id,
    storeId: row.store_id,
    storeName: row.store_name,
    storeDomain: row.store_domain,
    title: row.title,
    url: row.url,
    imageUrl: normalizeImageUrl(row.image_url, row.url),
    brand: row.brand,
    sku: row.sku,
    gtin: row.gtin,
    price: numberOrNull(row.price),
    oldPrice: numberOrNull(row.old_price),
    currency: row.currency,
    availability: row.availability,
    lastScrapedAt: row.last_scraped_at,
    similarity: Number(similarity.toFixed(3)),
    matchMethod: method,
    reasons,
  };
}

function computePriceStats(timeline: ProductDetailPoint[]): ProductPriceStats {
  const prices = timeline
    .map((point) => point.price)
    .filter((value): value is number => value != null);
  if (prices.length === 0) {
    return {
      median: null,
      best30d: null,
      worst30d: null,
      best90d: null,
      worst90d: null,
      cheapestStreakDays: null,
    };
  }
  const sorted = [...prices].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? null;
  const now = Date.now();
  const in30 = timeline.filter(
    (point) => point.price != null && now - new Date(point.date).getTime() <= 30 * 86_400_000,
  );
  const in90 = timeline.filter(
    (point) => point.price != null && now - new Date(point.date).getTime() <= 90 * 86_400_000,
  );
  const best30d = in30.length > 0 ? Math.min(...in30.map((p) => p.price as number)) : null;
  const worst30d = in30.length > 0 ? Math.max(...in30.map((p) => p.price as number)) : null;
  const best90d = in90.length > 0 ? Math.min(...in90.map((p) => p.price as number)) : null;
  const worst90d = in90.length > 0 ? Math.max(...in90.map((p) => p.price as number)) : null;
  return {
    median: median != null ? Number(median.toFixed(2)) : null,
    best30d: best30d != null ? Number(best30d.toFixed(2)) : null,
    worst30d: worst30d != null ? Number(worst30d.toFixed(2)) : null,
    best90d: best90d != null ? Number(best90d.toFixed(2)) : null,
    worst90d: worst90d != null ? Number(worst90d.toFixed(2)) : null,
    cheapestStreakDays: estimateCheapestStreak(timeline),
  };
}

function estimateCheapestStreak(timeline: ProductDetailPoint[]): number | null {
  const byDay = new Map<string, ProductDetailPoint[]>();
  for (const point of timeline) {
    if (point.price == null) continue;
    const day = point.date.slice(0, 10);
    const bucket = byDay.get(day) ?? [];
    bucket.push(point);
    byDay.set(day, bucket);
  }
  if (byDay.size === 0) return null;
  const days = Array.from(byDay.entries()).sort(([a], [b]) => b.localeCompare(a));
  let leader: string | null = null;
  let streak = 0;
  let currentStreak = 0;
  for (const [, points] of days) {
    const cheapest = points.sort((a, b) => Number(a.price) - Number(b.price))[0];
    if (!cheapest) continue;
    if (leader == null) {
      leader = cheapest.competitorName;
      currentStreak = 1;
      streak = 1;
      continue;
    }
    if (cheapest.competitorName === leader) {
      currentStreak += 1;
      streak = Math.max(streak, currentStreak);
    } else {
      break;
    }
  }
  return streak > 0 ? streak : null;
}

export async function getCompareProducts(orgId: string, ids: string[]): Promise<ProductDetail[]> {
  const unique = Array.from(new Set(ids)).slice(0, 8);
  const details = await Promise.all(unique.map((id) => getProductDetail(orgId, id)));
  return details.filter((item): item is ProductDetail => item != null);
}

export async function getProductInsights(orgId: string): Promise<ProductInsight[]> {
  const filters: ProductIntelligenceFilters = {
    groupBy: 'none',
    sort: 'volatility_desc',
    page: 1,
    pageSize: 100,
    specs: {},
  };
  const data = await getProductIntelligenceList(orgId, filters);
  const rows = data.rows;
  const insights: ProductInsight[] = [];

  for (const row of rows.filter((item) => item.marketTrend === 'falling').slice(0, 6)) {
    insights.push({
      id: `drop-${row.id}`,
      type: 'biggest_price_drops',
      title: row.canonicalTitle,
      description: 'Market price is trending down across recent snapshots.',
      severity: 'success',
      metric: `${row.volatility.toFixed(1)}% volatility`,
      href: `/products/${row.id}`,
    });
  }
  for (const row of rows.filter((item) => item.marketTrend === 'rising').slice(0, 6)) {
    insights.push({
      id: `rise-${row.id}`,
      type: 'biggest_price_increases',
      title: row.canonicalTitle,
      description: 'Market price is trending up and may need attention.',
      severity: 'warning',
      metric: `${row.volatility.toFixed(1)}% volatility`,
      href: `/products/${row.id}`,
    });
  }
  for (const row of rows.filter((item) => item.volatility >= 10).slice(0, 8)) {
    insights.push({
      id: `volatile-${row.id}`,
      type: 'unstable_products',
      title: row.canonicalTitle,
      description: 'High min/max spread in historical snapshots.',
      severity: row.volatility >= 25 ? 'critical' : 'warning',
      metric: `${row.volatility.toFixed(1)}%`,
      href: `/products/${row.id}`,
    });
  }
  for (const row of rows.filter((item) => item.activeDiscounts > 0).slice(0, 8)) {
    insights.push({
      id: `discount-${row.id}`,
      type: 'most_discounted',
      title: row.canonicalTitle,
      description: `${row.activeDiscounts} competitor listing(s) have active old-price discounts.`,
      severity: 'info',
      metric: `${row.activeDiscounts} discounts`,
      href: `/products/${row.id}`,
    });
  }
  for (const row of rows
    .filter((item) => item.stockStatus === 'out_of_stock' || item.stockStatus === 'mixed')
    .slice(0, 8)) {
    insights.push({
      id: `stock-${row.id}`,
      type: 'stock_recovery_or_disappearing',
      title: row.canonicalTitle,
      description: 'Stock distribution changed or is inconsistent across competitors.',
      severity: row.stockStatus === 'out_of_stock' ? 'critical' : 'warning',
      metric: row.stockStatus.replace(/_/g, ' '),
      href: `/products/${row.id}`,
    });
  }

  return insights.slice(0, 32);
}

export async function getCategoryAnalytics(
  orgId: string,
  categoryIdOrName: string,
): Promise<ProductAnalyticsPageData> {
  const filters: ProductIntelligenceFilters = {
    category: categoryIdOrName,
    groupBy: 'brand',
    sort: 'updated_desc',
    page: 1,
    pageSize: 100,
    specs: {},
  };
  const data = await getProductIntelligenceList(orgId, filters);
  const categoryLabel = data.rows[0]?.category ?? categoryIdOrName;
  return {
    title: `Category: ${categoryLabel}`,
    subtitle: 'Category pricing, stock, volatility, competitors, and brands.',
    rows: data.rows,
    summary: data.groups,
  };
}

export async function getBrandAnalytics(
  orgId: string,
  brand: string,
): Promise<ProductAnalyticsPageData> {
  const filters: ProductIntelligenceFilters = {
    brand,
    groupBy: 'category',
    sort: 'updated_desc',
    page: 1,
    pageSize: 100,
    specs: {},
  };
  const data = await getProductIntelligenceList(orgId, filters);
  return {
    title: `Brand: ${brand}`,
    subtitle: 'Brand coverage, pricing, stock, volatility, and category spread.',
    rows: data.rows,
    summary: data.groups,
  };
}

function entitiesQuery(
  orgId: string,
  filters: ProductIntelligenceFilters,
  finalSelect: ReturnType<typeof sql>,
) {
  const query = filters.search ? `%${filters.search.toLowerCase()}%` : null;
  const brand = filters.brand ? filters.brand.toLowerCase() : null;
  const category = filters.category ?? null;
  const competitor = filters.competitor ?? null;
  const specText = Object.values(filters.specs).filter(Boolean).join(' ').toLowerCase();
  const specQuery = specText ? `%${specText}%` : null;
  return sql`
    with confirmed_matches as (
      select *
      from product_matches
      where org_id = ${orgId}
        and status = 'confirmed'
    ),
    latest_snapshot as (
      select distinct on (ps.competitor_product_id)
        ps.competitor_product_id,
        ps.price::numeric as price,
        ps.old_price::numeric as old_price,
        ps.currency,
        ps.availability,
        ps.shipping_text,
        ps.image_url,
        ps.rating::numeric as rating,
        ps.confidence::numeric as confidence,
        ps.source::text as source,
        ps.status::text as status,
        ps.scraped_at
      from price_snapshots ps
      where ps.org_id = ${orgId}
      order by ps.competitor_product_id, ps.scraped_at desc
    ),
    matched_history as (
      select
        cm.my_product_id as entity_id,
        min(ps.price::numeric) as hist_min,
        avg(ps.price::numeric) as hist_avg,
        max(ps.price::numeric) as hist_max,
        (array_agg(ps.price::numeric order by ps.scraped_at) filter (where ps.price is not null))[1] as first_price,
        (array_agg(ps.price::numeric order by ps.scraped_at desc) filter (where ps.price is not null))[1] as last_price
      from confirmed_matches cm
      join price_snapshots ps on ps.competitor_product_id = cm.competitor_product_id
      where ps.org_id = ${orgId}
        and ps.price is not null
        and ps.scraped_at >= now() - interval '120 days'
      group by cm.my_product_id
    ),
    raw_history as (
      select
        cp.id as entity_id,
        min(ps.price::numeric) as hist_min,
        avg(ps.price::numeric) as hist_avg,
        max(ps.price::numeric) as hist_max,
        (array_agg(ps.price::numeric order by ps.scraped_at) filter (where ps.price is not null))[1] as first_price,
        (array_agg(ps.price::numeric order by ps.scraped_at desc) filter (where ps.price is not null))[1] as last_price
      from competitor_products cp
      join price_snapshots ps on ps.competitor_product_id = cp.id
      where cp.org_id = ${orgId}
        and ps.price is not null
        and ps.scraped_at >= now() - interval '120 days'
      group by cp.id
    ),
    matched_spark as (
      select entity_id, jsonb_agg(jsonb_build_object('date', scraped_at::text, 'price', price) order by scraped_at) as sparkline
      from (
        select
          cm.my_product_id as entity_id,
          date_trunc('day', ps.scraped_at) as scraped_at,
          avg(ps.price::numeric) as price,
          row_number() over (partition by cm.my_product_id order by date_trunc('day', ps.scraped_at) desc) as rn
        from confirmed_matches cm
        join price_snapshots ps on ps.competitor_product_id = cm.competitor_product_id
        where ps.org_id = ${orgId}
          and ps.price is not null
          and ps.scraped_at >= now() - interval '45 days'
        group by cm.my_product_id, date_trunc('day', ps.scraped_at)
      ) points
      where rn <= 16
      group by entity_id
    ),
    raw_spark as (
      select entity_id, jsonb_agg(jsonb_build_object('date', scraped_at::text, 'price', price) order by scraped_at) as sparkline
      from (
        select
          cp.id as entity_id,
          date_trunc('day', ps.scraped_at) as scraped_at,
          avg(ps.price::numeric) as price,
          row_number() over (partition by cp.id order by date_trunc('day', ps.scraped_at) desc) as rn
        from competitor_products cp
        join price_snapshots ps on ps.competitor_product_id = cp.id
        where cp.org_id = ${orgId}
          and ps.price is not null
          and ps.scraped_at >= now() - interval '45 days'
        group by cp.id, date_trunc('day', ps.scraped_at)
      ) points
      where rn <= 16
      group by entity_id
    ),
    normalized_entities as (
      select
        mp.id::text as id,
        'normalized'::text as entity_type,
        mp.name as canonical_title,
        mp.brand,
        c.name as category,
        coalesce(
          nullif(mp.image_url, ''),
          (array_agg(coalesce(nullif(cp.image_url, ''), nullif(ls.image_url, ''))) filter (where coalesce(nullif(cp.image_url, ''), nullif(ls.image_url, '')) is not null))[1]
        ) as image_url,
        count(distinct cp.id)::int as competitors_count,
        min(coalesce(ls.price, cp.last_snapshot_price::numeric)) as current_min_price,
        avg(coalesce(ls.price, cp.last_snapshot_price::numeric))::numeric(12,2) as current_avg_price,
        max(coalesce(ls.price, cp.last_snapshot_price::numeric)) as current_max_price,
        coalesce(
          (array_agg(ls.currency) filter (where ls.currency is not null))[1],
          (array_agg(cp.last_snapshot_currency) filter (where cp.last_snapshot_currency is not null))[1],
          mp.currency,
          'EUR'
        ) as currency,
        mh.hist_min,
        mh.hist_avg,
        mh.hist_max,
        mh.first_price,
        mh.last_price,
        count(distinct cp.id) filter (where coalesce(ls.availability::text, cp.last_snapshot_availability) = 'in_stock')::int as in_stock_count,
        count(distinct cp.id) filter (where coalesce(ls.availability::text, cp.last_snapshot_availability) = 'out_of_stock')::int as out_stock_count,
        count(distinct cp.id) filter (where coalesce(ls.availability::text, cp.last_snapshot_availability) is null or coalesce(ls.availability::text, cp.last_snapshot_availability) = 'unknown')::int as unknown_stock_count,
        count(distinct cp.id) filter (where ls.old_price is not null and coalesce(ls.price, cp.last_snapshot_price::numeric) is not null and ls.old_price > coalesce(ls.price, cp.last_snapshot_price::numeric))::int as active_discounts,
        greatest(max(cp.last_change_at), max(cp.last_scraped_at), mp.updated_at)::text as last_change,
        mp.created_at::text as discovered_at,
        greatest(max(cp.last_scraped_at), mp.updated_at)::text as updated_at,
        true as matched,
        count(distinct cp.id) > 1 as duplicate_risk,
        coalesce(greatest(max(cp.last_scraped_at), mp.updated_at), mp.created_at) < now() - interval '24 hours' as stale,
        min(coalesce(ls.price, cp.last_snapshot_price::numeric)) is null as missing_price,
        bool_or(mp.gtin is not null or cp.gtin is not null) as has_gtin,
        bool_or(mp.sku is not null or cp.sku is not null) as has_sku,
        coalesce(ms.sparkline, '[]'::jsonb) as sparkline,
        coalesce(
          jsonb_agg(distinct jsonb_build_object(
            'competitorProductId', cp.id::text,
            'storeId', cp.store_id::text,
            'storeName', (select s2.name from stores s2 where s2.id = cp.store_id),
            'title', coalesce(cp.title, cp.url),
            'url', cp.url,
            'imageUrl', coalesce(nullif(cp.image_url, ''), nullif(ls.image_url, '')),
            'price', coalesce(ls.price, cp.last_snapshot_price::numeric),
            'oldPrice', ls.old_price,
            'currency', coalesce(ls.currency, cp.last_snapshot_currency, mp.currency, 'EUR'),
            'availability', coalesce(ls.availability::text, cp.last_snapshot_availability),
            'lastScrapedAt', coalesce(ls.scraped_at, cp.last_scraped_at)::text
          )) filter (where cp.id is not null),
          '[]'::jsonb
        ) as members,
        lower(concat_ws(' ', mp.name, mp.brand, mp.sku, mp.gtin, string_agg(distinct cp.title, ' '), string_agg(distinct cp.sku, ' '), string_agg(distinct cp.gtin, ' '))) as search_text,
        lower(concat_ws(' ', mp.name, mp.brand, string_agg(distinct cp.title, ' '))) as spec_text,
        array_agg(distinct cp.store_id::text) filter (where cp.store_id is not null) as competitor_ids,
        mp.category_id::text as category_id,
        coalesce(nullif(lower(mp.gtin), ''), 'mp:' || mp.id::text) as cluster_key
      from my_products mp
      left join categories c on c.id = mp.category_id
      left join confirmed_matches cm on cm.my_product_id = mp.id
      left join competitor_products cp on cp.id = cm.competitor_product_id
      left join latest_snapshot ls on ls.competitor_product_id = cp.id
      left join matched_history mh on mh.entity_id = mp.id
      left join matched_spark ms on ms.entity_id = mp.id
      where mp.org_id = ${orgId}
      group by mp.id, c.name, mh.hist_min, mh.hist_avg, mh.hist_max, mh.first_price, mh.last_price, ms.sparkline
    ),
    raw_entities as (
      select
        cp.id::text as id,
        'raw_competitor'::text as entity_type,
        coalesce(cp.title, cp.url) as canonical_title,
        cp.brand,
        null::text as category,
        coalesce(nullif(cp.image_url, ''), nullif(ls.image_url, '')) as image_url,
        1::int as competitors_count,
        coalesce(ls.price, cp.last_snapshot_price::numeric) as current_min_price,
        coalesce(ls.price, cp.last_snapshot_price::numeric) as current_avg_price,
        coalesce(ls.price, cp.last_snapshot_price::numeric) as current_max_price,
        coalesce(ls.currency, cp.last_snapshot_currency, 'EUR') as currency,
        rh.hist_min,
        rh.hist_avg,
        rh.hist_max,
        rh.first_price,
        rh.last_price,
        case when coalesce(ls.availability::text, cp.last_snapshot_availability) = 'in_stock' then 1 else 0 end as in_stock_count,
        case when coalesce(ls.availability::text, cp.last_snapshot_availability) = 'out_of_stock' then 1 else 0 end as out_stock_count,
        case when coalesce(ls.availability::text, cp.last_snapshot_availability) is null or coalesce(ls.availability::text, cp.last_snapshot_availability) = 'unknown' then 1 else 0 end as unknown_stock_count,
        case when ls.old_price is not null and coalesce(ls.price, cp.last_snapshot_price::numeric) is not null and ls.old_price > coalesce(ls.price, cp.last_snapshot_price::numeric) then 1 else 0 end as active_discounts,
        greatest(cp.last_change_at, cp.last_scraped_at, cp.created_at)::text as last_change,
        cp.created_at::text as discovered_at,
        coalesce(cp.last_scraped_at, cp.created_at)::text as updated_at,
        false as matched,
        false as duplicate_risk,
        coalesce(cp.last_scraped_at, cp.created_at) < now() - interval '24 hours' as stale,
        coalesce(ls.price, cp.last_snapshot_price::numeric) is null as missing_price,
        cp.gtin is not null as has_gtin,
        cp.sku is not null as has_sku,
        coalesce(rs.sparkline, '[]'::jsonb) as sparkline,
        jsonb_build_array(jsonb_build_object(
          'competitorProductId', cp.id::text,
          'storeId', cp.store_id::text,
          'storeName', st.name,
          'title', coalesce(cp.title, cp.url),
          'url', cp.url,
          'imageUrl', coalesce(nullif(cp.image_url, ''), nullif(ls.image_url, '')),
          'price', coalesce(ls.price, cp.last_snapshot_price::numeric),
          'oldPrice', ls.old_price,
          'currency', coalesce(ls.currency, cp.last_snapshot_currency, 'EUR'),
          'availability', coalesce(ls.availability::text, cp.last_snapshot_availability),
          'lastScrapedAt', coalesce(ls.scraped_at, cp.last_scraped_at)::text
        )) as members,
        lower(concat_ws(' ', cp.title, cp.brand, cp.sku, cp.gtin, cp.url, st.name)) as search_text,
        lower(concat_ws(' ', cp.title, cp.brand)) as spec_text,
        array[cp.store_id::text] as competitor_ids,
        null::text as category_id,
        coalesce(
          nullif(lower(cp.gtin), ''),
          nullif(regexp_replace(lower(coalesce(cp.brand, '') || ' ' || coalesce(cp.title, '')), '[^a-z0-9]+', ' ', 'g'), ''),
          'cp:' || cp.id::text
        ) as cluster_key
      from competitor_products cp
      join stores st on st.id = cp.store_id
      left join latest_snapshot ls on ls.competitor_product_id = cp.id
      left join raw_history rh on rh.entity_id = cp.id
      left join raw_spark rs on rs.entity_id = cp.id
      where cp.org_id = ${orgId}
        and not exists (
          select 1
          from confirmed_matches cm
          where cm.competitor_product_id = cp.id
        )
    ),
    all_entities as (
      select * from normalized_entities
      union all
      select * from raw_entities
    ),
    filtered_entities as (
      select *
      from all_entities
      where (${query}::text is null or search_text like ${query})
        and (${brand}::text is null or lower(coalesce(brand, 'Unknown')) = ${brand})
        and (${category}::text is null or category_id = ${category} or lower(coalesce(category, '')) = lower(${category}))
        and (${competitor}::text is null or ${competitor} = any(competitor_ids))
        and (${filters.minPrice ?? null}::numeric is null or current_avg_price >= ${filters.minPrice ?? null}::numeric)
        and (${filters.maxPrice ?? null}::numeric is null or current_avg_price <= ${filters.maxPrice ?? null}::numeric)
        and (${filters.availability ?? null}::text is null or (
          (${filters.availability ?? null} = 'in_stock' and in_stock_count > 0)
          or (${filters.availability ?? null} = 'out_of_stock' and out_stock_count > 0)
          or (${filters.availability ?? null} = 'unknown' and unknown_stock_count > 0)
        ))
        and (${filters.discount ?? null}::text is null or (
          (${filters.discount ?? null} = 'discounted' and active_discounts > 0)
          or (${filters.discount ?? null} = 'not_discounted' and active_discounts = 0)
        ))
        and (${filters.stock ?? null}::text is null or (
          (${filters.stock ?? null} = 'mixed' and in_stock_count > 0 and out_stock_count > 0)
          or (${filters.stock ?? null} = 'in_stock' and in_stock_count > 0 and out_stock_count = 0)
          or (${filters.stock ?? null} = 'out_of_stock' and out_stock_count > 0 and in_stock_count = 0)
          or (${filters.stock ?? null} = 'unknown' and unknown_stock_count > 0 and in_stock_count = 0 and out_stock_count = 0)
        ))
        and (${filters.advanced ?? null}::text is null or (
          (${filters.advanced ?? null} = 'newly_discovered' and discovered_at::timestamptz >= now() - interval '7 days')
          or (${filters.advanced ?? null} = 'stale_data' and stale)
          or (${filters.advanced ?? null} = 'missing_prices' and missing_price)
          or (${filters.advanced ?? null} = 'high_discounts' and active_discounts > 0)
          or (${filters.advanced ?? null} = 'price_drops' and last_price is not null and first_price is not null and last_price < first_price * 0.97)
          or (${filters.advanced ?? null} = 'stock_changes' and in_stock_count > 0 and out_stock_count > 0)
          or (${filters.advanced ?? null} = 'only_matched' and matched)
          or (${filters.advanced ?? null} = 'only_unmatched' and not matched)
          or (${filters.advanced ?? null} = 'only_duplicates' and duplicate_risk)
        ))
        and (${specQuery}::text is null or spec_text like ${specQuery})
    )
    ${finalSelect}
  `;
}

async function getProductCompetitors(
  orgId: string,
  id: string,
  entityType: 'normalized' | 'raw_competitor',
): Promise<ProductCompetitorComparison[]> {
  const rows = await db().execute<ProductCompetitorComparisonRow>(sql`
    with entity_competitors as (
      ${
        entityType === 'normalized'
          ? sql`
          select cp.*
          from product_matches pm
          join competitor_products cp on cp.id = pm.competitor_product_id
          where pm.org_id = ${orgId}
            and pm.status = 'confirmed'
            and pm.my_product_id = ${id}
        `
          : sql`
          select cp.*
          from competitor_products cp
          where cp.org_id = ${orgId}
            and cp.id = ${id}
        `
      }
    ),
    latest_snapshot as (
      select distinct on (ps.competitor_product_id)
        ps.competitor_product_id,
        ps.price::numeric as price,
        ps.old_price::numeric as old_price,
        ps.currency,
        ps.availability,
        ps.shipping_text,
        ps.image_url,
        ps.rating::numeric as rating,
        ps.confidence::numeric as confidence,
        ps.source::text as source,
        ps.scraped_at
      from price_snapshots ps
      join entity_competitors cp on cp.id = ps.competitor_product_id
      where ps.org_id = ${orgId}
      order by ps.competitor_product_id, ps.scraped_at desc
    )
    select
      cp.id::text as competitor_product_id,
      st.id::text as competitor_id,
      st.name as competitor_name,
      st.domain as competitor_domain,
      coalesce(cp.title, cp.url) as title,
      cp.url,
      coalesce(nullif(cp.image_url, ''), nullif(ls.image_url, '')) as image_url,
      cp.sku,
      cp.gtin,
      coalesce(ls.price, cp.last_snapshot_price::numeric) as current_price,
      ls.old_price,
      coalesce(ls.currency, cp.last_snapshot_currency, 'EUR') as currency,
      coalesce(ls.availability::text, cp.last_snapshot_availability) as availability,
      ls.shipping_text as shipping,
      ls.rating,
      coalesce(ls.scraped_at, cp.last_scraped_at)::text as last_update,
      ls.confidence,
      ls.source
    from entity_competitors cp
    join stores st on st.id = cp.store_id
    left join latest_snapshot ls on ls.competitor_product_id = cp.id
    order by coalesce(ls.price, cp.last_snapshot_price::numeric) asc nulls last
  `);

  const prices = rows
    .map((row) => numberOrNull(row.current_price))
    .filter((value): value is number => value != null);
  const minPrice = prices.length > 0 ? Math.min(...prices) : null;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : null;

  return rows.map((row) => {
    const price = numberOrNull(row.current_price);
    const pricePositionPct =
      price != null && minPrice != null && maxPrice != null && maxPrice > minPrice
        ? Number((((price - minPrice) / (maxPrice - minPrice)) * 100).toFixed(1))
        : null;
    return {
      competitorProductId: row.competitor_product_id,
      competitorId: row.competitor_id,
      competitorName: row.competitor_name,
      competitorDomain: row.competitor_domain,
      title: row.title,
      url: row.url,
      currentPrice: price,
      oldPrice: numberOrNull(row.old_price),
      currency: row.currency ?? 'EUR',
      discountPct: discountPct(price, numberOrNull(row.old_price)),
      availability: row.availability,
      shipping: row.shipping,
      rating: numberOrNull(row.rating),
      lastUpdate: row.last_update,
      confidence: numberOrNull(row.confidence),
      source: row.source,
      sku: row.sku,
      gtin: row.gtin,
      imageUrl: normalizeImageUrl(row.image_url, row.url),
      pricePositionPct,
    };
  });
}

interface ProductCompetitorComparisonRow extends Record<string, unknown> {
  competitor_product_id: string;
  competitor_id: string;
  competitor_name: string;
  competitor_domain: string | null;
  title: string;
  url: string;
  image_url: string | null;
  sku: string | null;
  gtin: string | null;
  current_price: string | null;
  old_price: string | null;
  currency: string | null;
  availability: string | null;
  shipping: string | null;
  rating: string | null;
  last_update: string | null;
  confidence: string | null;
  source: string | null;
}

async function getProductTimeline(
  orgId: string,
  id: string,
  entityType: 'normalized' | 'raw_competitor',
): Promise<ProductDetailPoint[]> {
  const rows = await db().execute<ProductTimelineRow>(sql`
    with entity_competitors as (
      ${
        entityType === 'normalized'
          ? sql`
          select cp.*
          from product_matches pm
          join competitor_products cp on cp.id = pm.competitor_product_id
          where pm.org_id = ${orgId}
            and pm.status = 'confirmed'
            and pm.my_product_id = ${id}
        `
          : sql`
          select cp.*
          from competitor_products cp
          where cp.org_id = ${orgId}
            and cp.id = ${id}
        `
      }
    )
    select
      ps.scraped_at::text as date,
      cp.id::text as competitor_product_id,
      st.name as competitor_name,
      ps.price::numeric as price,
      ps.old_price::numeric as old_price,
      ps.availability::text as availability,
      ps.confidence::numeric as confidence
    from price_snapshots ps
    join entity_competitors cp on cp.id = ps.competitor_product_id
    join stores st on st.id = cp.store_id
    where ps.org_id = ${orgId}
      and ps.scraped_at >= now() - interval '180 days'
    order by ps.scraped_at asc
    limit 5000
  `);

  return rows.map((row) => {
    const price = numberOrNull(row.price);
    const oldPrice = numberOrNull(row.old_price);
    return {
      date: row.date,
      competitorProductId: row.competitor_product_id,
      competitorName: row.competitor_name,
      price,
      oldPrice,
      availability: row.availability,
      discountPct: discountPct(price, oldPrice),
      confidence: numberOrNull(row.confidence),
    };
  });
}

interface ProductTimelineRow extends Record<string, unknown> {
  date: string;
  competitor_product_id: string;
  competitor_name: string;
  price: string | null;
  old_price: string | null;
  availability: string | null;
  confidence: string | null;
}

function mapEntityRow(row: EntityRow): ProductIntelligenceRow {
  const min = numberOrNull(row.current_min_price);
  const avg = numberOrNull(row.current_avg_price);
  const max = numberOrNull(row.current_max_price);
  const histMin = numberOrNull(row.hist_min);
  const histAvg = numberOrNull(row.hist_avg);
  const histMax = numberOrNull(row.hist_max);
  const firstPrice = numberOrNull(row.first_price);
  const lastPrice = numberOrNull(row.last_price);
  const volatility = volatilityScore(histMin ?? min, histMax ?? max, histAvg ?? avg);
  const trend = inferTrend(firstPrice, lastPrice, volatility);
  return {
    id: row.id,
    entityType: row.entity_type,
    canonicalTitle: row.canonical_title ?? 'Untitled product',
    brand: row.brand,
    category: row.category,
    imageUrl: normalizeImageUrl(row.image_url, null),
    competitorsCount: Number(row.competitors_count ?? 0),
    currentMinPrice: min,
    currentAvgPrice: avg,
    currentMaxPrice: max,
    currency: row.currency ?? 'EUR',
    volatility,
    stockStatus: stockStatus(
      Number(row.in_stock_count ?? 0),
      Number(row.out_stock_count ?? 0),
      Number(row.unknown_stock_count ?? 0),
    ),
    activeDiscounts: Number(row.active_discounts ?? 0),
    lastChange: row.last_change,
    marketTrend: trend,
    confidence: confidenceFromSignals({
      matched: row.matched,
      competitorsCount: Number(row.competitors_count ?? 0),
      hasGtin: row.has_gtin,
      hasSku: row.has_sku,
      hasBrand: Boolean(row.brand),
      hasPrice: min != null || avg != null || max != null,
    }),
    discoveredAt: row.discovered_at,
    updatedAt: row.updated_at,
    matched: row.matched,
    duplicateRisk: row.duplicate_risk,
    stale: row.stale,
    missingPrice: row.missing_price,
    sparkline: parseSparkline(row.sparkline),
    members: parseMembers(row.members),
    clusterKey: row.cluster_key ?? `entity:${row.id}`,
  };
}

function parseMembers(value: unknown): ProductStoreMember[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const m = item as Record<string, unknown>;
      const storeId = typeof m.storeId === 'string' ? m.storeId : null;
      const competitorProductId =
        typeof m.competitorProductId === 'string' ? m.competitorProductId : null;
      if (!storeId || !competitorProductId) return null;
      return {
        competitorProductId,
        storeId,
        storeName: typeof m.storeName === 'string' ? m.storeName : 'Unknown store',
        title: typeof m.title === 'string' ? m.title : 'Untitled',
        url: typeof m.url === 'string' ? m.url : '',
        imageUrl: normalizeImageUrl(
          typeof m.imageUrl === 'string' ? m.imageUrl : null,
          typeof m.url === 'string' ? m.url : null,
        ),
        price: numberOrNull(m.price),
        oldPrice: numberOrNull(m.oldPrice),
        currency: typeof m.currency === 'string' ? m.currency : 'EUR',
        availability: typeof m.availability === 'string' ? m.availability : null,
        lastScrapedAt: typeof m.lastScrapedAt === 'string' ? m.lastScrapedAt : null,
      } satisfies ProductStoreMember;
    })
    .filter((item): item is ProductStoreMember => item !== null);
}

function normalizeImageUrl(value: string | null, baseUrl: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  try {
    return new URL(trimmed).href;
  } catch {
    if (!baseUrl) return null;
    try {
      return new URL(trimmed, baseUrl).href;
    } catch {
      return null;
    }
  }
}

function buildClusters(rows: ProductIntelligenceRow[]): ProductCluster[] {
  const map = new Map<string, ProductIntelligenceRow[]>();
  for (const row of rows) {
    const key = row.clusterKey || `entity:${row.id}`;
    const bucket = map.get(key) ?? [];
    bucket.push(row);
    map.set(key, bucket);
  }
  const clusters: ProductCluster[] = [];
  for (const [key, group] of map.entries()) {
    if (group.length === 0) continue;
    const representative = pickRepresentative(
      group as [ProductIntelligenceRow, ...ProductIntelligenceRow[]],
    );
    const allMembers = group.flatMap((row) => row.members);
    const deduped = dedupeMembers(allMembers);
    const prices = deduped.map((m) => m.price).filter((p): p is number => p != null);
    const minPrice = prices.length > 0 ? Math.min(...prices) : null;
    const maxPrice = prices.length > 0 ? Math.max(...prices) : null;
    const avgPrice =
      prices.length > 0
        ? Number((prices.reduce((s, p) => s + p, 0) / prices.length).toFixed(2))
        : null;
    const cheapestMember = deduped
      .filter((m) => m.price != null)
      .sort((a, b) => (a.price ?? 0) - (b.price ?? 0))[0];
    const highestMember = deduped
      .filter((m) => m.price != null)
      .sort((a, b) => (b.price ?? 0) - (a.price ?? 0))[0];
    const savingsPct =
      minPrice != null && maxPrice != null && maxPrice > 0 && maxPrice !== minPrice
        ? Number((((maxPrice - minPrice) / maxPrice) * 100).toFixed(1))
        : null;
    const inStockStores = deduped.filter((m) => m.availability === 'in_stock').length;
    const outOfStockStores = deduped.filter((m) => m.availability === 'out_of_stock').length;
    const uniqueStores = new Set(deduped.map((m) => m.storeId)).size;
    const lastChange =
      group
        .map((row) => row.lastChange)
        .filter((value): value is string => Boolean(value))
        .sort()
        .reverse()[0] ?? null;
    clusters.push({
      key,
      representative,
      rows: group,
      members: deduped,
      storeCount: uniqueStores,
      minPrice,
      avgPrice,
      maxPrice,
      cheapestStoreName: cheapestMember?.storeName ?? null,
      highestStoreName: highestMember?.storeName ?? null,
      savingsPct,
      currency: deduped[0]?.currency ?? representative.currency,
      inStockStores,
      outOfStockStores,
      lastChange,
    });
  }
  return clusters.sort((a, b) => {
    if (b.storeCount !== a.storeCount) return b.storeCount - a.storeCount;
    return a.representative.canonicalTitle.localeCompare(b.representative.canonicalTitle);
  });
}

function pickRepresentative(
  rows: [ProductIntelligenceRow, ...ProductIntelligenceRow[]],
): ProductIntelligenceRow {
  const normalized = rows.find((row) => row.entityType === 'normalized');
  if (normalized) return normalized;
  const sorted = rows
    .slice()
    .sort((a, b) => b.competitorsCount - a.competitorsCount || b.confidence - a.confidence);
  return sorted[0] ?? rows[0];
}

function dedupeMembers(members: ProductStoreMember[]): ProductStoreMember[] {
  const map = new Map<string, ProductStoreMember>();
  for (const member of members) {
    const existing = map.get(member.competitorProductId);
    if (!existing) {
      map.set(member.competitorProductId, member);
      continue;
    }
    const existingFreshness = existing.lastScrapedAt ?? '';
    const incomingFreshness = member.lastScrapedAt ?? '';
    if (incomingFreshness > existingFreshness) {
      map.set(member.competitorProductId, member);
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.price == null && b.price == null) return a.storeName.localeCompare(b.storeName);
    if (a.price == null) return 1;
    if (b.price == null) return -1;
    return a.price - b.price;
  });
}

function buildGroups(rows: ProductIntelligenceRow[], groupBy: string): ProductGroupSummary[] {
  if (groupBy === 'none') return [];
  const map = new Map<string, ProductIntelligenceRow[]>();
  for (const row of rows) {
    const key = groupKey(row, groupBy);
    const group = map.get(key) ?? [];
    group.push(row);
    map.set(key, group);
  }
  return Array.from(map.entries())
    .map(([key, group]) => {
      const prices = group
        .map((row) => row.currentAvgPrice)
        .filter((price): price is number => price != null);
      return {
        key,
        label: key,
        count: group.length,
        avgPrice:
          prices.length > 0
            ? Number((prices.reduce((sum, price) => sum + price, 0) / prices.length).toFixed(2))
            : null,
        volatility: Number(
          (group.reduce((sum, row) => sum + row.volatility, 0) / Math.max(1, group.length)).toFixed(
            1,
          ),
        ),
      };
    })
    .sort((a, b) => b.count - a.count);
}

function groupKey(row: ProductIntelligenceRow, groupBy: string): string {
  if (groupBy === 'brand') return row.brand ?? 'Unknown brand';
  if (groupBy === 'category') return row.category ?? 'Uncategorized';
  if (groupBy === 'stock') return row.stockStatus.replace(/_/g, ' ');
  if (groupBy === 'volatility')
    return row.volatility >= 20
      ? 'high volatility'
      : row.volatility >= 8
        ? 'medium volatility'
        : 'low volatility';
  if (groupBy === 'discount') return row.activeDiscounts > 0 ? 'discounted' : 'not discounted';
  if (groupBy === 'price_range') return priceRangeLabel(row.currentAvgPrice);
  if (groupBy === 'competitor')
    return row.competitorsCount > 1 ? 'multi competitor' : 'single competitor';
  return 'all';
}

function buildSpreadTimeline(points: ProductDetailPoint[]): ProductSpreadPoint[] {
  const byDay = new Map<string, number[]>();
  for (const point of points) {
    if (point.price == null) continue;
    const key = point.date.slice(0, 10);
    const values = byDay.get(key) ?? [];
    values.push(point.price);
    byDay.set(key, values);
  }
  return Array.from(byDay.entries()).map(([date, values]) => ({
    date,
    min: Math.min(...values),
    avg: Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)),
    max: Math.max(...values),
  }));
}

function buildProductEvents(
  points: ProductDetailPoint[],
  competitors: ProductCompetitorComparison[],
): ProductEvent[] {
  const events: ProductEvent[] = [];
  const previousByCompetitor = new Map<string, ProductDetailPoint>();
  for (const point of points) {
    const previous = previousByCompetitor.get(point.competitorProductId);
    if (previous?.price != null && point.price != null && previous.price !== point.price) {
      events.push({
        id: `price-${point.competitorProductId}-${point.date}`,
        type: 'price_changed',
        label: `${point.competitorName}: ${previous.price.toFixed(2)} -> ${point.price.toFixed(2)}`,
        timestamp: point.date,
        status: point.price < previous.price ? 'success' : 'warning',
      });
    }
    if (
      previous?.availability &&
      point.availability &&
      previous.availability !== point.availability
    ) {
      events.push({
        id: `stock-${point.competitorProductId}-${point.date}`,
        type: 'stock_changed',
        label: `${point.competitorName}: ${previous.availability} -> ${point.availability}`,
        timestamp: point.date,
        status: point.availability === 'out_of_stock' ? 'critical' : 'success',
      });
    }
    if (point.confidence != null && point.confidence < 0.65) {
      events.push({
        id: `confidence-${point.competitorProductId}-${point.date}`,
        type: 'selector_issue',
        label: `${point.competitorName}: low extraction confidence`,
        timestamp: point.date,
        status: 'warning',
      });
    }
    previousByCompetitor.set(point.competitorProductId, point);
  }
  for (const competitor of competitors) {
    events.push({
      id: `snapshot-${competitor.competitorProductId}`,
      type: 'snapshot',
      label: `${competitor.competitorName}: latest snapshot`,
      timestamp: competitor.lastUpdate,
      status: competitor.currentPrice == null ? 'warning' : 'neutral',
    });
  }
  return events
    .sort((a, b) => new Date(b.timestamp ?? 0).getTime() - new Date(a.timestamp ?? 0).getTime())
    .slice(0, 80);
}

function parseSparkline(value: unknown): ProductSparkPoint[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as { date?: unknown; price?: unknown };
      return {
        date: typeof row.date === 'string' ? row.date : '',
        price: numberOrNull(row.price),
      };
    })
    .filter((item): item is ProductSparkPoint => Boolean(item?.date));
}

function numberOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
