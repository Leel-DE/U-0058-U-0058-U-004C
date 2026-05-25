import Fastify from 'fastify';
import pino from 'pino';
import { z } from 'zod';
import { fetchHtml } from './fetcher/cheerio.js';
import { browserPoolStats, fetchHtmlBrowser, closePlaywright, playwrightHealth } from './fetcher/playwright.js';
import { createRequestId, logStructured } from './observability.js';
import { extract } from './parser/cascade.js';
import { classifyResponse } from './detect/block.js';
import { detectBaseSelectorsFromPages, findFirstProductUrl, type DetectionPage } from './detect/base-selectors.js';
import { checkRobots } from './robots/check.js';
import { throttleByDomain } from './rate-limit.js';
import type { ScrapingRules, ErrorCode } from './types.js';
import { cleanDom } from './ai/cleaners/clean-dom.js';
import { reduceDomForPrompt, estimateTokens } from './ai/cleaners/reduce-dom.js';
import { debounceAi, aiCacheStats } from './ai/cache/ai-cache.js';
import { aiStatus, getAIProvider } from './ai/providers/index.js';
import { selectorSuggestionSchema } from './ai/schemas/selector-suggestion.js';
import { categorySuggestionSchema } from './ai/schemas/category-suggestion.js';
import { validateProductSelectors, validateCategorySelectors } from './ai/validators/selector-validator.js';
import { detectCategoryHeuristics } from './ai/validators/category-heuristic.js';
import {
  cancelManualSession,
  continueManualSession,
  getDomainStorageState,
  markManualSession,
  sessionStatus,
  startManualSession,
} from './manual/session-manager.js';
import {
  closeNow as closeManualSessionNow,
  complete as completeManualSession,
  list as listManualSessions,
  recordActivity as recordManualActivity,
  reopen as reopenManualSession,
  setKeepOpen as setManualKeepOpen,
  tearDownIfReady as tearDownManualIfReady,
  type ActivityPhase,
} from './manual/browser-session-manager.js';
import {
  rehydrateFromDisk as rehydrateManualStorage,
} from './manual/session-manager.js';
import { startSessionCleanup, stopSessionCleanup } from './manual/session-cleanup.js';
import {
  cancelDiscoveryRun,
  discoveryLogs,
  discoveryReport,
  discoveryStatus,
  pauseDiscoveryRun,
  resumeDiscoveryRun,
  skipCurrentDiscoveryItem,
  startDiscoveryRun,
} from './discovery/discovery-runner.js';
import { analyzeStore } from './discovery/store-analyzer.js';

const logger = pino({ name: 'cr-worker', level: process.env.LOG_LEVEL ?? 'info' });
const PORT = Number(process.env.PORT ?? 4000);
const HOST = process.env.WORKER_HOST ?? '127.0.0.1';
const SECRET = process.env.WORKER_SHARED_SECRET ?? '';
const DEFAULT_USER_AGENT = 'CompetitorRadarBot/1.0 (+contact@example.com)';

const scrapeReqSchema = z.object({
  url: z.string().url(),
  strategy: z.enum(['cheerio', 'playwright', 'manual', 'csv_import', 'auto']),
  rules: z.object({
    titleSelector: z.string().nullable().optional(),
    priceSelector: z.string().nullable().optional(),
    oldPriceSelector: z.string().nullable().optional(),
    availabilitySelector: z.string().nullable().optional(),
    imageSelector: z.string().nullable().optional(),
    skuSelector: z.string().nullable().optional(),
    categorySelector: z.string().nullable().optional(),
    shippingSelector: z.string().nullable().optional(),
    ratingSelector: z.string().nullable().optional(),
    priceRegex: z.string().nullable().optional(),
    useJsonLd: z.boolean(),
    useOpenGraph: z.boolean(),
  }),
  respectRobots: z.boolean(),
  userAgent: z.string().min(5),
  timeoutMs: z.number().int().min(1000).max(60_000).optional(),
});

const previewReqSchema = scrapeReqSchema.omit({ strategy: true }).extend({
  strategy: z.enum(['cheerio', 'playwright', 'auto']).default('auto'),
});

const replayReqSchema = z.object({
  html: z.string().min(1),
  rules: scrapeReqSchema.shape.rules,
});

const autoDetectReqSchema = z.object({
  url: z.string().url(),
  pageType: z.enum(['product', 'category']).default('product'),
  strategy: z.enum(['cheerio', 'playwright', 'auto']).default('auto'),
  respectRobots: z.boolean().default(true),
  userAgent: z.string().min(5),
  timeoutMs: z.number().int().min(1000).max(60_000).optional(),
});

const baseSelectorDetectReqSchema = z.object({
  competitorId: z.string().uuid(),
  homepageUrl: z.string().url(),
  productUrl: z.string().url().nullable().optional(),
  categoryUrl: z.string().url().nullable().optional(),
  useAi: z.boolean().default(false),
  strategy: z.enum(['cheerio', 'playwright', 'auto']).default('auto'),
  respectRobots: z.boolean().default(true),
  userAgent: z.string().min(5).default(DEFAULT_USER_AGENT),
  timeoutMs: z.number().int().min(1000).max(60_000).optional(),
});

const analyzeStoreReqSchema = z.object({
  homepageUrl: z.string().url(),
  useAi: z.boolean().default(false),
  respectRobots: z.boolean().default(true),
  userAgent: z.string().min(5).default(DEFAULT_USER_AGENT),
  timeoutMs: z.number().int().min(1000).max(90_000).optional(),
});

