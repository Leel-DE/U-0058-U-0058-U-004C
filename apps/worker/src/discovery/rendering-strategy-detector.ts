import * as cheerio from 'cheerio';
import { detectProductCards } from './product-card-detector.js';
import { detectSpaShell } from './spa-shell-detector.js';
import type { FrameworkDetection } from './framework-detector.js';

export type RenderingStrategy = 'static_html' | 'hybrid' | 'js_heavy' | 'spa';
export type ScrapingMode = 'cheerio' | 'playwright_fallback' | 'playwright_primary' | 'hybrid';

export interface RenderingStrategyDetection {
  strategy: RenderingStrategy;
  scrapingMode: ScrapingMode;
  hydration: 'none' | 'partial' | 'heavy';
  confidence: number;
  signals: string[];
  explanation: string;
}

function hasHydrationPayload(html: string) {
  return /__NEXT_DATA__|self\.__next_f|window\.__NUXT__|data-server-rendered|data-reactroot|ng-version|__APOLLO_STATE__/i.test(html);
}

export function detectRenderingStrategy(
  html: string,
  pageUrl: string,
  framework: FrameworkDetection,
): RenderingStrategyDetection {
  const $ = cheerio.load(html);
  const signals: string[] = [];
  const spa = detectSpaShell(html);
  const cards = detectProductCards(html, { pageUrl });
  const bodyTextLength = $('body').text().replace(/\s+/g, ' ').trim().length;
  const scriptCount = $('script').length;
  const appRoots = $('#__next, #__nuxt, #root, #app, [data-reactroot]').length;
  const hydrationPayload = hasHydrationPayload(html);

  if (spa.likely) signals.push(`spa_shell:${spa.reason ?? 'unknown'}`);
  if (cards.cards.length > 0) signals.push(`server_rendered_cards:${cards.cards.length}`);
  if (hydrationPayload) signals.push('hydration_payload');
  if (scriptCount > 35) signals.push(`many_scripts:${scriptCount}`);
  if (appRoots > 0) signals.push('app_root');
  if (bodyTextLength < 600 && html.length > 50_000) signals.push('sparse_body_large_html');

  if (spa.likely) {
    return {
      strategy: 'spa',
      scrapingMode: 'playwright_primary',
      hydration: 'heavy',
      confidence: 0.9,
      signals,
      explanation: 'The static response looks like a JavaScript shell; product data is likely populated after hydration.',
    };
  }

  if (cards.cards.length >= 2 && (hydrationPayload || framework.framework === 'nextjs' || framework.framework === 'nuxt' || scriptCount > 25)) {
    return {
      strategy: 'hybrid',
      scrapingMode: 'hybrid',
      hydration: hydrationPayload ? 'partial' : 'none',
      confidence: 0.82,
      signals,
      explanation: 'Product markup is available in HTML, but the site also uses client-side hydration. Start with Cheerio and fall back to Playwright.',
    };
  }

  if (cards.cards.length === 0 && (hydrationPayload || appRoots > 0 || bodyTextLength < 600)) {
    return {
      strategy: 'js_heavy',
      scrapingMode: 'playwright_primary',
      hydration: hydrationPayload ? 'heavy' : 'partial',
      confidence: 0.76,
      signals,
      explanation: 'The HTML has JavaScript framework signals but no reliable product cards. Browser rendering should be the primary mode.',
    };
  }

  if (hydrationPayload || framework.framework === 'nextjs' || framework.framework === 'nuxt') {
    return {
      strategy: 'hybrid',
      scrapingMode: 'playwright_fallback',
      hydration: 'partial',
      confidence: 0.72,
      signals,
      explanation: 'The page includes hydration data, but static HTML appears usable. Use Cheerio first with Playwright as fallback.',
    };
  }

  return {
    strategy: 'static_html',
    scrapingMode: 'cheerio',
    hydration: 'none',
    confidence: 0.78,
    signals: signals.length ? signals : ['static_html_usable'],
    explanation: 'The static HTML appears usable for selectors and product cards.',
  };
}
