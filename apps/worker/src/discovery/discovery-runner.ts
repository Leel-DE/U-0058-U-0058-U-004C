import * as cheerio from 'cheerio';
import { randomUUID } from 'node:crypto';
import { fetchHtml } from '../fetcher/cheerio.js';
import { fetchHtmlBrowser } from '../fetcher/playwright.js';
import { detectSpaShell } from './spa-shell-detector.js';
import { classifyResponse, classifyResponseStrict } from '../detect/block.js';
import { throttleByDomain } from '../rate-limit.js';
import { cleanDom } from '../ai/cleaners/clean-dom.js';
import { reduceDomForPrompt } from '../ai/cleaners/reduce-dom.js';
import { debounceAi } from '../ai/cache/ai-cache.js';
import { getAIProvider } from '../ai/providers/index.js';
import {
  cancelManualSession,
  completeManualSession,
  continueManualSession,
  navigateInManualSession,
  sessionStatus,
  startManualSession,
} from '../manual/session-manager.js';
import { recordActivity } from '../manual/browser-session-manager.js';
import { classifyDiscoveryPage, pageTitleAndH1 } from './page-classifier.js';
import { detectCategory, extractBreadcrumbs } from './category-detector.js';
import { DiscoveryDeduper } from './discovery-deduper.js';
import { buildDiscoveryReport } from './discovery-report-builder.js';
import { detectPaginationUrls } from './pagination-detector.js';
import { enrichProductFromDetail } from './product-detail-enricher.js';
import { extractProductCards, extractProductCardsWithSelectors } from './product-card-extractor.js';
import { detectProductCards, type DetectedCard, type DetectionResult } from './product-card-detector.js';
import { isAllowedByRobots } from './robots-loader.js';
import { loadSitemapUrls } from './sitemap-parser.js';
import {
  isLikelyCategoryUrl,
  isLikelyProductUrl,
  normalizeUrl,
  urlDepth,
} from './url-normalizer.js';
import type {
  DiscoveryCategory,
  DiscoveryLog,
  DiscoveryOptions,
  DiscoveryPage,
  DiscoveryReport,
  DiscoveryStatus,
} from './types.js';

interface QueueItem {
  url: string;
  depth: number;
  parentUrl?: string;
  discoveredFrom: string;
}

interface DiscoveryRunState {
  id: string;
  options: DiscoveryOptions;
  status: DiscoveryStatus;
  queue: QueueItem[];
  queuedUrls: Set<string>;
  pages: Map<string, DiscoveryPage>;
  categories: Map<string, DiscoveryCategory>;
  products: DiscoveryDeduper;
  logs: DiscoveryLog[];
  startedAt: string;
  finishedAt?: string;
  /** Active manual session id (when discovery is paused on captcha or has resumed via that session). */
  manualSessionId?: string;
  manualQueueItem?: QueueItem;
  /** domain → manual session id. After a captcha solve, subsequent URLs on
   *  that domain reuse the same cookie-warmed browser to avoid re-tripping
   *  the same challenge from cheerio. */
  domainSessions: Map<string, string>;
  abortRequested: boolean;
  pauseRequested: boolean;
}

const runs = new Map<string, DiscoveryRunState>();
const DEFAULT_TIMEOUT_MS = 20_000;
const PER_DOMAIN_DELAY_MS = 1_000;

function log(run: DiscoveryRunState, level: DiscoveryLog['level'], message: string, context?: Record<string, unknown>) {
  run.logs.push({ level, message, context, createdAt: new Date().toISOString() });
  if (run.logs.length > 1000) run.logs.splice(0, run.logs.length - 1000);
}

function counters(run: DiscoveryRunState) {
  const pages = [...run.pages.values()];
  return {
    pagesDiscovered: run.queuedUrls.size,
    pagesCrawled: pages.filter((p) => p.status === 'crawled').length,
    categoriesFound: run.categories.size,
    productsFound: run.products.values().length,
    errorsCount: run.logs.filter((entry) => entry.level === 'error').length + pages.filter((p) => p.status === 'error').length,
  };
}

