import * as cheerio from 'cheerio';

export type StoreFramework =
  | 'shopify'
  | 'woocommerce'
  | 'magento'
  | 'shopware'
  | 'nextjs'
  | 'nuxt'
  | 'tilda'
  | 'custom';

export interface FrameworkDetection {
  framework: StoreFramework;
  label: string;
  confidence: number;
  signals: string[];
}

const LABELS: Record<StoreFramework, string> = {
  shopify: 'Shopify',
  woocommerce: 'WooCommerce',
  magento: 'Magento',
  shopware: 'Shopware',
  nextjs: 'Next.js',
  nuxt: 'Nuxt',
  tilda: 'Tilda',
  custom: 'Custom',
};

type FrameworkScore = {
  framework: StoreFramework;
  score: number;
  signals: string[];
};

function add(scores: Map<StoreFramework, FrameworkScore>, framework: StoreFramework, score: number, signal: string) {
  const current = scores.get(framework) ?? { framework, score: 0, signals: [] };
  current.score += score;
  current.signals.push(signal);
  scores.set(framework, current);
}

export function detectFramework(html: string): FrameworkDetection {
  const $ = cheerio.load(html);
  const haystack = html.slice(0, 500_000);
  const scores = new Map<StoreFramework, FrameworkScore>();

  const scriptSrcs = $('script[src]')
    .toArray()
    .map((node) => $(node).attr('src') ?? '')
    .join('\n');
  const links = $('link[href]')
    .toArray()
    .map((node) => $(node).attr('href') ?? '')
    .join('\n');
  const attrs = `${scriptSrcs}\n${links}\n${haystack}`;

  if (/cdn\.shopify\.com|Shopify\.theme|ShopifyAnalytics|\/cart\.js|myshopify\.com/i.test(attrs)) {
    add(scores, 'shopify', 0.78, 'shopify_asset_or_global');
  }
  if (/wp-content\/plugins\/woocommerce|woocommerce|wc-cart-fragments|woocommerce_params/i.test(attrs)) {
    add(scores, 'woocommerce', 0.78, 'woocommerce_asset_or_global');
  }
  if (/Magento_|mage\/|text\/x-magento-init|\/static\/version\d+\/frontend\//i.test(attrs)) {
    add(scores, 'magento', 0.78, 'magento_asset_or_init');
  }
  if (/Shopware|shopware|data-product-information|sw-.*?listing|cms-element-product/i.test(attrs)) {
    add(scores, 'shopware', 0.78, 'shopware_signature');
  }
  if ($('script#__NEXT_DATA__').length || /\/_next\/static\/|self\.__next_f|next-router/i.test(attrs)) {
    add(scores, 'nextjs', 0.72, 'next_payload_or_assets');
  }
  if (/window\.__NUXT__|\/_nuxt\/|data-n-head|nuxt/i.test(attrs)) {
    add(scores, 'nuxt', 0.72, 'nuxt_payload_or_assets');
  }
  if (/tildacdn\.(?:com|net|one)|tilda-blocks|window\.tilda|t-store|js-store-product/i.test(attrs)) {
    add(scores, 'tilda', 0.9, 'tilda_store_signature');
  }

  if ($('[data-product-id], [data-sku], [itemtype*="Product" i]').length >= 3) {
    add(scores, 'custom', 0.18, 'generic_product_markup');
  }

  const best = [...scores.values()].sort((a, b) => b.score - a.score)[0];
  if (!best || best.score < 0.25) {
    return { framework: 'custom', label: LABELS.custom, confidence: 0.35, signals: ['no_known_framework_signature'] };
  }

  return {
    framework: best.framework,
    label: LABELS[best.framework],
    confidence: Number(Math.min(0.98, best.score).toFixed(2)),
    signals: best.signals,
  };
}
