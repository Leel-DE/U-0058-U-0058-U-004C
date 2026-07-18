import * as cheerio from 'cheerio';
import type { AIProvider } from '../ai/providers/index.js';
import { classifyResponse } from '../detect/block.js';
import {
  detectBaseSelectorsFromPages,
  findFirstProductUrl,
  type BaseCategorySelectors,
  type BaseProductSelectors,
  type BaseSelectorDetectionResult,
  type DetectionPage,
} from '../detect/base-selectors.js';
import { fetchHtml } from '../fetcher/cheerio.js';
import { fetchHtmlBrowser } from '../fetcher/playwright.js';
import { checkRobots } from '../robots/check.js';
import { detectCurrency } from '../util/normalize.js';
import { detectFramework, type FrameworkDetection } from './framework-detector.js';
import { classifyDiscoveryPage, pageTitleAndH1 } from './page-classifier.js';
import { detectProductCards } from './product-card-detector.js';
import { detectRenderingStrategy, type RenderingStrategyDetection, type ScrapingMode } from './rendering-strategy-detector.js';
import { generateScrapeProfile, type CrawlPreset, type Difficulty, type ScrapeProfile } from './scrape-profile-generator.js';
import { detectSpaShell } from './spa-shell-detector.js';
import { loadSitemapUrls } from './sitemap-parser.js';
import { isLikelyCategoryUrl, isLikelyProductUrl, normalizeUrl } from './url-normalizer.js';

export interface StoreAnalysisInput {
  homepageUrl: string;
  useAi: boolean;
  respectRobots?: boolean;
  userAgent: string;
  timeoutMs?: number;
  aiProvider?: AIProvider | null;
}

export interface AnalyzedStoreMetadata {
  name: string;
  domain: string;
  homepageUrl: string;
  countryCode: string;
  currency: string;
  language?: string;
}

export interface RecommendedStoreSettings {
  crawlPreset: CrawlPreset;
  crawlFrequencyMinutes: number;
  crawlDelaySeconds: number;
  respectRobots: boolean;
  jsRequired: boolean;
  useManualCaptcha: boolean;
  useAi: boolean;
  discoveryPreset: 'quick' | 'normal' | 'deep' | 'full';
  discoveryDefaultsJson: {
    maxPages: number;
    maxProducts: number;
    crawlDepth: number;
    maxPagesPerCategory: number;
    maxScrollIterations: number;
    concurrency: number;
    respectRobotsTxt: boolean;
    useAi: boolean;
    useManualCaptcha: boolean;
  };
}

export interface StoreAnalysisResult {
  store: AnalyzedStoreMetadata;
  framework: FrameworkDetection;
  renderingStrategy: RenderingStrategyDetection;
  scrapingMode: ScrapingMode;
  selectors: {
    productSelectors: BaseProductSelectors;
    categorySelectors: BaseCategorySelectors;
  };
  previews: BaseSelectorDetectionResult['preview'];
  validation: BaseSelectorDetectionResult['validation'];
  examples: {
    productPageUrl?: string;
    categoryPageUrl?: string;
    listingPageUrls: string[];
    productPageUrls: string[];
    sitemapUrls: string[];
  };
  scrapingProfile: ScrapeProfile;
  warnings: string[];
  confidence: number;
  recommendedSettings: RecommendedStoreSettings;
  logs: Array<{ level: 'info' | 'warn'; message: string; context?: Record<string, unknown> }>;
}

interface StoreAnalysisPagesInput {
  homepageUrl: string;
  homepagePage: DetectionPage;
  categoryPage?: DetectionPage;
  productPage?: DetectionPage;
  sitemapUrls?: string[];
  listingPageUrls?: string[];
  productPageUrls?: string[];
  robotsStatus?: string;
  useAi: boolean;
  respectRobots: boolean;
  aiProvider?: AIProvider | null;
  warnings?: string[];
  logs?: StoreAnalysisResult['logs'];
}

const COUNTRY_BY_TLD: Record<string, string> = {
  de: 'DE',
  uk: 'GB',
  fr: 'FR',
  es: 'ES',
  it: 'IT',
  nl: 'NL',
  pl: 'PL',
  at: 'AT',
  ch: 'CH',
  ua: 'UA',
  us: 'US',
};

const COUNTRY_BY_LANG: Record<string, string> = {
  de: 'DE',
  en: 'US',
  fr: 'FR',
  es: 'ES',
  it: 'IT',
  nl: 'NL',
  pl: 'PL',
  uk: 'UA',
  ua: 'UA',
};

function round2(value: number) {
  return Number(value.toFixed(2));
}

function hostFromUrl(url: string) {
  return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
}

function rootUrl(url: string) {
  const u = new URL(url);
  return `${u.protocol}//${u.host}`;
}