function enqueue(run: DiscoveryRunState, url: string | null, item: Omit<QueueItem, 'url'>) {
  if (!url || run.queuedUrls.has(url)) return;
  if (run.queuedUrls.size >= run.options.maxPages) return;
  run.queuedUrls.add(url);
  run.queue.push({ url, ...item });
  run.pages.set(url, {
    url,
    normalizedUrl: url,
    pageType: 'unknown',
    status: 'queued',
    depth: item.depth,
    parentUrl: item.parentUrl,
    confidence: 0,
    discoveredFrom: item.discoveredFrom,
  });
}

function htmlLinks(html: string, pageUrl: string, rootUrl: string) {
  const $ = cheerio.load(html);
  return $('a[href]')
    .toArray()
    .map((el) =>
      normalizeUrl($(el).attr('href'), {
        rootUrl,
        baseUrl: pageUrl,
      }),
    )
    .filter((url): url is string => Boolean(url));
}

function shouldEnqueueLink(url: string, depth: number) {
  if (depth <= 1) return isLikelyCategoryUrl(url) || isLikelyProductUrl(url) || urlDepth(url) <= 2;
  return isLikelyCategoryUrl(url) || isLikelyProductUrl(url);
}

async function seedSitemaps(run: DiscoveryRunState, rootUrl: string) {
  log(run, 'info', 'Loading sitemap candidates');
  const { urls, sitemaps } = await loadSitemapUrls(rootUrl, run.options.userAgent, run.options.maxPages);
  log(run, 'info', `Loaded ${urls.length} sitemap URLs`, { sitemaps: sitemaps.length });
  for (const url of urls) {
    if (isLikelyCategoryUrl(url) || isLikelyProductUrl(url)) {
      enqueue(run, url, {
        depth: Math.min(run.options.crawlDepth, Math.max(1, urlDepth(url))),
        discoveredFrom: 'sitemap',
      });
    }
  }
}

