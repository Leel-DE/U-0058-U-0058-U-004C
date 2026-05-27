import { describe, expect, it } from 'vitest';
import { evaluateSelectorRepairEligibility } from './selector-repair-policy';

describe('web selector repair eligibility', () => {
  it('prevents infinite repair loops for the same product scrape run', () => {
    expect(
      evaluateSelectorRepairEligibility({
        status: 'parse_failed',
        selectorFailureCount: 2,
        hasHtmlArtifact: true,
        aiEnabled: true,
        sameRunAttemptCount: 1,
        competitorAttemptsLastHour: 0,
      }),
    ).toEqual({ eligible: false, reason: 'already_attempted_this_scrape_run' });
  });

  it('enforces the competitor hourly repair limit', () => {
    expect(
      evaluateSelectorRepairEligibility({
        status: 'parse_failed',
        selectorFailureCount: 2,
        hasHtmlArtifact: true,
        aiEnabled: true,
        sameRunAttemptCount: 0,
        competitorAttemptsLastHour: 3,
      }),
    ).toEqual({ eligible: false, reason: 'competitor_hourly_limit_reached' });
  });

  it('skips missing HTML artifacts and disabled AI before repair', () => {
    expect(
      evaluateSelectorRepairEligibility({
        status: 'parse_failed',
        selectorFailureCount: 1,
        hasHtmlArtifact: false,
        aiEnabled: true,
      }),
    ).toEqual({ eligible: false, reason: 'html_artifact_missing' });
    expect(
      evaluateSelectorRepairEligibility({
        status: 'parse_failed',
        selectorFailureCount: 1,
        hasHtmlArtifact: true,
        aiEnabled: false,
      }),
    ).toEqual({ eligible: false, reason: 'ai_disabled' });
  });
});
