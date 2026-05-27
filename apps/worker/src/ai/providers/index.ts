import type { SelectorSuggestion } from '../schemas/selector-suggestion.js';
import type { CategorySuggestion } from '../schemas/category-suggestion.js';
import type { SelectorRepairRequest, SelectorRepairSuggestion } from '../../repair/selector-repair-types.js';
import { GeminiProvider } from './gemini.js';

export interface ValidationResult {
  valid: boolean;
  confidence: number;
  problems: string[];
}

export interface DetectInput {
  url: string;
  cleanedDom: string;
  domHash: string;
}

export interface ValidateInput extends DetectInput {
  selectors: SelectorSuggestion | CategorySuggestion;
}

export interface RepairProductSelectorsInput extends DetectInput {
  prompt: string;
  oldSelectors: SelectorRepairRequest['oldSelectors'];
  failedFields: SelectorRepairRequest['failedFields'];
  previousValues: SelectorRepairRequest['previousValues'];
  store: SelectorRepairRequest['store'];
}

export interface AIProvider {
  detectProductSelectors(input: DetectInput): Promise<SelectorSuggestion>;
  detectCategorySelectors(input: DetectInput): Promise<CategorySuggestion>;
  validateSelectors(input: ValidateInput): Promise<ValidationResult>;
  repairProductSelectors(input: RepairProductSelectorsInput): Promise<SelectorRepairSuggestion>;
}

export function isAiEnabled(): boolean {
  return (process.env.AI_PROVIDER ?? 'gemini') === 'gemini' && Boolean(process.env.GEMINI_API_KEY);
}

export function getAIProvider(): AIProvider | null {
  if (!isAiEnabled()) return null;
  return new GeminiProvider();
}

export function aiStatus() {
  return {
    enabled: isAiEnabled(),
    provider: process.env.AI_PROVIDER ?? 'gemini',
    model: process.env.GEMINI_MODEL ?? 'gemini-2.5-pro',
    fallbackModel: process.env.GEMINI_FALLBACK_MODEL ?? 'gemini-2.5-flash',
    maxHtmlChars: Number(process.env.AI_EXTRACTION_MAX_HTML_CHARS ?? 60_000),
  };
}