const manualSessionReqSchema = z.object({
  url: z.string().url(),
  userAgent: z.string().min(5),
  rules: scrapeReqSchema.shape.rules.optional(),
  timeoutMs: z.number().int().min(1000).max(120_000).optional(),
});

const manualContinueReqSchema = z.object({
  sessionId: z.string().uuid(),
  rules: scrapeReqSchema.shape.rules.optional(),
  timeoutMs: z.number().int().min(1000).max(60_000).optional(),
});

const discoveryStartReqSchema = z.object({
  runId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  competitorId: z.string().uuid().optional(),
  startUrl: z.string().url(),
  maxPages: z.number().int().min(1).max(5000).default(300),
  maxProducts: z.number().int().min(1).max(50000).default(1000),
  crawlDepth: z.number().int().min(0).max(8).default(4),
  maxPagesPerCategory: z.number().int().min(1).max(100).default(20),
  maxScrollIterations: z.number().int().min(0).max(30).default(10),
  concurrency: z.number().int().min(1).max(3).default(1),
  mode: z.enum(['category_scan', 'detail_enrichment']).default('category_scan'),
  respectRobotsTxt: z.boolean().default(true),
  jsRequired: z.boolean().default(false),
  useAi: z.boolean().default(false),
  useManualCaptcha: z.boolean().default(true),
  includePatterns: z.array(z.string()).default([]),
  excludePatterns: z.array(z.string()).default([]),
  domainAllowlist: z.array(z.string()).default([]),
  userAgent: z.string().min(5),
});

const discoveryControlReqSchema = z.object({
  runId: z.string().uuid(),
});


const DEFAULT_PER_DOMAIN_DELAY_MS = 1_000;
const HTML_SNAPSHOT_LIMIT = Math.max(4_000, Number(process.env.WORKER_HTML_SNAPSHOT_CHARS ?? 200_000));

const app = Fastify({ logger: false });
const fixtureFiller = '<p>Local fixture copy for offline scraping validation, selector testing, alert checks, dashboard refresh checks, and export generation checks.</p>'.repeat(10);
const requestContext = new WeakMap<object, { requestId: string; startedAt: number }>();

async function fetchDetectionPage({
  url,
  strategy,
  respectRobots,
  userAgent,
  timeoutMs,
  warnings,
  logs,
}: {
  url: string;
  strategy: 'cheerio' | 'playwright' | 'auto';
  respectRobots: boolean;
  userAgent: string;
  timeoutMs: number;
  warnings: string[];
  logs: Array<{ level: 'info' | 'warn'; message: string; context?: Record<string, unknown> }>;
}): Promise<DetectionPage | null> {
  const host = new URL(url).hostname;
  if (respectRobots) {
    const robots = await checkRobots(url, userAgent);
    if (!robots.allowed) {
      warnings.push(`robots.txt disallows ${url}`);
      logs.push({ level: 'warn', message: 'robots blocked selector detection fetch', context: { url } });
      return null;
    }
  }

  await throttleByDomain(host, DEFAULT_PER_DOMAIN_DELAY_MS);
  const fetchWith = async (mode: 'cheerio' | 'playwright') =>
    mode === 'playwright'
      ? fetchHtmlBrowser(url, userAgent, timeoutMs, getDomainStorageState(host))
      : fetchHtml(url, userAgent, Math.min(timeoutMs, 20_000));

  try {
    let fetched = await fetchWith(strategy === 'playwright' ? 'playwright' : 'cheerio');
    let cls = classifyResponse(fetched.status, fetched.html);
    if (!cls.ok && strategy === 'auto' && fetched.strategy === 'cheerio') {
      logs.push({
        level: 'info',
        message: 'retrying selector detection fetch with Playwright',
        context: { url, reason: cls.code },
      });
      fetched = await fetchWith('playwright');
      cls = classifyResponse(fetched.status, fetched.html);
    }
    if (!cls.ok) {
      warnings.push(`Could not read ${url}: ${cls.code}`);
      logs.push({ level: 'warn', message: 'selector detection fetch was not usable', context: { url, code: cls.code } });
      return null;
    }
    logs.push({
      level: 'info',
      message: 'selector detection page fetched',
      context: { url, finalUrl: fetched.finalUrl, strategy: fetched.strategy, httpStatus: fetched.status },
    });
    return { url: fetched.finalUrl || url, html: fetched.html };
  } catch (err) {
    warnings.push(`Could not fetch ${url}: ${(err as Error).message}`);
    logs.push({ level: 'warn', message: 'selector detection fetch failed', context: { url, error: (err as Error).message } });
    return null;
  }
}

app.addHook('onRequest', async (req, reply) => {
  requestContext.set(req, { requestId: createRequestId('worker'), startedAt: Date.now() });
  if (req.url === '/health' || req.url === '/robots.txt' || req.url.startsWith('/fixtures/')) return;
  const auth = req.headers.authorization ?? '';
  if (!SECRET || auth !== `Bearer ${SECRET}`) {
    reply.code(401);
    return reply.send({ ok: false, errorCode: 'http_error', message: 'unauthorized' });
  }
});

app.addHook('onResponse', async (req, reply) => {
  if (req.url.startsWith('/fixtures/')) return;
  const ctx = requestContext.get(req);
  logStructured({
    service: 'worker',
    level: reply.statusCode >= 500 ? 'error' : reply.statusCode >= 400 ? 'warn' : 'info',
    requestId: ctx?.requestId,
    category: 'worker',
    event: 'http_request',
    durationMs: ctx ? Date.now() - ctx.startedAt : undefined,
    metadata: {
      method: req.method,
      url: req.url,
      statusCode: reply.statusCode,
      memory: process.memoryUsage(),
    },
  });
});

