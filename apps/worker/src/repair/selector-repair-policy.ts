export const SELECTOR_REPAIR_AUTO_APPLY_CONFIDENCE = 0.75;
export const SELECTOR_REPAIR_MIN_SUGGESTION_CONFIDENCE = 0.45;

export const NON_REPAIRABLE_ERROR_CODES = new Set([
  'blocked',
  'captcha',
  'suspicious',
  'http_error',
  'skipped_robots',
]);

export function isRepairableScrapeFailure(input: {
  status: string;
  selectorFailureCount: number;
  confidence?: number | null;
  aiEnabled: boolean;
  hasHtmlArtifact: boolean;
}) {
  if (!input.aiEnabled) return { eligible: false, reason: 'ai_disabled' };
  if (!input.hasHtmlArtifact) return { eligible: false, reason: 'html_artifact_missing' };
  if (NON_REPAIRABLE_ERROR_CODES.has(input.status)) return { eligible: false, reason: `non_repairable_${input.status}` };
  if (input.status === 'parse_failed' && input.selectorFailureCount >= 1) {
    return { eligible: true, reason: 'parse_failed' };
  }
  if ((input.confidence ?? 1) < SELECTOR_REPAIR_MIN_SUGGESTION_CONFIDENCE && input.selectorFailureCount >= 1) {
    return { eligible: true, reason: 'low_confidence' };
  }
  return { eligible: false, reason: 'policy_not_triggered' };
}

export function classifyRepairSuggestion(input: { valid: boolean; confidence: number }) {
  if (!input.valid) return { status: 'failed' as const, autoApplyRecommended: false };
  if (input.confidence >= SELECTOR_REPAIR_AUTO_APPLY_CONFIDENCE) {
    return { status: 'validated' as const, autoApplyRecommended: true };
  }
  if (input.confidence >= SELECTOR_REPAIR_MIN_SUGGESTION_CONFIDENCE) {
    return { status: 'suggested' as const, autoApplyRecommended: false };
  }
  return { status: 'failed' as const, autoApplyRecommended: false };
}