function recordPage(run: DiscoveryRunState, item: QueueItem, patch: Partial<DiscoveryPage>) {
  const existing = run.pages.get(item.url);
  run.pages.set(item.url, {
    url: item.url,
    normalizedUrl: item.url,
    pageType: 'unknown',
    status: 'queued',
    depth: item.depth,
    parentUrl: item.parentUrl,
    confidence: 0,
    discoveredFrom: item.discoveredFrom,
    ...existing,
    ...patch,
  });
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

async function pauseForManual(run: DiscoveryRunState, item: QueueItem, reason: string) {
  if (!run.options.useManualCaptcha) {
    recordPage(run, item, { status: 'error', error: reason, pageType: 'captcha', crawledAt: new Date().toISOString() });
    log(run, 'error', `Blocked and manual captcha mode is disabled`, { url: item.url, reason });
    return false;
  }

  const domain = domainOf(item.url);

  // Reuse an existing manual session for this domain if one is alive.
  const existingId = run.domainSessions.get(domain);
  if (existingId) {
    const existing = sessionStatus(existingId);
    if (existing && existing.status !== 'cancelled' && existing.status !== 'expired' && !existing.closedAt) {
      run.manualSessionId = existingId;
      run.manualQueueItem = item;
      run.status = 'manual_action_required';
      log(run, 'warn', 'Manual action required (reusing existing browser).', {
        url: item.url,
        sessionId: existingId,
        reason,
      });
      // Re-flag pending URLs for this domain so auto-close stays blocked.
      const pending = run.queue.filter((q) => domainOf(q.url) === domain).length + 1;
      recordActivity(existingId, { pendingUrlsCount: pending });
      return true;
    }
    run.domainSessions.delete(domain);
  }

  const session = await startManualSession(item.url, run.options.userAgent, 90_000);
  if (session?.id) {
    run.domainSessions.set(domain, session.id);
    // Tell the session manager how much work is waiting on this domain.
    const pending = run.queue.filter((q) => domainOf(q.url) === domain).length + 1;
    recordActivity(session.id, { pendingUrlsCount: pending });
  }
  run.manualSessionId = session?.id;
  run.manualQueueItem = item;
  run.status = 'manual_action_required';
  log(run, 'warn', 'Manual action required. Complete the challenge in the browser, then resume discovery.', {
    url: item.url,
    sessionId: session?.id,
    reason,
  });
  return true;
}

/**
 * Convert a DetectedCard from the scoring-based detector into our internal
 * DiscoveryProduct shape. URL is required; everything else is best-effort.
 */
function detectedToProduct(
  c: DetectedCard,
  pageUrl: string,
  category?: DiscoveryCategory,
): import('./types.js').DiscoveryProduct | null {
  if (!c.productUrl) return null;
  const rootUrl = new URL(pageUrl).origin;
  const normalizedUrl = normalizeUrl(c.productUrl, { rootUrl, baseUrl: pageUrl });
  if (!normalizedUrl) return null;
  return {
    id: randomUUID(),
    url: normalizedUrl,
    normalizedUrl,
    title: c.title,
    price: c.price,
    oldPrice: c.oldPrice,
    currency: c.currency,
    availability: c.availability,
    imageUrl: c.imageUrl,
    brand: c.brand,
    sku: c.sku,
    ean: c.ean,
    gtin: c.gtin,
    rating: c.rating,
    categoryPath: category?.path,
    categoryUrl: pageUrl,
    breadcrumbs: category?.breadcrumbs ?? [],
    sourcePageUrl: pageUrl,
    rawCardJson: {
      selector: c.selector,
      signature: c.signature,
      signals: c.signals,
      score: c.score,
      detectorSource: c.source,
    },
    confidence: c.confidence,
    source: 'category_card',
    errors: c.title && c.price != null ? [] : ['incomplete_card'],
  };
}

function addProductsFromCategory(
  run: DiscoveryRunState,
  html: string,
  pageUrl: string,
  category?: DiscoveryCategory,
  precomputedDetection?: DetectionResult,
) {
  // Step 1: run the scoring-based detector. It covers schema.org, framework
  // JSON payloads, German shop markup, lazy images, nested duplicates.
  const detection = precomputedDetection ?? detectProductCards(html, { pageUrl });
  for (const entry of detection.logs) {
    log(run, entry.level, `[detector] ${entry.message}`, entry.context);
  }

  let added = 0;
  if (detection.cards.length > 0) {
    for (const card of detection.cards) {
      if (run.products.values().length >= run.options.maxProducts) break;
      const product = detectedToProduct(card, pageUrl, category);
      if (!product) continue;
      run.products.upsert(product);
      added += 1;
      if (run.options.mode === 'detail_enrichment') {
        enqueue(run, product.normalizedUrl, {
          depth: Math.min(run.options.crawlDepth, (run.pages.get(pageUrl)?.depth ?? 0) + 1),
          parentUrl: pageUrl,
          discoveredFrom: 'product_card',
        });
      }
    }
  }

  // Step 2: legacy extractor fallback. Runs only if the detector returned
  // nothing — never duplicates URLs (DiscoveryDeduper handles that).
  if (added === 0) {
    const legacy = extractProductCards(html, pageUrl, category?.path, category?.breadcrumbs ?? []);
    for (const product of legacy) {
      if (run.products.values().length >= run.options.maxProducts) break;
      run.products.upsert(product);
      added += 1;
      if (run.options.mode === 'detail_enrichment') {
        enqueue(run, product.normalizedUrl, {
          depth: Math.min(run.options.crawlDepth, (run.pages.get(pageUrl)?.depth ?? 0) + 1),
          parentUrl: pageUrl,
          discoveredFrom: 'product_card',
        });
      }
    }
    if (legacy.length > 0) {
      log(run, 'info', `Legacy extractor fallback found ${legacy.length} product(s)`, { url: pageUrl });
    }
  }

  return { added, detection };
}

async function aiProductCardsFallback(run: DiscoveryRunState, html: string, pageUrl: string, category?: DiscoveryCategory) {
  if (!run.options.useAi) return 0;
  const provider = getAIProvider();
  if (!provider) return 0;
  const cleaned = cleanDom(html);
  const dom = reduceDomForPrompt(cleaned.html, Number(process.env.AI_EXTRACTION_MAX_HTML_CHARS ?? 60_000));
  try {
    const { value: suggestion, cacheHit } = await debounceAi(`discovery-category:${pageUrl}:${cleaned.hash}`, () =>
      provider.detectCategorySelectors({ url: pageUrl, cleanedDom: dom, domHash: cleaned.hash }),
    );
    const products = extractProductCardsWithSelectors(html, pageUrl, suggestion, category?.path, category?.breadcrumbs ?? []);
    for (const product of products) {
      if (run.products.values().length >= run.options.maxProducts) break;
      run.products.upsert(product);
    }
    if (products.length) log(run, 'info', 'AI-assisted product card extraction succeeded', { url: pageUrl, products: products.length, cacheHit });
    return products.length;
  } catch (err) {
    log(run, 'warn', 'AI-assisted product card extraction failed', { url: pageUrl, error: (err as Error).message });
    return 0;
  }
}

async function processHtml(run: DiscoveryRunState, item: QueueItem, html: string, httpStatus = 200) {
  const meta = pageTitleAndH1(html);
  const canonical = normalizeUrl(meta.canonicalUrl, {
    rootUrl: run.options.startUrl,
    baseUrl: item.url,
  }) ?? undefined;
  const classification = classifyDiscoveryPage(canonical ?? item.url, html);
  recordPage(run, item, {
    status: 'crawled',
    pageType: classification.pageType,
    confidence: classification.confidence,
    title: meta.title,
    h1: meta.h1,
    canonicalUrl: canonical,
    httpStatus,
    crawledAt: new Date().toISOString(),
  });
  log(run, 'info', `Classified ${classification.pageType} (conf ${classification.confidence.toFixed(2)})`, {
    url: item.url,
    pageType: classification.pageType,
    signals: classification.signals,
    htmlSize: html.length,
  });

  if (classification.pageType === 'product') {
    const existing = run.products.values().find((product) => product.normalizedUrl === (canonical ?? item.url)) ?? {
      id: randomUUID(),
      url: canonical ?? item.url,
      normalizedUrl: canonical ?? item.url,
      sourcePageUrl: item.parentUrl ?? item.url,
      breadcrumbs: [],
      confidence: 0.4,
      source: 'heuristic' as const,
      errors: [],
    };
    run.products.upsert(enrichProductFromDetail(existing, html));
  }

  if (classification.pageType === 'homepage' || classification.pageType === 'category') {
    const pagination = detectPaginationUrls(html, item.url, run.options.maxPagesPerCategory);
    const tempProducts = extractProductCards(html, item.url);
    const detectedProducts = detectProductCards(html, { pageUrl: item.url });
    const productCount = Math.max(tempProducts.length, detectedProducts.cards.length);
    let category: DiscoveryCategory | undefined;
    if (classification.pageType === 'category' || productCount >= 2) {
      category = detectCategory(item.url, html, productCount, pagination.length);
      run.categories.set(item.url, category);
    }
    const { added, detection } = addProductsFromCategory(run, html, item.url, category, detectedProducts);
    const shouldTryAi =
      added === 0 ||
      (run.options.useAi && detection.confidence > 0 && detection.confidence < 0.65);
    if (shouldTryAi && (classification.pageType === 'category' || productCount === 0 || detection.confidence < 0.65)) {
      await aiProductCardsFallback(run, html, item.url, category);
    }
    for (const url of pagination) {
      enqueue(run, url, { depth: item.depth, parentUrl: item.url, discoveredFrom: 'pagination' });
    }
  }

  if (item.depth < run.options.crawlDepth) {
    for (const url of htmlLinks(html, item.url, run.options.startUrl)) {
      if (shouldEnqueueLink(url, item.depth + 1)) {
        enqueue(run, url, {
          depth: item.depth + 1,
          parentUrl: item.url,
          discoveredFrom: classification.pageType === 'homepage' ? 'homepage_links' : 'html_links',
        });
      }
    }
  }

  if (run.products.values().length >= run.options.maxProducts) {
    log(run, 'warn', 'Max products limit reached', { maxProducts: run.options.maxProducts });
    run.queue = [];
  }
}

async function processQueueItem(run: DiscoveryRunState, item: QueueItem) {
  if (run.options.respectRobotsTxt && !(await isAllowedByRobots(item.url, run.options.userAgent))) {
    recordPage(run, item, { status: 'skipped', error: 'robots.txt disallowed', crawledAt: new Date().toISOString() });
    log(run, 'warn', 'Skipped by robots.txt', { url: item.url });
    return;
  }

  const domain = domainOf(item.url);
  const stickySessionId = run.domainSessions.get(domain);

  // If this domain already has an active cookie-warmed manual browser,
  // route the fetch through it instead of cheerio. This is the fix for
  // "discovery keeps bouncing back to captcha after the user solved it".
  if (stickySessionId) {
    const status = sessionStatus(stickySessionId);
    const stillAlive = status && status.status !== 'cancelled' && status.status !== 'expired' && !status.closedAt;
    if (stillAlive) {
      const { fetched } = await navigateInManualSession(stickySessionId, item.url, 45_000);
      if (fetched) {
        // STRICT classification: only re-pause on actual challenge UI (not
        // the word "captcha" buried in a privacy-policy link). A plain
        // marketing page from a cookie-warmed browser is fine even if it
        // mentions "reCAPTCHA" somewhere in its footer.
        const cls = classifyResponseStrict(fetched.status, fetched.html);
        if (!cls.ok) {
          await pauseForManual(run, item, cls.code);
          return;
        }
        recordActivity(stickySessionId, { pendingUrlsCount: -1 });
        await processHtml(run, item, fetched.html, fetched.status);
        return;
      }
      log(run, 'warn', 'Manual session navigation failed, falling back to cheerio', { url: item.url });
      run.domainSessions.delete(domain);
    } else {
      run.domainSessions.delete(domain);
    }
  }

  await throttleByDomain(domain, PER_DOMAIN_DELAY_MS);
  let fetched;
  try {
    fetched = await fetchHtml(item.url, run.options.userAgent, DEFAULT_TIMEOUT_MS);
  } catch (err) {
    recordPage(run, item, { status: 'error', error: (err as Error).message, crawledAt: new Date().toISOString() });
    log(run, 'error', 'Fetch failed', { url: item.url, error: (err as Error).message });
    return;
  }

  const cls = classifyResponse(fetched.status, fetched.html);
  if (!cls.ok) {
    const paused = await pauseForManual(run, item, cls.code);
    if (paused) return;
    recordPage(run, item, { status: 'error', pageType: cls.code === 'captcha' ? 'captcha' : 'unknown', httpStatus: fetched.status, error: cls.code });
    return;
  }

  // SPA-shell escalation: if cheerio returned an empty Tilda/Shopify/InSales/
  // Bitrix product-list container, the cards are populated by JS — refetch
  // the page through Playwright so we actually see them. Same pause/throttle
  // rules apply; we only do this once per page (no recursion).
  const shell = detectSpaShell(fetched.html);
  if (shell.likely) {
    log(run, 'info', `SPA shell detected (${shell.reason}); retrying via Playwright`, {
      url: item.url,
      container: shell.emptyContainerSelector,
    });
    try {
      const pw = await fetchHtmlBrowser(item.url, run.options.userAgent, 30_000);
      const cls2 = classifyResponse(pw.status, pw.html);
      if (cls2.ok && pw.html.length > fetched.html.length / 2) {
        fetched = pw;
        log(run, 'info', `Playwright render succeeded (+${pw.html.length - fetched.html.length} chars)`, {
          url: item.url,
        });
      } else if (!cls2.ok) {
        log(run, 'warn', `Playwright render returned ${cls2.code}; falling back to cheerio HTML`, {
          url: item.url,
        });
      }
    } catch (err) {
      log(run, 'warn', `Playwright render failed: ${(err as Error).message}`, { url: item.url });
    }
  }

  await processHtml(run, item, fetched.html, fetched.status);
}

async function settleManualSessionsAfterRun(run: DiscoveryRunState) {
  // For every sticky session, signal "all work drained" so the browser can
  // auto-close on the next cleanup sweep (unless the operator pinned it).
  for (const [domain, sessionId] of run.domainSessions) {
    try {
      await completeManualSession(
        sessionId,
        `discovery run ${run.id} finished — no more pending URLs for ${domain}`,
      );
      log(run, 'info', 'Signalled manual session complete', { sessionId, domain });
    } catch (err) {
      log(run, 'warn', 'Failed to signal manual session complete', {
        sessionId,
        domain,
        error: (err as Error).message,
      });
    }
  }
  run.domainSessions.clear();
}

async function runLoop(run: DiscoveryRunState) {
  if (run.status === 'queued') run.status = 'running';
  try {
    while (run.queue.length && run.status === 'running') {
      if (run.abortRequested) {
        run.status = 'cancelled';
        break;
      }
      if (run.pauseRequested) {
        run.status = 'paused';
        break;
      }
      if (run.products.values().length >= run.options.maxProducts) break;
      const item = run.queue.shift();
      if (!item) break;
      log(run, 'info', `Crawling page: ${item.url}`, { url: item.url, depth: item.depth });
      await processQueueItem(run, item);
      if ((run.status as DiscoveryStatus) === 'manual_action_required') return;
    }
    if (run.status === 'running') {
      run.status = run.logs.some((entry) => entry.level === 'error') ? 'partial' : 'success';
      run.finishedAt = new Date().toISOString();
      log(run, 'info', 'Discovery finished', counters(run));
      await settleManualSessionsAfterRun(run);
    } else if (run.status === 'cancelled') {
      await settleManualSessionsAfterRun(run);
    }
  } catch (err) {
    run.status = 'failed';
    run.finishedAt = new Date().toISOString();
    log(run, 'error', 'Discovery failed', { error: (err as Error).message });
    await settleManualSessionsAfterRun(run);
  }
}

export async function startDiscoveryRun(options: DiscoveryOptions) {
  const id = options.runId ?? randomUUID();
  const root = normalizeUrl(options.startUrl, {
    rootUrl: options.startUrl,
    domainAllowlist: options.domainAllowlist,
    includePatterns: options.includePatterns,
    excludePatterns: options.excludePatterns,
  });
  if (!root) throw new Error('Invalid discovery start URL');
  const run: DiscoveryRunState = {
    id,
    options: { ...options, startUrl: root },
    status: 'queued',
    queue: [],
    queuedUrls: new Set(),
    pages: new Map(),
    categories: new Map(),
    products: new DiscoveryDeduper(),
    logs: [],
    startedAt: new Date().toISOString(),
    abortRequested: false,
    pauseRequested: false,
    domainSessions: new Map(),
  };
  runs.set(id, run);
  enqueue(run, root, { depth: 0, discoveredFrom: 'start_url' });
  seedSitemaps(run, root)
    .catch((err) => log(run, 'warn', 'Sitemap discovery failed', { error: (err as Error).message }))
    .finally(() => {
      if (run.status === 'queued') runLoop(run);
    });
  return discoveryStatus(id);
}

export async function resumeDiscoveryRun(id: string) {
  const run = runs.get(id);
  if (!run) return null;
  if (run.status === 'manual_action_required' && run.manualSessionId && run.manualQueueItem) {
    const item = run.manualQueueItem;
    const sessionId = run.manualSessionId;
    const { fetched } = await continueManualSession(sessionId, 45_000);
    if (fetched) {
      // Trust the user: they confirmed the challenge is solved. Only re-pause
      // if we see explicit challenge markup (g-recaptcha iframe, cf-error
      // page, etc.). False-positives on the word "captcha" appearing in
      // privacy-policy text used to lock the run forever — fixed by using
      // classifyResponseStrict here.
      const cls = classifyResponseStrict(fetched.status, fetched.html);
      if (!cls.ok) {
        log(run, 'warn', 'Continue returned an explicit challenge page; user must retry.', {
          sessionId,
          errorCode: cls.code,
        });
        return discoveryStatus(id);
      }
      await processHtml(run, item, fetched.html, fetched.status);
      recordActivity(sessionId, { pendingUrlsCount: -1 });
      // Keep the sticky-session mapping so subsequent URLs on the same
      // domain reuse the same cookie-warmed browser instead of cheerio.
      run.domainSessions.set(domainOf(item.url), sessionId);
      log(run, 'info', 'Manual challenge solved; subsequent URLs on this domain will reuse the visible browser.', {
        sessionId,
        domain: domainOf(item.url),
      });
      run.manualSessionId = undefined;
      run.manualQueueItem = undefined;
    }
  }
  run.pauseRequested = false;
  if (run.status === 'paused' || run.status === 'manual_action_required') run.status = 'running';
  void runLoop(run);
  return discoveryStatus(id);
}

export async function pauseDiscoveryRun(id: string) {
  const run = runs.get(id);
  if (!run) return null;
  run.pauseRequested = true;
  if (run.status === 'running' || run.status === 'queued') run.status = 'paused';
  log(run, 'info', 'Discovery paused');
  return discoveryStatus(id);
}

export async function cancelDiscoveryRun(id: string) {
  const run = runs.get(id);
  if (!run) return null;
  run.abortRequested = true;
  run.status = 'cancelled';
  run.finishedAt = new Date().toISOString();
  // Tear down every browser this run opened (current pending one + any sticky
  // domain sessions). cancelManualSession is graceful: it persists storage
  // before killing the context, so cookies survive for next time.
  if (run.manualSessionId) await cancelManualSession(run.manualSessionId).catch(() => null);
  for (const sessionId of run.domainSessions.values()) {
    await cancelManualSession(sessionId).catch(() => null);
  }
  run.domainSessions.clear();
  log(run, 'warn', 'Discovery cancelled');
  return discoveryStatus(id);
}

export function discoveryStatus(id: string) {
  const run = runs.get(id);
  if (!run) return null;
  return {
    runId: run.id,
    status: run.status,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    manualSession: run.manualSessionId ? sessionStatus(run.manualSessionId) : null,
    queueLength: run.queue.length,
    ...counters(run),
  };
}

export function discoveryLogs(id: string, limit = 200) {
  const run = runs.get(id);
  if (!run) return null;
  return run.logs.slice(-limit);
}

export function discoveryReport(id: string): DiscoveryReport | null {
  const run = runs.get(id);
  if (!run) return null;
  return buildDiscoveryReport({
    runId: run.id,
    status: run.status,
    startUrl: run.options.startUrl,
    pages: [...run.pages.values()],
    categories: [...run.categories.values()],
    products: run.products.values(),
    logs: run.logs,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
  });
}