app.get('/health', async () => ({
  ok: true,
  mode: process.env.LOCAL_DEV_MODE === 'true' ? 'local' : 'standard',
  ai: { ...aiStatus(), cache: aiCacheStats() },
  resources: { memory: process.memoryUsage(), browser: browserPoolStats() },
  ts: new Date().toISOString(),
}));

app.get('/health/resources', async () => ({
  ok: true,
  memory: process.memoryUsage(),
  browser: browserPoolStats(),
  uptimeSeconds: process.uptime(),
  ts: new Date().toISOString(),
}));

app.get('/health/playwright', async (req, reply) => {
  try {
    return await playwrightHealth();
  } catch (err) {
    reply.code(503);
    return { ok: false, error: (err as Error).message, ts: new Date().toISOString() };
  }
});

app.get('/ai/status', async () => ({
  ok: true,
  ...aiStatus(),
  cache: aiCacheStats(),
}));

app.get('/robots.txt', async (_, reply) => {
  reply.type('text/plain');
  return 'User-agent: *\nAllow: /\n';
});

app.get('/fixtures/example-electronics/acme-hp-2000', async (_, reply) => {
  reply.type('text/html');
  return `<!doctype html>
<html>
  <head>
    <title>Acme HP-2000 over-ear headphones</title>
    <meta property="og:title" content="Acme HP-2000 over-ear headphones" />
    <meta property="product:price:amount" content="189.90" />
    <meta property="product:price:currency" content="EUR" />
    <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Product","name":"Acme HP-2000 over-ear headphones","image":"http://127.0.0.1:4000/fixtures/images/hp-2000.jpg","offers":{"@type":"Offer","price":"189.90","priceCurrency":"EUR","availability":"https://schema.org/InStock"}}
    </script>
  </head>
  <body>
    <h1 class="product-title">Acme HP-2000 over-ear headphones</h1>
    <div class="price"><span class="current">EUR 189.90</span><span class="was">EUR 219.00</span></div>
    <p class="stock-status">In stock</p>
    <div class="product-gallery"><img src="/fixtures/images/hp-2000.jpg" alt="Acme HP-2000" /></div>
    <section>
      <h2>Product details</h2>
      <p>Local fixture content for offline scraping validation. The page intentionally includes enough descriptive copy to avoid suspicious tiny-response classification in the worker.</p>
      <p>Features include soft ear pads, active noise reduction, USB-C charging, Bluetooth multipoint support, and a foldable travel case.</p>
      <p>Warranty, shipping, return policy, and promotion copy are present as realistic product-page noise for parser testing.</p>
      <p>Compatibility notes, accessory listings, delivery windows, pickup availability, store guarantees, support links, and product comparison copy provide additional body content for local worker tests.</p>
      <p>Customers can compare this model against nearby products, review pricing changes, and validate selectors for title, current price, old price, availability, image, and structured data extraction.</p>
      <p>This fixture never leaves localhost and is intended only for development, background job validation, alert evaluation, dashboard refresh checks, and export generation checks.</p>
      ${fixtureFiller}
    </section>
  </body>
</html>`;
});

app.get('/fixtures/acme-audio/hp-2000', async (_, reply) => {
  reply.type('text/html');
  return `<!doctype html>
<html>
  <head>
    <title>HP-2000 wireless headphones</title>
    <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Product","name":"HP-2000 wireless headphones","offers":{"@type":"Offer","price":"174.50","priceCurrency":"GBP","availability":"https://schema.org/OutOfStock"}}
    </script>
  </head>
  <body>
    <h1>HP-2000 wireless headphones</h1>
    <strong data-test="price">GBP 174.50</strong>
    <p class="stock-status">Temporarily out of stock</p>
    <section>
      <h2>Product details</h2>
      <p>Local fixture content for offline Playwright and Cheerio scraping validation. This fixture is intentionally verbose enough to pass the worker response-size classifier.</p>
      <p>Highlights include wireless listening, a compact carrying case, adjustable headband, replaceable cushions, and app-based equalizer presets.</p>
      <p>Additional delivery, stock, and product support text appears here to resemble a normal storefront product page.</p>
      <p>Compatibility notes, accessory listings, delivery windows, pickup availability, store guarantees, support links, and product comparison copy provide additional body content for local worker tests.</p>
      <p>Customers can compare this model against nearby products, review pricing changes, and validate selectors for title, current price, availability, and structured data extraction.</p>
      <p>This fixture never leaves localhost and is intended only for development, background job validation, alert evaluation, dashboard refresh checks, and export generation checks.</p>
      ${fixtureFiller}
    </section>
  </body>
</html>`;
});

