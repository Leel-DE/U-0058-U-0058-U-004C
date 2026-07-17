import { competitorDiscoveryPayloadSchema, competitorScrapePayloadSchema } from '@cr/shared';
import { classifyResponse } from '../detect/block.js';
import { extract } from '../parser/cascade.js';
import { checkRobots } from '../robots/check.js';
import type { BrowserJobHandler } from './types.js';
import { PagePreparationService } from './page-handlers.js';
import { assertPublicHttpUrl } from './url-policy.js';
import { createAutomationClient } from './job-lease-manager.js';

const preparation = new PagePreparationService();

interface ProductRow {
  id: string;
  org_id: string;
  store_id: string;
  url: string;
}

interface StoreRow {
  id: string;
  org_id: string;
  name: string;
  domain: string;
  currency: string;
  respect_robots: boolean;
  crawl_frequency_minutes: number;
}

interface RulesRow {
  title_selector: string | null;
  price_selector: string | null;
  old_price_selector: string | null;
  availability_selector: string | null;
  image_selector: string | null;
  brand_selector: string | null;
  sku_selector: string | null;
  breadcrumbs_selector: string | null;
  shipping_selector: string | null;
  rating_selector: string | null;
  price_regex: string | null;
  use_json_ld: boolean;
  use_open_graph: boolean;
}

export function createCompetitorScrapeHandler(): BrowserJobHandler {
  return async ({ job, browserContext, log, heartbeat }) => {
    const payload = competitorScrapePayloadSchema.parse(job.payload);
    const client = createAutomationClient();
    const { data: product, error: productError } = await client
      .from('competitor_products')
      .select('id, org_id, store_id, url')
      .eq('id', payload.competitorProductId)
      .eq('org_id', job.orgId)
      .single<ProductRow>();
    if (productError || !product) throw new Error('competitor_product_not_found');
    const [{ data: store, error: storeError }, { data: ruleData, error: ruleError }] =
      await Promise.all([
        client
          .from('stores')
          .select('id, org_id, name, domain, currency, respect_robots, crawl_frequency_minutes')
          .eq('id', product.store_id)
          .eq('org_id', job.orgId)
          .single<StoreRow>(),
        client
          .from('scraping_rules')
          .select('*')
          .eq('store_id', product.store_id)
          .maybeSingle<RulesRow>(),
      ]);
    if (storeError || !store) throw new Error('store_not_found');
    if (ruleError) throw ruleError;
    const target = await assertPublicHttpUrl(product.url);
    if (store.respect_robots) {
      const robots = await checkRobots(target.toString(), 'AutomationHub/1.0');
      if (!robots.allowed) throw new Error('skipped_robots');
    }
    await heartbeat({ progress: 10 });
    const page = await browserContext.newPage();
    const startedAt = Date.now();
    try {
      const response = await page.goto(target.toString(), {
        waitUntil: 'domcontentloaded',
        timeout: 45_000,
      });
      const prepared = await preparation.prepare(page);
      if (prepared.captchaDetected)
        return {
          status: 'awaiting_user',
          result: { resultVersion: 1, reason: 'captcha', productId: product.id },
        };
      const html = await page.content();
      const classification = classifyResponse(response?.status() ?? 0, html);
      if (!classification.ok) throw new Error(classification.code);
      const parsed = extract(html, {
        titleSelector: ruleData?.title_selector,
        priceSelector: ruleData?.price_selector,
        oldPriceSelector: ruleData?.old_price_selector,
        availabilitySelector: ruleData?.availability_selector,
        imageSelector: ruleData?.image_selector,
        brandSelector: ruleData?.brand_selector,
        skuSelector: ruleData?.sku_selector,
        breadcrumbsSelector: ruleData?.breadcrumbs_selector,
        shippingSelector: ruleData?.shipping_selector,
        ratingSelector: ruleData?.rating_selector,
        priceRegex: ruleData?.price_regex,
        useJsonLd: ruleData?.use_json_ld ?? true,
        useOpenGraph: ruleData?.use_open_graph ?? true,
      });
      if (!parsed) throw new Error('parse_failed');
      await heartbeat({ progress: 80 });
      const { error: insertError } = await client.from('price_snapshots').insert({
        org_id: job.orgId,
        competitor_product_id: product.id,
        scraped_at: new Date().toISOString(),
        price: parsed.price ?? null,
        old_price: parsed.oldPrice ?? null,
        currency: parsed.currency ?? store.currency,
        availability: parsed.availability ?? 'unknown',
        shipping_text: parsed.shipping ?? null,
        rating: parsed.rating ?? null,
        title: parsed.title ?? null,
        image_url: parsed.image ?? null,
        status: 'ok',
        confidence: parsed.confidence,
        source: 'playwright',
        source_path: parsed.sourcePath,
        http_status: response?.status() ?? null,
        duration_ms: Date.now() - startedAt,
        scrape_run_id: payload.scrapeRunId ?? null,
      });
      if (insertError) throw insertError;
      const { error: updateError } = await client
        .from('competitor_products')
        .update({
          last_scraped_at: new Date().toISOString(),
          last_snapshot_price: parsed.price ?? null,
          last_snapshot_currency: parsed.currency ?? store.currency,
          last_snapshot_availability: parsed.availability ?? 'unknown',
          next_run_at: new Date(Date.now() + store.crawl_frequency_minutes * 60_000).toISOString(),
        })
        .eq('id', product.id)
        .eq('org_id', job.orgId);
      if (updateError) throw updateError;
      await log({
        level: 'info',
        event: 'competitor_scraped',
        message: `${store.name}: данные товара обновлены`,
        progress: 100,
      });
      return {
        status: 'succeeded',
        result: {
          resultVersion: 1,
          productId: product.id,
          price: parsed.price,
          currency: parsed.currency,
          confidence: parsed.confidence,
        },
      };
    } finally {
      await page.close().catch(() => undefined);
    }
  };
}

export function createCompetitorDiscoveryHandler(): BrowserJobHandler {
  return async ({ job, browserContext, log }) => {
    const payload = competitorDiscoveryPayloadSchema.parse(job.payload);
    const client = createAutomationClient();
    const { data: store, error } = await client
      .from('stores')
      .select('id, org_id, name, domain, currency, respect_robots, crawl_frequency_minutes')
      .eq('id', payload.storeId)
      .eq('org_id', job.orgId)
      .single<StoreRow>();
    if (error || !store) throw new Error('store_not_found');
    const target = await assertPublicHttpUrl(`https://${store.domain}`);
    const page = await browserContext.newPage();
    try {
      const response = await page.goto(target.toString(), {
        waitUntil: 'domcontentloaded',
        timeout: 45_000,
      });
      const prepared = await preparation.prepare(page);
      if (prepared.captchaDetected)
        return {
          status: 'awaiting_user',
          result: { resultVersion: 1, reason: 'captcha', storeId: store.id },
        };
      const title = await page.title();
      const links = await page
        .locator('a[href]')
        .evaluateAll((nodes) =>
          nodes.slice(0, 500).map((node) => (node as HTMLAnchorElement).href),
        );
      const productCandidates = links
        .filter((href) => /product|products|artikel|item|shop/i.test(href))
        .slice(0, 100);
      await log({
        level: 'info',
        event: 'discovery_completed',
        message: `${store.name}: найдено ${productCandidates.length} кандидатов`,
        progress: 100,
      });
      return {
        status: response?.ok() ? 'succeeded' : 'partial',
        result: { resultVersion: 1, storeId: store.id, title, productCandidates },
      };
    } finally {
      await page.close().catch(() => undefined);
    }
  };
}