function text($: cheerio.CheerioAPI, selector: string) {
  return $(selector).first().text().replace(/\s+/g, ' ').trim() || undefined;
}

function attr($: cheerio.CheerioAPI, selector: string, name: string) {
  return $(selector).first().attr(name)?.replace(/\s+/g, ' ').trim() || undefined;
}

function cleanStoreName(raw: string | undefined, domain: string) {
  const domainLabel = domain.split('.')[0] ?? domain;
  const fallback = domainLabel.replace(/[-_]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
  const value = raw
    ?.replace(/\s+/g, ' ')
    .replace(/\s+(?:[|–—-])\s+.*$/, '')
    .replace(/^(welcome to|shop at)\s+/i, '')
    .trim();
  if (!value || value.length < 2 || value.length > 80) return fallback.toUpperCase();
  if (/^(?:online\s+)?(?:shop|store|magazin|магазин)(?:\s|$)/i.test(value)) return fallback;
  return value;
}

function detectLanguage($: cheerio.CheerioAPI) {
  const htmlLang = $('html').attr('lang')?.trim();
  const ogLocale = $('meta[property="og:locale"]').attr('content')?.trim();
  return (htmlLang || ogLocale)?.split(/[_.-]/)[0]?.toLowerCase();
}

function guessCountry(domain: string, language?: string) {
  const tld = domain.split('.').at(-1)?.toLowerCase();
  return (tld && COUNTRY_BY_TLD[tld]) || (language && COUNTRY_BY_LANG[language]) || 'DE';
}

function guessCurrency(html: string, selectorDetection?: BaseSelectorDetectionResult) {
  const product = selectorDetection?.preview.product;
  const cardCurrency = selectorDetection?.preview.category?.cards.find((card) => card.currency)?.currency;
  const explicit = product?.currency ?? cardCurrency;
  const detected = explicit ?? detectCurrency(html.slice(0, 250_000)) ?? 'EUR';
  return ['EUR', 'USD', 'GBP', 'UAH'].includes(detected) ? detected : 'EUR';
}

function deriveStoreMetadata(homepageUrl: string, homepageHtml: string, selectorDetection?: BaseSelectorDetectionResult): AnalyzedStoreMetadata {
  const $ = cheerio.load(homepageHtml);
  const domain = hostFromUrl(homepageUrl);
  const language = detectLanguage($);
  const title = pageTitleAndH1(homepageHtml);
  const rawName =
    attr($, 'meta[property="og:site_name"]', 'content') ??
    attr($, 'meta[name="application-name"]', 'content') ??
    title.h1 ??
    title.title;
  return {
    name: cleanStoreName(rawName, domain),
    domain,
    homepageUrl,
    countryCode: guessCountry(domain, language),
    currency: guessCurrency(homepageHtml, selectorDetection),
    language,
  };
}

function candidateUrlsFromHomepage(homepageUrl: string, html: string) {
  const $ = cheerio.load(html);
  const root = rootUrl(homepageUrl);
  const urls = $('a[href]')
    .toArray()
    .map((node) => normalizeUrl($(node).attr('href'), { rootUrl: root, baseUrl: homepageUrl, allowSearch: true }))
    .filter((url): url is string => Boolean(url));
  const uniqueUrls = [...new Set(urls)];
  return {
    listingPageUrls: uniqueUrls.filter(isLikelyCategoryUrl).slice(0, 20),
    productPageUrls: uniqueUrls.filter(isLikelyProductUrl).slice(0, 20),
  };
}

function rankCandidateUrls(urls: string[], kind: 'category' | 'product') {
  return [...new Set(urls)]
    .map((url) => {
      const path = new URL(url).pathname.toLowerCase();
      let score = 0;
      if (kind === 'category' && isLikelyCategoryUrl(url)) score += 10;
      if (kind === 'product' && isLikelyProductUrl(url)) score += 10;
      if (/\/(?:sale|shop|category|collections|produkte|produkt-kategorie|kategorie)\b/i.test(path)) score += 3;
      if (/\d{5,}/.test(path)) score += kind === 'product' ? 4 : -2;
      score -= Math.min(5, path.split('/').filter(Boolean).length);
      return { url, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((item) => item.url);
}

async function fetchAnalysisPage(
  url: string,
  userAgent: string,
  timeoutMs: number,
  strategy: 'auto' | 'cheerio' | 'playwright',
): Promise<DetectionPage | null> {
  const fetched =
    strategy === 'playwright'
      ? await fetchHtmlBrowser(url, userAgent, timeoutMs)
      : await fetchHtml(url, userAgent, Math.min(timeoutMs, 20_000));
  let cls = classifyResponse(fetched.status, fetched.html);
  let html = fetched.html;
  let finalUrl = fetched.finalUrl || url;

  if ((strategy === 'auto' && (!cls.ok || detectSpaShell(html).likely)) || strategy === 'playwright') {
    const spa = detectSpaShell(html);
    const pw = await fetchHtmlBrowser(url, userAgent, timeoutMs, {
      waitForChildrenIn: spa.emptyContainerSelector,
      scrollToBottom: spa.likely,
    });
    cls = classifyResponse(pw.status, pw.html);
    html = pw.html;
    finalUrl = pw.finalUrl || url;
  }

  if (!cls.ok) return null;
  return { url: finalUrl, html };
}

async function firstMatchingPage(
  urls: string[],
  kind: 'category' | 'product',
  userAgent: string,
  timeoutMs: number,
  rendering?: RenderingStrategyDetection,
): Promise<DetectionPage | undefined> {
  const mode = rendering?.scrapingMode === 'playwright_primary' ? 'playwright' : 'auto';
  for (const url of urls.slice(0, 5)) {
    const page = await fetchAnalysisPage(url, userAgent, timeoutMs, mode).catch(() => null);
    if (!page) continue;
    const classification = classifyDiscoveryPage(page.url, page.html);
    if (classification.pageType === kind) return page;
    if (kind === 'category' && detectProductCards(page.html, { pageUrl: page.url }).cards.length >= 2) return page;
    if (kind === 'product' && classification.signals.some((signal) => signal.includes('product'))) return page;
  }
  return undefined;
}

function recommendedSettings(profile: ScrapeProfile, rendering: RenderingStrategyDetection, respectRobots: boolean, useAi: boolean): RecommendedStoreSettings {
  const heavy = profile.crawlPreset === 'heavy_discovery';
  const safe = profile.crawlPreset === 'safe';
  const deep = profile.crawlDifficulty === 'high';
  return {
    crawlPreset: profile.crawlPreset,
    crawlFrequencyMinutes: safe ? 1440 : 720,
    crawlDelaySeconds: profile.recommendedDelaySeconds,
    respectRobots,
    jsRequired: rendering.scrapingMode === 'playwright_primary',
    // Manual CAPTCHA solving is opt-in — default it off even for higher-risk
    // stores. Operators can still enable it per store/run in the UI.
    useManualCaptcha: false,
    useAi,
    discoveryPreset: heavy ? 'full' : deep ? 'deep' : 'normal',
    discoveryDefaultsJson: {
      maxPages: heavy ? 1000 : deep ? 500 : 250,
      maxProducts: heavy ? 5000 : deep ? 2500 : 1000,
      crawlDepth: heavy ? 6 : deep ? 5 : 4,
      maxPagesPerCategory: heavy ? 50 : deep ? 30 : 20,
      maxScrollIterations: rendering.strategy === 'spa' || rendering.strategy === 'js_heavy' ? 15 : 8,
      concurrency: safe ? 1 : 2,
      respectRobotsTxt: respectRobots,
      useAi,
      useManualCaptcha: false,
    },
  };
}

function confidenceScore(
  framework: FrameworkDetection,
  rendering: RenderingStrategyDetection,
  selectorDetection: BaseSelectorDetectionResult,
  categoryPage?: DetectionPage,
  productPage?: DetectionPage,
) {
  let score = 0.18;
  score += framework.confidence * 0.12;
  score += rendering.confidence * 0.16;
  score += selectorDetection.confidence.overall * 0.42;
  if (categoryPage) score += 0.07;
  if (productPage) score += 0.05;
  return round2(Math.min(0.99, score));
}

export async function analyzeStoreFromPages(input: StoreAnalysisPagesInput): Promise<StoreAnalysisResult> {
  const warnings = [...(input.warnings ?? [])];
  const logs = [...(input.logs ?? [])];
  const categoryPage = input.categoryPage ?? input.homepagePage;
  const productPage = input.productPage;
  const framework = detectFramework(input.homepagePage.html);
  const renderingStrategy = detectRenderingStrategy(categoryPage.html, categoryPage.url, framework);

  const selectorDetection = await detectBaseSelectorsFromPages({
    homepageUrl: input.homepageUrl,
    productPage,
    categoryPage,
    useAi: input.useAi,
    aiProvider: input.useAi ? input.aiProvider : null,
  });

  const store = deriveStoreMetadata(input.homepageUrl, input.homepagePage.html, selectorDetection);
  const profile = generateScrapeProfile({
    framework,
    rendering: renderingStrategy,
    robotsStatus: input.robotsStatus,
    selectorConfidence: selectorDetection.confidence.overall,
    warnings: [...warnings, ...selectorDetection.warnings],
    html: `${input.homepagePage.html}\n${categoryPage.html.slice(0, 150_000)}`,
  });
  const confidence = confidenceScore(framework, renderingStrategy, selectorDetection, input.categoryPage, input.productPage);

  return {
    store,
    framework,
    renderingStrategy,
    scrapingMode: renderingStrategy.scrapingMode,
    selectors: {
      productSelectors: selectorDetection.productSelectors,
      categorySelectors: selectorDetection.categorySelectors,
    },
    previews: selectorDetection.preview,
    validation: selectorDetection.validation,
    examples: {
      productPageUrl: productPage?.url,
      categoryPageUrl: categoryPage.url,
      listingPageUrls: input.listingPageUrls ?? [],
      productPageUrls: input.productPageUrls ?? [],
      sitemapUrls: input.sitemapUrls ?? [],
    },
    scrapingProfile: profile,
    warnings: [...warnings, ...selectorDetection.warnings],
    confidence,
    recommendedSettings: recommendedSettings(profile, renderingStrategy, input.respectRobots, input.useAi),
    logs: [
      ...logs,
      { level: 'info', message: 'framework detected', context: { framework: framework.framework, confidence: framework.confidence } },
      {
        level: 'info',
        message: 'rendering strategy detected',
        context: { strategy: renderingStrategy.strategy, mode: renderingStrategy.scrapingMode },
      },
      ...selectorDetection.logs,
    ],
  };
}

export async function analyzeStore(input: StoreAnalysisInput): Promise<StoreAnalysisResult> {
  const homepageUrl = new URL(input.homepageUrl).toString();
  const userAgent = input.userAgent;
  const timeoutMs = input.timeoutMs ?? 45_000;
  const respectRobots = input.respectRobots ?? true;
  const warnings: string[] = [];
  const logs: StoreAnalysisResult['logs'] = [];

  const robots = respectRobots ? await checkRobots(homepageUrl, userAgent) : { allowed: true, status: 'disabled' };
  logs.push({ level: 'info', message: 'robots.txt checked', context: { status: robots.status, allowed: robots.allowed } });
  if (!robots.allowed) warnings.push(`robots.txt disallows ${homepageUrl}`);

  const homepagePage = await fetchAnalysisPage(homepageUrl, userAgent, timeoutMs, 'auto');
  if (!homepagePage) {
    throw new Error('Homepage could not be fetched or looked like a blocking/captcha page.');
  }

  const framework = detectFramework(homepagePage.html);
  const homepageRendering = detectRenderingStrategy(homepagePage.html, homepagePage.url, framework);
  const homepageCandidates = candidateUrlsFromHomepage(homepagePage.url, homepagePage.html);
  let sitemapUrls: string[] = [];
  let sitemapEntries: string[] = [];
  try {
    const sitemap = await loadSitemapUrls(homepagePage.url, userAgent, 1200);
    sitemapUrls = sitemap.sitemaps;
    sitemapEntries = sitemap.urls;
    logs.push({ level: 'info', message: 'sitemap URLs loaded', context: { urls: sitemap.urls.length, sitemaps: sitemap.sitemaps.length } });
  } catch (err) {
    warnings.push(`Sitemap discovery failed: ${(err as Error).message}`);
  }

  const listingPageUrls = rankCandidateUrls(
    [...homepageCandidates.listingPageUrls, ...sitemapEntries.filter(isLikelyCategoryUrl)],
    'category',
  ).slice(0, 20);
  const productPageUrls = rankCandidateUrls(
    [...homepageCandidates.productPageUrls, ...sitemapEntries.filter(isLikelyProductUrl)],
    'product',
  ).slice(0, 20);

  let categoryPage = await firstMatchingPage(listingPageUrls, 'category', userAgent, timeoutMs, homepageRendering);
  if (!categoryPage && detectProductCards(homepagePage.html, { pageUrl: homepagePage.url }).cards.length >= 2) {
    categoryPage = homepagePage;
  }

  let productPage = await firstMatchingPage(productPageUrls, 'product', userAgent, timeoutMs, homepageRendering);
  if (!productPage && categoryPage) {
    const productUrl = findFirstProductUrl(categoryPage.html, categoryPage.url);
    if (productUrl) productPage = await fetchAnalysisPage(productUrl, userAgent, timeoutMs, homepageRendering.scrapingMode === 'playwright_primary' ? 'playwright' : 'auto') ?? undefined;
  }

  if (!categoryPage && !productPage) {
    warnings.push('No category or product example page was detected. Selector detection will use the homepage only.');
  }

  return analyzeStoreFromPages({
    homepageUrl,
    homepagePage,
    categoryPage,
    productPage,
    sitemapUrls,
    listingPageUrls,
    productPageUrls,
    robotsStatus: robots.status,
    useAi: input.useAi,
    respectRobots,
    aiProvider: input.aiProvider,
    warnings,
    logs,
  });
}