app.post('/scrape', async (req, reply) => {
  const parse = scrapeReqSchema.safeParse(req.body);
  if (!parse.success) {
    reply.code(400);
    return {
      ok: false,
      errorCode: 'http_error' as ErrorCode,
      message: 'invalid_payload: ' + JSON.stringify(parse.error.flatten().fieldErrors),
      meta: { strategy: 'cheerio', durationMs: 0 },
    };
  }
  const { url, strategy, rules, respectRobots, userAgent, timeoutMs } = parse.data;
  const startedAt = Date.now();
  const host = new URL(url).hostname;

  try {
    if (respectRobots) {
      const r = await checkRobots(url, userAgent);
      if (!r.allowed) {
        return {
          ok: false,
          errorCode: 'skipped_robots' as ErrorCode,
          message: `robots.txt disallows ${url}`,
          meta: { strategy: 'cheerio', durationMs: Date.now() - startedAt, robotsAllowed: false },
        };
      }
    }

    await throttleByDomain(host, DEFAULT_PER_DOMAIN_DELAY_MS);

    const usePw = strategy === 'playwright' || strategy === 'auto';
    let fetched;
    try {
      fetched =
        usePw && strategy === 'playwright'
          ? await fetchHtmlBrowser(url, userAgent, timeoutMs ?? 30_000, getDomainStorageState(host))
          : await fetchHtml(url, userAgent, timeoutMs ?? 15_000);
    } catch (err) {
      logger.warn({ err: (err as Error).message, url }, 'fetch_error');
      return {
        ok: false,
        errorCode: 'http_error' as ErrorCode,
        message: (err as Error).message,
        meta: { strategy: usePw ? 'playwright' : 'cheerio', durationMs: Date.now() - startedAt },
      };
    }

    const cls = classifyResponse(fetched.status, fetched.html);
    if (!cls.ok) {
      // Escalate to Playwright if cheerio looked suspicious and we haven't used PW yet
      if (cls.code === 'suspicious' && fetched.strategy === 'cheerio' && strategy === 'auto') {
        try {
          const pw = await fetchHtmlBrowser(url, userAgent, timeoutMs ?? 30_000, getDomainStorageState(host));
          const cls2 = classifyResponse(pw.status, pw.html);
          if (cls2.ok) {
            fetched = pw;
          } else {
            return {
              ok: false,
              errorCode: cls2.code,
              message: `${cls2.code} on ${url}`,
              meta: {
                strategy: 'playwright',
                httpStatus: pw.status,
                durationMs: Date.now() - startedAt,
                robotsAllowed: true,
              },
              raw: { htmlSnippet: pw.html.slice(0, HTML_SNAPSHOT_LIMIT), screenshotBase64: pw.screenshotBase64 },
            };
          }
        } catch (err) {
          return {
            ok: false,
            errorCode: 'http_error' as ErrorCode,
            message: (err as Error).message,
            meta: { strategy: 'playwright', durationMs: Date.now() - startedAt },
          };
        }
      } else {
        return {
          ok: false,
          errorCode: cls.code,
          message: `${cls.code} on ${url} (HTTP ${fetched.status})`,
          meta: {
            strategy: fetched.strategy,
            httpStatus: fetched.status,
            durationMs: Date.now() - startedAt,
            robotsAllowed: true,
          },
          raw: { htmlSnippet: fetched.html.slice(0, HTML_SNAPSHOT_LIMIT), screenshotBase64: fetched.screenshotBase64 },
        };
      }
    }

    const data = extract(fetched.html, rules as ScrapingRules);
    if (!data) {
      return {
        ok: false,
        errorCode: 'parse_failed' as ErrorCode,
        message: 'no extraction strategy returned a price',
        meta: {
          strategy: fetched.strategy,
          httpStatus: fetched.status,
          durationMs: Date.now() - startedAt,
          robotsAllowed: true,
        },
        raw: { htmlSnippet: fetched.html.slice(0, HTML_SNAPSHOT_LIMIT), screenshotBase64: fetched.screenshotBase64 },
      };
    }

    return {
      ok: true,
      data: {
        title: data.title,
        price: data.price,
        oldPrice: data.oldPrice,
        currency: data.currency,
        availability: data.availability,
        image: data.image,
        sku: data.sku,
        category: data.category,
        shipping: data.shipping,
        rating: data.rating,
      },
      meta: {
        strategy: fetched.strategy,
        httpStatus: fetched.status,
        durationMs: Date.now() - startedAt,
        robotsAllowed: true,
        sourcePath: data.sourcePath,
        confidence: data.confidence,
        fieldConfidence: data.fieldConfidence,
      },
      raw: { htmlSnippet: fetched.html.slice(0, HTML_SNAPSHOT_LIMIT), screenshotBase64: fetched.screenshotBase64 },
    };
  } catch (err) {
    logger.error({ err }, 'scrape failed');
    return {
      ok: false,
      errorCode: 'http_error' as ErrorCode,
      message: (err as Error).message,
      meta: { strategy: 'cheerio', durationMs: Date.now() - startedAt },
    };
  }
});

app.post('/scrape/replay', async (req, reply) => {
  const parse = replayReqSchema.safeParse(req.body);
  if (!parse.success) {
    reply.code(400);
    return {
      ok: false,
      errorCode: 'http_error' as ErrorCode,
      message: 'invalid_payload: ' + JSON.stringify(parse.error.flatten().fieldErrors),
      meta: { strategy: 'cheerio', durationMs: 0 },
    };
  }
  const startedAt = Date.now();
  const data = extract(parse.data.html, parse.data.rules as ScrapingRules);
  if (!data) {
    return {
      ok: false,
      errorCode: 'parse_failed' as ErrorCode,
      message: 'replay extraction returned no price',
      meta: { strategy: 'cheerio', durationMs: Date.now() - startedAt },
      raw: { htmlSnippet: parse.data.html.slice(0, HTML_SNAPSHOT_LIMIT) },
    };
  }
  return {
    ok: true,
    data: {
      title: data.title,
      price: data.price,
      oldPrice: data.oldPrice,
      currency: data.currency,
      availability: data.availability,
      image: data.image,
      sku: data.sku,
      category: data.category,
      shipping: data.shipping,
      rating: data.rating,
    },
    meta: {
      strategy: 'cheerio',
      httpStatus: 200,
      durationMs: Date.now() - startedAt,
      robotsAllowed: true,
      sourcePath: data.sourcePath,
      confidence: data.confidence,
      fieldConfidence: data.fieldConfidence,
    },
    raw: { htmlSnippet: parse.data.html.slice(0, HTML_SNAPSHOT_LIMIT) },
  };
});

