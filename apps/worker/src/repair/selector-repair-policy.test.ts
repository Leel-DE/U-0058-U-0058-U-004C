import { describe, expect, it } from 'vitest';
import { classifyRepairSuggestion, isRepairableScrapeFailure } from './selector-repair-policy.js';

describe('selector repair policy', () => {
  it('allows parse_failed with a selector failure and HTML artifact', () => {
    expect(
      isRepairableScrapeFailure({
        status: 'parse_failed',
        selectorFailureCount: 1,
        aiEnabled: true,
        hasHtmlArtifact: true,
      }),
    ).toEqual({ eligible: true, reason: 'parse_failed' });
  });

  it('skips captcha, block, robots, network, and AI-disabled cases', () => {
    for (const status of ['captcha', 'blocked', 'suspicious', 'http_error', 'skipped_robots']) {
      expect(
        isRepairableScrapeFailure({
          status,
          selectorFailureCount: 3,
          aiEnabled: true,
          hasHtmlArtifact: true,
        }).eligible,
      ).toBe(false);
    }
    expect(
      isRepairableScrapeFailure({
        status: 'parse_failed',
        selectorFailureCount: 1,
        aiEnabled: false,
        hasHtmlArtifact: true,
      }),
    ).toEqual({ eligible: false, reason: 'ai_disabled' });
  });

  it('classifies auto-apply and manual-review confidence thresholds', () => {
    expect(classifyRepairSuggestion({ valid: true, confidence: 0.9 })).toEqual({
      status: 'validated',
      autoApplyRecommended: true,
    });
    expect(classifyRepairSuggestion({ valid: true, confidence: 0.6 })).toEqual({
      status: 'suggested',
      autoApplyRecommended: false,
    });
    expect(classifyRepairSuggestion({ valid: true, confidence: 0.3 })).toEqual({
      status: 'failed',
      autoApplyRecommended: false,
    });
  });
});
