import { titleSimilarity } from './normalization';
import type { ProductSpecs } from './types';

export interface MatchCandidateInput {
  myTitle: string;
  competitorTitle: string;
  myBrand?: string | null;
  competitorBrand?: string | null;
  mySku?: string | null;
  competitorSku?: string | null;
  myGtin?: string | null;
  competitorGtin?: string | null;
  mySpecs?: ProductSpecs;
  competitorSpecs?: ProductSpecs;
}

export interface MatchScore {
  score: number;
  method: 'gtin' | 'sku' | 'brand_model' | 'spec_similarity' | 'title_similarity';
  reasons: string[];
}

export function scoreProductMatch(input: MatchCandidateInput): MatchScore {
  const reasons: string[] = [];
  if (input.myGtin && input.competitorGtin && input.myGtin === input.competitorGtin) {
    return { score: 0.99, method: 'gtin', reasons: ['GTIN exact match'] };
  }
  if (input.mySku && input.competitorSku && input.mySku.toLowerCase() === input.competitorSku.toLowerCase()) {
    return { score: 0.95, method: 'sku', reasons: ['SKU exact match'] };
  }

  const titleScore = titleSimilarity(input.myTitle, input.competitorTitle);
  if (titleScore >= 0.55) reasons.push(`Title token overlap ${titleScore.toFixed(2)}`);

  const brandMatch = Boolean(
    input.myBrand &&
    input.competitorBrand &&
    input.myBrand.toLowerCase() === input.competitorBrand.toLowerCase(),
  );
  if (brandMatch) reasons.push('Brand exact match');

  const specScore = specsSimilarity(input.mySpecs, input.competitorSpecs);
  if (specScore >= 0.4) reasons.push(`Spec similarity ${specScore.toFixed(2)}`);

  const score = Math.min(0.92, titleScore * 0.55 + (brandMatch ? 0.18 : 0) + specScore * 0.27);
  const method = brandMatch && titleScore >= 0.45 ? 'brand_model' : specScore > titleScore ? 'spec_similarity' : 'title_similarity';
  return { score: Number(score.toFixed(3)), method, reasons };
}

function specsSimilarity(left?: ProductSpecs, right?: ProductSpecs): number {
  if (!left || !right) return 0;
  const keys: Array<keyof ProductSpecs> = ['year', 'motor', 'batteryWh', 'wheelSize', 'frameMaterial', 'travelMm', 'bikeType'];
  let compared = 0;
  let matched = 0;
  for (const key of keys) {
    const a = left[key];
    const b = right[key];
    if (a == null || b == null) continue;
    compared++;
    if (String(a).toLowerCase() === String(b).toLowerCase()) matched++;
  }
  return compared === 0 ? 0 : matched / compared;
}