app.post('/scrape/preview', async (req, reply) => {
  const parse = previewReqSchema.safeParse(req.body);
  if (!parse.success) {
    reply.code(400);
    return { ok: false, errorCode: 'http_error', message: 'invalid_payload', meta: { strategy: 'cheerio', durationMs: 0 } };
  }
  const body = parse.data;
  req.body = { ...body, strategy: body.strategy };
  return app.inject({
    method: 'POST',
    url: '/scrape',
    headers: { authorization: req.headers.authorization as string, 'content-type': 'application/json' },
    payload: body,
  }).then(async (res) => JSON.parse(res.body));
});

app.post('/scrape/auto-detect', async (req, reply) => {
  const parse = autoDetectReqSchema.safeParse(req.body);
  if (!parse.success) {
    reply.code(400);
    return { ok: false, errorCode: 'http_error', message: 'invalid_payload' };
  }
  const { url, pageType, strategy, respectRobots, userAgent, timeoutMs } = parse.data;
  const startedAt = Date.now();
  const host = new URL(url).hostname;

  if (respectRobots) {
    const robots = await checkRobots(url, userAgent);
    if (!robots.allowed) {
      return { ok: false, errorCode: 'skipped_robots', message: `robots.txt disallows ${url}` };
    }
  }

  await throttleByDomain(host, DEFAULT_PER_DOMAIN_DELAY_MS);
  const fetched =
    strategy === 'playwright'
      ? await fetchHtmlBrowser(url, userAgent, timeoutMs ?? 30_000, getDomainStorageState(host))
      : await fetchHtml(url, userAgent, timeoutMs ?? 15_000);
  const cls = classifyResponse(fetched.status, fetched.html);
  if (!cls.ok) {
    return {
      ok: false,
      errorCode: cls.code,
      message: `${cls.code} on ${url}`,
      manualSessionRecommended: cls.code === 'captcha' || cls.code === 'blocked' || cls.code === 'suspicious',
    };
  }

  const cleaned = cleanDom(fetched.html);
  const provider = getAIProvider();
  const reducedDom = reduceDomForPrompt(cleaned.html, Number(process.env.AI_EXTRACTION_MAX_HTML_CHARS ?? 60_000));

  try {
    if (pageType === 'category') {
      const heuristic = detectCategoryHeuristics(fetched.html);
      if (heuristic && heuristic.confidence >= 0.7) {
        return {
          ok: true,
          pageType,
          aiEnabled: Boolean(provider),
          source: 'heuristic',
          suggestion: heuristic,
          validation: validateCategorySelectors(fetched.html, heuristic),
          cleanedDomHash: cleaned.hash,
          tokenEstimate: estimateTokens(reducedDom),
          meta: { strategy: fetched.strategy, httpStatus: fetched.status, durationMs: Date.now() - startedAt },
        };
      }
      if (!provider) {
        return { ok: false, errorCode: 'ai_disabled', message: 'AI is disabled and category heuristics were not confident enough', heuristic };
      }
      const { value: suggestion, cacheHit } = await debounceAi(`category:${cleaned.hash}`, () =>
        provider.detectCategorySelectors({ url, cleanedDom: reducedDom, domHash: cleaned.hash }),
      );
      const parsed = categorySuggestionSchema.parse(suggestion);
      return {
        ok: true,
        pageType,
        aiEnabled: true,
        source: cacheHit ? 'ai_cache' : 'ai',
        suggestion: parsed,
        validation: validateCategorySelectors(fetched.html, parsed),
        cleanedDomHash: cleaned.hash,
        tokenEstimate: estimateTokens(reducedDom),
        meta: { strategy: fetched.strategy, httpStatus: fetched.status, durationMs: Date.now() - startedAt },
      };
    }

    if (!provider) {
      const preview = extract(fetched.html, { useJsonLd: true, useOpenGraph: true });
      return {
        ok: Boolean(preview),
        pageType,
        aiEnabled: false,
        source: preview ? preview.sourcePath : 'none',
        message: preview ? 'AI disabled; structured data or heuristics produced a preview.' : 'AI disabled and no usable extraction found.',
        preview,
        cleanedDomHash: cleaned.hash,
        meta: { strategy: fetched.strategy, httpStatus: fetched.status, durationMs: Date.now() - startedAt },
      };
    }

    const { value: suggestion, cacheHit } = await debounceAi(`product:${cleaned.hash}`, () =>
      provider.detectProductSelectors({ url, cleanedDom: reducedDom, domHash: cleaned.hash }),
    );
    const parsed = selectorSuggestionSchema.parse(suggestion);
    const validation = validateProductSelectors(fetched.html, parsed);
    const rules: ScrapingRules = {
      ...parsed,
      priceRegex: null,
      useJsonLd: true,
      useOpenGraph: true,
    };
    const preview = extract(fetched.html, rules);
    return {
      ok: true,
      pageType,
      aiEnabled: true,
      source: cacheHit ? 'ai_cache' : 'ai',
      suggestion: parsed,
      validation,
      preview,
      cleanedDomHash: cleaned.hash,
      tokenEstimate: estimateTokens(reducedDom),
      meta: { strategy: fetched.strategy, httpStatus: fetched.status, durationMs: Date.now() - startedAt },
    };
  } catch (err) {
    logger.warn({ err: (err as Error).message, url }, 'auto_detect_failed');
    const preview = extract(fetched.html, { useJsonLd: true, useOpenGraph: true });
    return {
      ok: Boolean(preview),
      pageType,
      aiEnabled: Boolean(provider),
      source: preview ? preview.sourcePath : 'none',
      errorCode: 'ai_failed',
      message: (err as Error).message,
      preview,
      cleanedDomHash: cleaned.hash,
      meta: { strategy: fetched.strategy, httpStatus: fetched.status, durationMs: Date.now() - startedAt },
    };
  }
});

