'use server';

import { and, eq } from 'drizzle-orm';
import { schemas, USER_AGENT } from '@cr/shared';
import type { ScrapeResponse } from '@cr/shared';
import { db, schema } from '@/lib/db';
import { defineAction } from '@/lib/action';
import { serverEnv } from '@/lib/env';

/**
 * Invoke the worker synchronously for one URL and return the extracted
 * payload (or an error code) — used by the selector tester UI.
 */
export const testScrapeUrl = defineAction(
  schemas.testScrapeSchema,
  async (input, ctx): Promise<ScrapeResponse> => {
    const env = serverEnv();
    const rows = await db()
      .select({
        store: schema.stores,
        rules: schema.scrapingRules,
      })
      .from(schema.stores)
      .leftJoin(schema.scrapingRules, eq(schema.scrapingRules.storeId, schema.stores.id))
      .where(and(eq(schema.stores.id, input.storeId), eq(schema.stores.orgId, ctx.orgId)))
      .limit(1);

    const row = rows[0];
    if (!row) throw new Error('Store not found');
    const { store, rules } = row;

    const payload = {
      url: input.url,
      strategy: store.jsRequired ? ('playwright' as const) : ('cheerio' as const),
      rules: {
        titleSelector: rules?.titleSelector ?? null,
        priceSelector: rules?.priceSelector ?? null,
        oldPriceSelector: rules?.oldPriceSelector ?? null,
        availabilitySelector: rules?.availabilitySelector ?? null,
        imageSelector: rules?.imageSelector ?? null,
        shippingSelector: rules?.shippingSelector ?? null,
        ratingSelector: rules?.ratingSelector ?? null,
        priceRegex: rules?.priceRegex ?? null,
        useJsonLd: rules?.useJsonLd ?? true,
        useOpenGraph: rules?.useOpenGraph ?? true,
      },
      respectRobots: store.respectRobots,
      userAgent: USER_AGENT,
      timeoutMs: 20_000,
    };

    const res = await fetch(`${env.WORKER_URL}/scrape`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.WORKER_SHARED_SECRET}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(25_000),
    });

    const json = (await res.json()) as ScrapeResponse;
    return json;
  },
  { roles: ['owner', 'manager'] },
);
