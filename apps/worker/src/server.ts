import Fastify from 'fastify';
import pino from 'pino';
import { z } from 'zod';
import { fetchHtml } from './fetcher/cheerio.js';
import { fetchHtmlBrowser, closePlaywright } from './fetcher/playwright.js';
import { extract } from './parser/cascade.js';
import { classifyResponse } from './detect/block.js';
import { checkRobots } from './robots/check.js';
import { throttleByDomain } from './rate-limit.js';
import type { ScrapingRules, ErrorCode } from './types.js';

const logger = pino({ name: 'cr-worker', level: process.env.LOG_LEVEL ?? 'info' });
const PORT = Number(process.env.PORT ?? 4000);
const HOST = process.env.WORKER_HOST ?? '127.0.0.1';
const SECRET = process.env.WORKER_SHARED_SECRET ?? '';

const scrapeReqSchema = z.object({
  url: z.string().url(),
  strategy: z.enum(['cheerio', 'playwright', 'manual', 'csv_import', 'auto']),
  rules: z.object({
    titleSelector: z.string().nullable().optional(),
    priceSelector: z.string().nullable().optional(),
    oldPriceSelector: z.string().nullable().optional(),
    availabilitySelector: z.string().nullable().optional(),
    imageSelector: z.string().nullable().optional(),
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

const DEFAULT_PER_DOMAIN_DELAY_MS = 1_000;

const app = Fastify({ logger: false });
const fixtureFiller = '<p>Local fixture copy for offline scraping validation, selector testing, alert checks, dashboard refresh checks, and export generation checks.</p>'.repeat(10);

app.addHook('onRequest', async (req, reply) => {
  if (req.url === '/health' || req.url === '/robots.txt' || req.url.startsWith('/fixtures/')) return;
  const auth = req.headers.authorization ?? '';
  if (!SECRET || auth !== `Bearer ${SECRET}`) {
    reply.code(401);
    return reply.send({ ok: false, errorCode: 'http_error', message: 'unauthorized' });
  }
});

app.get('/health', async () => ({
  ok: true,
  mode: process.env.LOCAL_DEV_MODE === 'true' ? 'local' : 'standard',
  ts: new Date().toISOString(),
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
          ? await fetchHtmlBrowser(url, userAgent, timeoutMs ?? 30_000)
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
          const pw = await fetchHtmlBrowser(url, userAgent, timeoutMs ?? 30_000);
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
      },
      raw: { htmlSnippet: fetched.html.slice(0, 4_000) },
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

const shutdown = async () => {
  logger.info('shutting down');
  try {
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
  .then((addr) => logger.info({ addr }, 'worker listening'))
  .catch((err) => {
    logger.error(err);
    process.exit(1);
  });