app.post('/scrape/detect-base-selectors', async (req, reply) => {
  const parse = baseSelectorDetectReqSchema.safeParse(req.body);
  if (!parse.success) {
    reply.code(400);
    return { ok: false, errorCode: 'http_error', message: 'invalid_payload', errors: parse.error.flatten().fieldErrors };
  }

  const {
    homepageUrl,
    productUrl,
    categoryUrl,
    useAi,
    strategy,
    respectRobots,
    userAgent,
    timeoutMs,
  } = parse.data;
  const startedAt = Date.now();
  const warnings: string[] = [];
  const logs: Array<{ level: 'info' | 'warn'; message: string; context?: Record<string, unknown> }> = [];
  const fetchOpts = {
    strategy,
    respectRobots,
    userAgent,
    timeoutMs: timeoutMs ?? 45_000,
    warnings,
    logs,
  };

  const categoryPageUrl = categoryUrl ?? homepageUrl;
  const categoryPage = await fetchDetectionPage({ url: categoryPageUrl, ...fetchOpts });

  let resolvedProductUrl = productUrl ?? undefined;
  if (!resolvedProductUrl && categoryPage) {
    resolvedProductUrl = findFirstProductUrl(categoryPage.html, categoryPage.url);
    if (resolvedProductUrl) {
      logs.push({
        level: 'info',
        message: 'derived product URL from listing page',
        context: { productUrl: resolvedProductUrl },
      });
    }
  }

  const productPage = resolvedProductUrl
    ? await fetchDetectionPage({ url: resolvedProductUrl, ...fetchOpts })
    : null;

  if (!categoryPage && !productPage) {
    reply.code(422);
    return {
      ok: false,
      errorCode: 'parse_failed',
      message: 'No readable product or category page was available for selector detection.',
      warnings,
      logs,
      meta: { durationMs: Date.now() - startedAt },
    };
  }

  try {
    const detection = await detectBaseSelectorsFromPages({
      homepageUrl,
      productPage: productPage ?? undefined,
      categoryPage: categoryPage ?? undefined,
      useAi,
      aiProvider: useAi ? getAIProvider() : null,
    });
    return {
      ok: true,
      ...detection,
      warnings: [...warnings, ...detection.warnings],
      logs: [...logs, ...detection.logs],
      meta: {
        durationMs: Date.now() - startedAt,
        productUrl: productPage?.url ?? resolvedProductUrl,
        categoryUrl: categoryPage?.url ?? categoryPageUrl,
        aiEnabled: Boolean(useAi && getAIProvider()),
      },
    };
  } catch (err) {
    logger.warn({ err: (err as Error).message, homepageUrl, productUrl, categoryUrl }, 'base_selector_detection_failed');
    reply.code(500);
    return {
      ok: false,
      errorCode: 'http_error',
      message: (err as Error).message,
      warnings,
      logs,
      meta: { durationMs: Date.now() - startedAt },
    };
  }
});

app.post('/competitors/analyze-store', async (req, reply) => {
  const parse = analyzeStoreReqSchema.safeParse(req.body);
  if (!parse.success) {
    reply.code(400);
    return { ok: false, errorCode: 'http_error', message: 'invalid_payload', errors: parse.error.flatten().fieldErrors };
  }

  const startedAt = Date.now();
  try {
    const analysis = await analyzeStore({
      ...parse.data,
      aiProvider: parse.data.useAi ? getAIProvider() : null,
    });
    return {
      ok: true,
      ...analysis,
      meta: {
        durationMs: Date.now() - startedAt,
        aiEnabled: Boolean(parse.data.useAi && getAIProvider()),
      },
    };
  } catch (err) {
    logger.warn({ err: (err as Error).message, homepageUrl: parse.data.homepageUrl }, 'store_analysis_failed');
    reply.code(422);
    return {
      ok: false,
      errorCode: 'store_analysis_failed',
      message: (err as Error).message,
      warnings: ['Store analysis could not complete. Retry or use manual setup.'],
      logs: [{ level: 'warn', message: 'store analysis failed', context: { error: (err as Error).message } }],
      meta: { durationMs: Date.now() - startedAt },
    };
  }
});

