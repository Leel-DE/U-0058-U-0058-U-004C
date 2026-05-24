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

app.addHook('onRequest', async (req, reply) => {
  if (req.url === '/health') return;
  const auth = req.headers.authorization ?? '';
  if (!SECRET || auth !== `Bearer ${SECRET}`) {
    reply.code(401);
    return reply.send({ ok: false, errorCode: 'http_error', message: 'unauthorized' });
  }
});

app.get('/health', async () => ({ ok: true, ts: new Date().toISOString() }));

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
  .listen({ port: PORT, host: '0.0.0.0' })
  .then((addr) => logger.info({ addr }, 'worker listening'))
  .catch((err) => {
    logger.error(err);
    process.exit(1);
  });
