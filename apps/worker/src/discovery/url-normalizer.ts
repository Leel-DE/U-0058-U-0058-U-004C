const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid',
  'msclkid',
  'yclid',
  'pk_campaign',
  'pk_kwd',
]);

const BINARY_EXTENSIONS = /\.(?:pdf|jpg|jpeg|png|gif|webp|avif|svg|zip|rar|7z|mp4|mp3|webm|woff2?|ttf|ico)(?:$|\?)/i;
const BLOCKED_PATHS = /\/(?:account|konto|login|signin|register|cart|warenkorb|checkout|kasse|wishlist|compare|search|suche)(?:\/|$|\?)/i;

export interface NormalizeOptions {
  baseUrl?: string;
  rootUrl: string;
  domainAllowlist?: string[];
  includePatterns?: string[];
  excludePatterns?: string[];
  allowXml?: boolean;
  allowSearch?: boolean;
}

function matchesAny(value: string, patterns: string[] | undefined) {
  return Boolean(patterns?.some((pattern) => value.includes(pattern)));
}

export function normalizeUrl(input: string | undefined | null, options: NormalizeOptions): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed || /^(?:mailto|tel|javascript|data):/i.test(trimmed)) return null;
  let url: URL;
  try {
    url = new URL(trimmed, options.baseUrl ?? options.rootUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const root = new URL(options.rootUrl);
  const allowlist = new Set([root.hostname, ...(options.domainAllowlist ?? []).map((item) => item.replace(/^https?:\/\//, '').replace(/\/.*$/, ''))]);
  if (!allowlist.has(url.hostname)) return null;
  if (BINARY_EXTENSIONS.test(url.pathname) && !(options.allowXml && /\.xml(?:\.gz)?$/i.test(url.pathname))) return null;
  if (!options.allowSearch && BLOCKED_PATHS.test(url.pathname)) return null;
  if (matchesAny(url.href, options.excludePatterns)) return null;
  if (options.includePatterns?.length && !matchesAny(url.href, options.includePatterns)) return null;

  url.hash = '';
  const entries = [...url.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAMS.has(key.toLowerCase()))
    .sort(([a], [b]) => a.localeCompare(b));
  url.search = '';
  const seen = new Set<string>();
  for (const [key, value] of entries) {
    const dedupeKey = `${key}=${value}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    url.searchParams.append(key, value);
  }
  url.pathname = url.pathname.replace(/\/{2,}/g, '/');
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/$/, '');
  return url.toString();
}

export function isLikelyCategoryUrl(url: string): boolean {
  const path = new URL(url).pathname.toLowerCase();
  return /\/(?:category|collections|collection|shop|c|kategorie|produkt-kategorie|bikes|e-bikes|ebikes|parts|zubehoer|zubehör|sale|marken)(?:\/|$)/i.test(path);
}

export function isLikelyProductUrl(url: string): boolean {
  const path = new URL(url).pathname.toLowerCase();
  if (isLikelyCategoryUrl(url)) return false;
  return /\/(?:product|products|produkt|p|artikel|item)(?:\/|$)|-[a-z0-9]*\d{5,}(?:$|\/)/i.test(path);
}

export function urlDepth(url: string): number {
  return new URL(url).pathname.split('/').filter(Boolean).length;
}

