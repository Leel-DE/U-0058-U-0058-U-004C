import { describe, expect, it } from 'vitest';
import { aggregateFieldConfidence, scoreFieldConfidence } from './field-confidence.js';

describe('field confidence', () => {
  it('scores selector-backed required fields higher than heuristic fields', () => {
    const selectorScores = scoreFieldConfidence({
      extracted: { title: 'Headphones', price: 99, availability: 'in_stock', image: 'https://example.test/a.jpg' },
      sourcePath: 'selector',
      rules: {
        titleSelector: 'h1',
        priceSelector: '.price',
        availabilitySelector: '.stock',
        imageSelector: '.gallery img',
        useJsonLd: true,
        useOpenGraph: true,
      },
    });
    const heuristicScores = scoreFieldConfidence({
      extracted: { title: 'Headphones', price: 99 },
      sourcePath: 'heuristic',
      rules: { useJsonLd: false, useOpenGraph: false },
    });

    expect(selectorScores.price).toBeGreaterThan(heuristicScores.price ?? 0);
    expect(aggregateFieldConfidence(selectorScores)).toBeGreaterThan(0.7);
  });

  it('does not produce scores for missing fields', () => {
    const scores = scoreFieldConfidence({
      extracted: { price: 10 },
      sourcePath: 'json-ld',
      rules: { useJsonLd: true, useOpenGraph: false },
    });

    expect(scores.title).toBeUndefined();
    expect(scores.price).toBeGreaterThan(0);
  });
});
