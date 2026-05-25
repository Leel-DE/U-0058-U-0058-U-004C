import type { FrameworkDetection } from './framework-detector.js';
import type { RenderingStrategyDetection, ScrapingMode } from './rendering-strategy-detector.js';

export type CrawlPreset = 'safe' | 'balanced' | 'fast' | 'heavy_discovery';
export type Difficulty = 'low' | 'medium' | 'high';

export interface ScrapeProfile {
  crawlDifficulty: Difficulty;
  antiBotRisk: Difficulty;
  recommendedMode: ScrapingMode;
  recommendedDelaySeconds: number;
  expectedScrapeStability: Difficulty;
  crawlPreset: CrawlPreset;
  reasons: string[];
}

export interface ScrapeProfileInput {
  framework: FrameworkDetection;
  rendering: RenderingStrategyDetection;
  robotsStatus?: string;
  selectorConfidence: number;
  warnings: string[];
  html: string;
}

function hasAntiBotSignals(html: string, warnings: string[]) {
  const head = html.slice(0, 300_000);
  return (
    /cloudflare|cf-chl|akamai|perimeterx|datadome|hcaptcha|g-recaptcha|recaptcha|bot protection|just a moment/i.test(head) ||
    warnings.some((warning) => /captcha|blocked|suspicious|robots/i.test(warning))
  );
}

export function generateScrapeProfile(input: ScrapeProfileInput): ScrapeProfile {
  const reasons: string[] = [];
  let difficultyScore = 0;
  let antiBotScore = 0;

  if (input.rendering.strategy === 'hybrid') {
    difficultyScore += 1;
    reasons.push('hybrid rendering');
  }
  if (input.rendering.strategy === 'js_heavy' || input.rendering.strategy === 'spa') {
    difficultyScore += 2;
    reasons.push('browser rendering required');
  }
  if (input.selectorConfidence < 0.65) {
    difficultyScore += 1;
    reasons.push('selector confidence below 65%');
  }
  if (input.framework.framework === 'shopify' || input.framework.framework === 'tilda') {
    difficultyScore += 0.5;
    reasons.push(`${input.framework.label} storefront patterns`);
  }

  if (input.robotsStatus === 'disallowed') {
    antiBotScore += 2;
    reasons.push('robots.txt disallows requested URL');
  } else if (input.robotsStatus === 'fetch_error') {
    antiBotScore += 1;
    reasons.push('robots.txt could not be checked');
  }
  if (hasAntiBotSignals(input.html, input.warnings)) {
    antiBotScore += 2;
    reasons.push('anti-bot or captcha signatures');
  }

  const crawlDifficulty: Difficulty = difficultyScore >= 2 ? 'high' : difficultyScore >= 1 ? 'medium' : 'low';
  const antiBotRisk: Difficulty = antiBotScore >= 2 ? 'high' : antiBotScore >= 1 ? 'medium' : 'low';
  const expectedScrapeStability: Difficulty =
    crawlDifficulty === 'low' && input.selectorConfidence >= 0.8
      ? 'high'
      : crawlDifficulty === 'high' || input.selectorConfidence < 0.55
        ? 'low'
        : 'medium';

  const recommendedDelaySeconds = antiBotRisk === 'high' ? 10 : crawlDifficulty === 'high' ? 7 : 5;
  const crawlPreset: CrawlPreset = antiBotRisk === 'high' ? 'safe' : crawlDifficulty === 'low' ? 'balanced' : 'safe';

  return {
    crawlDifficulty,
    antiBotRisk,
    recommendedMode: input.rendering.scrapingMode,
    recommendedDelaySeconds,
    expectedScrapeStability,
    crawlPreset,
    reasons: reasons.length ? reasons : ['static HTML and selectors look stable'],
  };
}
