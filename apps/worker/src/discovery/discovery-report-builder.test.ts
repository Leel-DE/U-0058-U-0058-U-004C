import { describe, expect, it } from 'vitest';
import { buildDiscoveryReport } from './discovery-report-builder.js';

describe('buildDiscoveryReport', () => {
  it('computes summary price stats', () => {
    const report = buildDiscoveryReport({
      runId: 'r',
      status: 'success',
      startUrl: 'https://x.test',
      pages: [],
      categories: [],
      products: [
        { id: '1', url: 'u1', normalizedUrl: 'u1', price: 10, breadcrumbs: [], sourcePageUrl: 'c', confidence: 1, source: 'heuristic', errors: [] },
        { id: '2', url: 'u2', normalizedUrl: 'u2', price: 30, breadcrumbs: [], sourcePageUrl: 'c', confidence: 1, source: 'heuristic', errors: [] },
      ],
      logs: [],
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    });
    expect(report.summary.averagePrice).toBe(20);
    expect(report.summary.maxPrice).toBe(30);
  });
});