app.post('/scrape/manual-session/start', async (req, reply) => {
  const parse = manualSessionReqSchema.safeParse(req.body);
  if (!parse.success) {
    reply.code(400);
    return { ok: false, message: 'invalid_payload' };
  }
  const status = await startManualSession(parse.data.url, parse.data.userAgent, parse.data.timeoutMs);
  if (!status || !parse.data.rules) return { ok: Boolean(status), session: status };

  const { status: readStatus, fetched } = await continueManualSession(status.id, parse.data.timeoutMs);
  if (!fetched) return { ok: Boolean(readStatus), session: readStatus };
  const data = extract(fetched.html, parse.data.rules as ScrapingRules);
  if (data) {
    const session = markManualSession(status.id, 'preview_ready', 'Extraction preview is ready from the visible browser.');
    return {
      ok: true,
      paused: false,
      session,
      preview: data,
      raw: { htmlSnippet: fetched.html.slice(0, 4_000) },
    };
  }
  const cls = classifyResponse(fetched.status, fetched.html);
  if (!cls.ok) {
    const paused = cls.code === 'captcha' || cls.code === 'blocked' || cls.code === 'suspicious';
    const session = markManualSession(
      status.id,
      paused ? 'waiting_for_manual_action' : 'failed',
      paused
        ? `${cls.code} detected in visible browser. Complete the challenge in that window, then continue.`
        : `${cls.code} detected in visible browser.`,
    );
    return {
      ok: true,
      paused,
      needsManualAction: paused,
      errorCode: cls.code,
      message: paused
        ? 'Manual browser is paused until you complete the challenge.'
        : `${cls.code} on ${parse.data.url}`,
      session,
      raw: { htmlSnippet: fetched.html.slice(0, 4_000) },
    };
  }

  const session = markManualSession(status.id, 'waiting_for_manual_action', 'Visible browser loaded, but extraction did not find a price. Adjust selectors or continue after the page settles.');
  return {
    ok: true,
    paused: false,
    session,
    preview: null,
    raw: { htmlSnippet: fetched.html.slice(0, 4_000) },
  };
});

app.post('/scrape/manual-session/continue', async (req, reply) => {
  const parse = manualContinueReqSchema.safeParse(req.body);
  if (!parse.success) {
    reply.code(400);
    return { ok: false, message: 'invalid_payload' };
  }
  const { status, fetched } = await continueManualSession(parse.data.sessionId, parse.data.timeoutMs);
  if (!status || !fetched) return { ok: Boolean(status), session: status };
  const data = parse.data.rules ? extract(fetched.html, parse.data.rules as ScrapingRules) : undefined;
  if (data) {
    const session = markManualSession(parse.data.sessionId, 'preview_ready', 'Extraction preview is ready from the visible browser.');
    return { ok: true, paused: false, session, preview: data, raw: { htmlSnippet: fetched.html.slice(0, 4_000) } };
  }
  const cls = classifyResponse(fetched.status, fetched.html);
  if (!cls.ok) {
    const paused = cls.code === 'captcha' || cls.code === 'blocked' || cls.code === 'suspicious';
    const session = markManualSession(
      parse.data.sessionId,
      paused ? 'waiting_for_manual_action' : 'failed',
      paused
        ? `${cls.code} is still visible. Keep the browser open, complete it, then continue again.`
        : `${cls.code} detected after continuing manual session.`,
    );
    return {
      ok: true,
      paused,
      needsManualAction: paused,
      errorCode: cls.code,
      message: paused ? 'Still waiting for manual action in the browser window.' : `${cls.code} after manual continue`,
      session,
      raw: { htmlSnippet: fetched.html.slice(0, 4_000) },
    };
  }
  const session = markManualSession(parse.data.sessionId, 'waiting_for_manual_action', 'Visible browser is readable, but extraction did not find a price. Adjust selectors or wait for the page to settle.');
  return { ok: true, paused: false, session, preview: null, raw: { htmlSnippet: fetched.html.slice(0, 4_000) } };
});

app.post('/scrape/manual-session/cancel', async (req, reply) => {
  const parse = z.object({ sessionId: z.string().uuid() }).safeParse(req.body);
  if (!parse.success) {
    reply.code(400);
    return { ok: false, message: 'invalid_payload' };
  }
  return { ok: true, session: await cancelManualSession(parse.data.sessionId) };
});

app.get('/scrape/manual-session/:id/status', async (req, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
  if (!params.success) {
    reply.code(400);
    return { ok: false, message: 'invalid_session_id' };
  }
  const status = sessionStatus(params.data.id);
  if (!status) {
    reply.code(404);
    return { ok: false, message: 'session_not_found' };
  }
  return { ok: true, session: status };
});

// ---- Lifecycle controls (added by browser-session-manager) ----------------

app.get('/scrape/manual-session', async () => {
  return { ok: true, sessions: listManualSessions() };
});

const keepOpenSchema = z.object({
  sessionId: z.string().uuid(),
  keepOpen: z.boolean(),
});
app.post('/scrape/manual-session/keep-open', async (req, reply) => {
  const parse = keepOpenSchema.safeParse(req.body);
  if (!parse.success) {
    reply.code(400);
    return { ok: false, message: 'invalid_payload' };
  }
  const session = setManualKeepOpen(parse.data.sessionId, parse.data.keepOpen);
  if (!session) {
    reply.code(404);
    return { ok: false, message: 'session_not_found' };
  }
  return { ok: true, session };
});

const closeNowSchema = z.object({ sessionId: z.string().uuid() });
app.post('/scrape/manual-session/close-now', async (req, reply) => {
  const parse = closeNowSchema.safeParse(req.body);
  if (!parse.success) {
    reply.code(400);
    return { ok: false, message: 'invalid_payload' };
  }
  const session = await closeManualSessionNow(parse.data.sessionId);
  if (!session) {
    reply.code(404);
    return { ok: false, message: 'session_not_found' };
  }
  return { ok: true, session };
});

const reopenSchema = z.object({ sessionId: z.string().uuid() });
app.post('/scrape/manual-session/reopen', async (req, reply) => {
  const parse = reopenSchema.safeParse(req.body);
  if (!parse.success) {
    reply.code(400);
    return { ok: false, message: 'invalid_payload' };
  }
  const session = await reopenManualSession(parse.data.sessionId);
  if (!session) {
    reply.code(404);
    return { ok: false, message: 'session_not_found' };
  }
  return { ok: true, session };
});

