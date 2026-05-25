const SEARCH_TEMPLATES: Record<string, string> = {
  amazon: 'https://{domain}/s?k={q}',
  shopify: 'https://{domain}/search?q={q}',
  woocommerce: 'https://{domain}/?s={q}&post_type=product',
  magento: 'https://{domain}/catalogsearch/result/?q={q}',
  prestashop: 'https://{domain}/index.php?controller=search&s={q}',
  tilda: 'https://{domain}/search/?q={q}',
  default: 'https://{domain}/search?q={q}',
};

const DOMAIN_HINTS: Record<string, keyof typeof SEARCH_TEMPLATES> = {
  amazon: 'amazon',
  ebay: 'default',
  shopify: 'shopify',
  myshopify: 'shopify',
  woocommerce: 'woocommerce',
};

export interface SearchUrlContext {
  domain: string;
  framework?: string | null;
  discoveryPreset?: string | null;
}

export function buildStoreSearchUrl(query: string, ctx: SearchUrlContext): string {
  const domain = stripProtocol(ctx.domain);
  const q = encodeURIComponent(query.trim().slice(0, 240));
  const framework = (ctx.framework ?? ctx.discoveryPreset ?? '').toLowerCase();
  const defaultTemplate = SEARCH_TEMPLATES.default ?? 'https://{domain}/search?q={q}';
  let template = defaultTemplate;
  if (framework && SEARCH_TEMPLATES[framework]) {
    template = SEARCH_TEMPLATES[framework] ?? defaultTemplate;
  } else {
    for (const [hint, key] of Object.entries(DOMAIN_HINTS)) {
      if (domain.includes(hint)) {
        template = SEARCH_TEMPLATES[key] ?? defaultTemplate;
        break;
      }
    }
  }
  return template.replace('{domain}', domain).replace('{q}', q);
}

export function buildSearchUrlCandidates(query: string, domain: string): string[] {
  const cleanDomain = stripProtocol(domain);
  const q = encodeURIComponent(query.trim().slice(0, 240));
  return [
    `https://${cleanDomain}/search?q=${q}`,
    `https://${cleanDomain}/?s=${q}&post_type=product`,
    `https://${cleanDomain}/?s=${q}`,
    `https://${cleanDomain}/catalogsearch/result/?q=${q}`,
    `https://${cleanDomain}/search/?q=${q}`,
    `https://${cleanDomain}/search?query=${q}`,
  ];
}

function stripProtocol(input: string): string {
  return input.replace(/^https?:\/\//, '').replace(/\/$/, '');
}
