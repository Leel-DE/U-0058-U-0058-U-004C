import { createHash } from 'node:crypto';
import { cleanDom } from '../ai/cleaners/clean-dom.js';
import { debounceAi } from '../ai/cache/ai-cache.js';
import { estimateTokens, reduceDomForPrompt } from '../ai/cleaners/reduce-dom.js';
import type { AIProvider } from '../ai/providers/index.js';
import { productSelectorRepairPrompt } from './selector-repair-prompts.js';
import { classifyRepairSuggestion } from './selector-repair-policy.js';
import {
  selectorRepairSuggestionSchema,
  type ProductRepairSelectors,
  type SelectorRepairRequest,
  type SelectorRepairRunnerResult,
} from './selector-repair-types.js';
import {
  changedRepairFields,
  mergeRepairSelectors,
  validateProductSelectorRepair,
} from './selector-repair-validator.js';

function stableHash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
}

function productSelectorsOnly(selectors: SelectorRepairRequest['oldSelectors']): ProductRepairSelectors {
  return {
    titleSelector: selectors.titleSelector ?? null,
    priceSelector: selectors.priceSelector ?? null,
    oldPriceSelector: selectors.oldPriceSelector ?? null,
    availabilitySelector: selectors.availabilitySelector ?? null,
    imageSelector: selectors.imageSelector ?? null,
    brandSelector: selectors.brandSelector ?? null,
    skuSelector: selectors.skuSelector ?? null,
    breadcrumbsSelector: selectors.breadcrumbsSelector ?? null,
  };
}

export async function runProductSelectorRepair(
  input: SelectorRepairRequest,
  provider: AIProvider | null,
): Promise<SelectorRepairRunnerResult> {
  if (!provider) {
    return {
      ok: false,
      status: 'skipped',
      confidence: 0,
      warnings: [],
      error: 'ai_disabled',
      autoApplyRecommended: false,
    };
  }

  const cleaned = cleanDom(input.html);
  const reducedDom = reduceDomForPrompt(cleaned.html, Number(process.env.AI_EXTRACTION_MAX_HTML_CHARS ?? 60_000));
  const promptInput = { ...input, cleanedDom: reducedDom };
  const cacheKey = `repair:product:${cleaned.hash}:${stableHash({
    oldSelectors: input.oldSelectors,
    failedFields: input.failedFields,
    previousValues: input.previousValues,
  })}`;

  const { value } = await debounceAi(cacheKey, () =>
    provider.repairProductSelectors({
      url: input.url,
      cleanedDom: reducedDom,
      domHash: cleaned.hash,
      prompt: productSelectorRepairPrompt(promptInput),
      oldSelectors: input.oldSelectors,
      failedFields: input.failedFields,
      previousValues: input.previousValues,
      store: input.store,
    }),
  );

  const suggestion = selectorRepairSuggestionSchema.parse(value);
  const oldSelectors = productSelectorsOnly(input.oldSelectors);
  const appliedSelectors = mergeRepairSelectors(oldSelectors, suggestion.selectors);
  const changedFields = changedRepairFields(suggestion.selectors);
  const validation = validateProductSelectorRepair({
    html: input.html,
    pageUrl: input.url,
    selectors: appliedSelectors,
    changedFields,
    priceRegex: input.oldSelectors.priceRegex,
  });
  const confidence = Math.min(suggestion.confidence, validation.overallConfidence);
  const classification = classifyRepairSuggestion({ valid: validation.valid, confidence });

  return {
    ok: classification.status !== 'failed',
    status: classification.status,
    suggestedSelectors: suggestion.selectors,
    appliedSelectors,
    validation,
    confidence,
    reason: suggestion.reason,
    warnings: [...suggestion.warnings, ...validation.warnings],
    error: validation.errors.length ? validation.errors.join('; ') : undefined,
    cleanedDomHash: cleaned.hash,
    tokenEstimate: estimateTokens(reducedDom),
    aiProvider: process.env.AI_PROVIDER ?? 'gemini',
    aiModel: process.env.GEMINI_MODEL ?? 'gemini-2.5-pro',
    autoApplyRecommended: classification.autoApplyRecommended,
  };
}
