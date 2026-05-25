import type { Extracted, ScrapingRules, SourcePath } from '../types.js';

export type ConfidenceField = 'title' | 'price' | 'availability' | 'image' | 'sku' | 'category';
export type FieldConfidence = Partial<Record<ConfidenceField, number>>;

const FIELD_SELECTOR: Partial<Record<ConfidenceField, keyof ScrapingRules>> = {
  title: 'titleSelector',
  price: 'priceSelector',
  availability: 'availabilitySelector',
  image: 'imageSelector',
  sku: 'skuSelector',
};

function clamp(score: number) {
  return Math.max(0, Math.min(1, Number(score.toFixed(3))));
}

function sourceBonus(sourcePath: SourcePath): number {
  if (sourcePath === 'json-ld') return 0.2;
  if (sourcePath === 'mixed') return 0.15;
  if (sourcePath === 'selector') return 0.12;
  if (sourcePath === 'og') return 0.08;
  return 0;
}

function hasSelector(rules: ScrapingRules, field: ConfidenceField) {
  const key = FIELD_SELECTOR[field];
  return key ? Boolean(rules[key]) : false;
}

export function scoreFieldConfidence(args: {
  extracted: Extracted;
  sourcePath: SourcePath;
  rules: ScrapingRules;
}): FieldConfidence {
  const { extracted, sourcePath, rules } = args;
  const base = sourceBonus(sourcePath);
  const scores: FieldConfidence = {};

  if (extracted.title) {
    scores.title = clamp(0.55 + base + (hasSelector(rules, 'title') ? 0.2 : 0));
  }
  if (extracted.price != null && extracted.price > 0) {
    scores.price = clamp(0.6 + base + (hasSelector(rules, 'price') ? 0.2 : 0));
  }
  if (extracted.availability) {
    scores.availability = clamp(0.45 + base + (hasSelector(rules, 'availability') ? 0.2 : 0));
  }
  if (extracted.image) {
    scores.image = clamp(0.45 + base + (hasSelector(rules, 'image') ? 0.2 : 0));
  }

  return scores;
}

export function aggregateFieldConfidence(scores: FieldConfidence): number {
  const values = Object.values(scores).filter((value): value is number => typeof value === 'number');
  if (values.length === 0) return 0;
  const weighted = values.reduce((sum, value) => sum + value, 0) / values.length;
  return clamp(weighted);
}
