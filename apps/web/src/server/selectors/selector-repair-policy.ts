const NON_REPAIRABLE_STATUSES = new Set([
  'blocked',
  'captcha',
  'suspicious',
  'http_error',
  'skipped_robots',
]);

export interface SelectorRepairEligibilityInput {
  status: string;
  selectorFailureCount: number;
  hasHtmlArtifact: boolean;
  aiEnabled: boolean;
  confidence?: number | null;
  sameRunAttemptCount?: number;
  competitorAttemptsLastHour?: number;
}

export function evaluateSelectorRepairEligibility(input: SelectorRepairEligibilityInput) {
  if (!input.aiEnabled) return { eligible: false, reason: 'ai_disabled' };
  if (!input.hasHtmlArtifact) return { eligible: false, reason: 'html_artifact_missing' };
  if (NON_REPAIRABLE_STATUSES.has(input.status)) return { eligible: false, reason: `non_repairable_${input.status}` };
  if ((input.sameRunAttemptCount ?? 0) > 0) return { eligible: false, reason: 'already_attempted_this_scrape_run' };
  if ((input.competitorAttemptsLastHour ?? 0) >= 3) return { eligible: false, reason: 'competitor_hourly_limit_reached' };
  if (input.status === 'parse_failed' && input.selectorFailureCount >= 1) {
    return { eligible: true, reason: 'parse_failed' };
  }
  if ((input.confidence ?? 1) < 0.45 && input.selectorFailureCount >= 1) {
    return { eligible: true, reason: 'low_confidence' };
  }
  return { eligible: false, reason: 'policy_not_triggered' };
}