const completeSchema = z.object({
  sessionId: z.string().uuid(),
  note: z.string().max(500).optional(),
});
app.post('/scrape/manual-session/complete', async (req, reply) => {
  const parse = completeSchema.safeParse(req.body);
  if (!parse.success) {
    reply.code(400);
    return { ok: false, message: 'invalid_payload' };
  }
  completeManualSession(parse.data.sessionId, parse.data.note);
  const session = await tearDownManualIfReady(parse.data.sessionId);
  if (!session) {
    reply.code(404);
    return { ok: false, message: 'session_not_found' };
  }
  return { ok: true, session };
});

const activitySchema = z.object({
  sessionId: z.string().uuid(),
  delta: z
    .object({
      activeJobsCount: z.number().int().optional(),
      activePagesCount: z.number().int().optional(),
      pendingUrlsCount: z.number().int().optional(),
      pendingRetriesCount: z.number().int().optional(),
      phase: z
        .enum([
          'idle',
          'navigating',
          'awaiting_user',
          'extracting',
          'discovering',
          'paginating',
          'persisting',
          'closing',
        ])
        .optional(),
    })
    .default({}),
});
app.post('/scrape/manual-session/activity', async (req, reply) => {
  const parse = activitySchema.safeParse(req.body);
  if (!parse.success) {
    reply.code(400);
    return { ok: false, message: 'invalid_payload' };
  }
  const session = recordManualActivity(
    parse.data.sessionId,
    parse.data.delta as Partial<{
      activeJobsCount: number;
      activePagesCount: number;
      pendingUrlsCount: number;
      pendingRetriesCount: number;
      phase: ActivityPhase;
    }>,
  );
  if (!session) {
    reply.code(404);
    return { ok: false, message: 'session_not_found' };
  }
  return { ok: true, session };
});

app.post('/discovery/start', async (req, reply) => {
  const parse = discoveryStartReqSchema.safeParse(req.body);
  if (!parse.success) {
    reply.code(400);
    return { ok: false, message: 'invalid_payload', errors: parse.error.flatten().fieldErrors };
  }
  const status = await startDiscoveryRun(parse.data);
  return { ok: true, status };
});

app.post('/discovery/pause', async (req, reply) => {
  const parse = discoveryControlReqSchema.safeParse(req.body);
  if (!parse.success) {
    reply.code(400);
    return { ok: false, message: 'invalid_payload' };
  }
  return { ok: true, status: await pauseDiscoveryRun(parse.data.runId) };
});

app.post('/discovery/resume', async (req, reply) => {
  const parse = discoveryControlReqSchema.safeParse(req.body);
  if (!parse.success) {
    reply.code(400);
    return { ok: false, message: 'invalid_payload' };
  }
  return { ok: true, status: await resumeDiscoveryRun(parse.data.runId) };
});

app.post('/discovery/skip-current', async (req, reply) => {
  const parse = discoveryControlReqSchema.safeParse(req.body);
  if (!parse.success) {
    reply.code(400);
    return { ok: false, message: 'invalid_payload' };
  }
  return { ok: true, status: await skipCurrentDiscoveryItem(parse.data.runId) };
});

app.post('/discovery/cancel', async (req, reply) => {
  const parse = discoveryControlReqSchema.safeParse(req.body);
  if (!parse.success) {
    reply.code(400);
    return { ok: false, message: 'invalid_payload' };
  }
  return { ok: true, status: await cancelDiscoveryRun(parse.data.runId) };
});

app.get('/discovery/:runId/status', async (req, reply) => {
  const parse = discoveryControlReqSchema.safeParse(req.params);
  if (!parse.success) {
    reply.code(400);
    return { ok: false, message: 'invalid_run_id' };
  }
  const status = discoveryStatus(parse.data.runId);
  if (!status) {
    reply.code(404);
    return { ok: false, message: 'run_not_found' };
  }
  return { ok: true, status };
});

app.get('/discovery/:runId/logs', async (req, reply) => {
  const parse = discoveryControlReqSchema.safeParse(req.params);
  if (!parse.success) {
    reply.code(400);
    return { ok: false, message: 'invalid_run_id' };
  }
  return { ok: true, logs: discoveryLogs(parse.data.runId) ?? [] };
});

app.get('/discovery/:runId/report', async (req, reply) => {
  const parse = discoveryControlReqSchema.safeParse(req.params);
  if (!parse.success) {
    reply.code(400);
    return { ok: false, message: 'invalid_run_id' };
  }
  const report = discoveryReport(parse.data.runId);
  if (!report) {
    reply.code(404);
    return { ok: false, message: 'run_not_found' };
  }
  return { ok: true, report };
});

const shutdown = async () => {
  logger.info('shutting down');
  try {
    stopSessionCleanup();
    await app.close();
  } finally {
    await closePlaywright();
    process.exit(0);
  }
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

app
  .listen({ port: PORT, host: HOST })
  .then(async (addr) => {
    logger.info({ addr }, 'worker listening');
    // Best-effort: load persisted domain storage states + start cleanup loop.
    const rehydrated = await rehydrateManualStorage();
    if (rehydrated > 0) {
      logger.info({ rehydrated }, 'restored persisted manual storage states');
    }
    startSessionCleanup();
  })
  .catch((err) => {
    logger.error(err);
    process.exit(1);
  });
