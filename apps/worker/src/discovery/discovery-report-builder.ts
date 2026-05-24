import type { DiscoveryCategory, DiscoveryLog, DiscoveryPage, DiscoveryProduct, DiscoveryReport, DiscoveryStatus } from './types.js';

export function buildDiscoveryReport(input: {
  runId: string;
  status: DiscoveryStatus;
  startUrl: string;
  pages: DiscoveryPage[];
  categories: DiscoveryCategory[];
  products: DiscoveryProduct[];
  logs: DiscoveryLog[];
  startedAt: string;
  finishedAt?: string;
}): DiscoveryReport {
  const prices = input.products.map((p) => p.price).filter((price): price is number => price != null && Number.isFinite(price));
  const started = new Date(input.startedAt).getTime();
  const finished = input.finishedAt ? new Date(input.finishedAt).getTime() : Date.now();
  return {
    ...input,
    summary: {
      totalPagesDiscovered: input.pages.length,
      pagesCrawled: input.pages.filter((p) => p.status === 'crawled').length,
      categoriesFound: input.categories.length,
      productsFound: input.products.length,
      errors: input.logs.filter((log) => log.level === 'error').length + input.pages.filter((page) => page.status === 'error').length,
      durationMs: Math.max(0, finished - started),
      averagePrice: prices.length ? prices.reduce((sum, price) => sum + price, 0) / prices.length : undefined,
      minPrice: prices.length ? Math.min(...prices) : undefined,
      maxPrice: prices.length ? Math.max(...prices) : undefined,
    },
  };
}

