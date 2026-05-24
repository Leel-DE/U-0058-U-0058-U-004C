import { GoogleGenAI } from '@google/genai';
import { categorySelectorPrompt } from '../prompts/detect-category-page.js';
import { productSelectorPrompt } from '../prompts/detect-product-page.js';
import { selectorValidationPrompt } from '../prompts/validate-selectors.js';
import { categorySuggestionSchema, type CategorySuggestion } from '../schemas/category-suggestion.js';
import { selectorSuggestionSchema, type SelectorSuggestion } from '../schemas/selector-suggestion.js';
import type { AIProvider, DetectInput, ValidateInput, ValidationResult } from './index.js';

const validationSchema = {
  type: 'object',
  properties: {
    valid: { type: 'boolean' },
    confidence: { type: 'number' },
    problems: { type: 'array', items: { type: 'string' } },
  },
  required: ['valid', 'confidence', 'problems'],
};

const productSchema = {
  type: 'object',
  properties: {
    titleSelector: { type: 'string', nullable: true },
    priceSelector: { type: 'string', nullable: true },
    oldPriceSelector: { type: 'string', nullable: true },
    availabilitySelector: { type: 'string', nullable: true },
    imageSelector: { type: 'string', nullable: true },
    shippingSelector: { type: 'string', nullable: true },
    ratingSelector: { type: 'string', nullable: true },
    currency: { type: 'string' },
    confidence: { type: 'number' },
    notes: { type: 'array', items: { type: 'string' } },
  },
  required: ['confidence'],
};

const categorySchema = {
  type: 'object',
  properties: {
    productCardSelector: { type: 'string', nullable: true },
    cardTitleSelector: { type: 'string', nullable: true },
    cardPriceSelector: { type: 'string', nullable: true },
    cardLinkSelector: { type: 'string', nullable: true },
    cardImageSelector: { type: 'string', nullable: true },
    confidence: { type: 'number' },
    notes: { type: 'array', items: { type: 'string' } },
  },
  required: ['confidence'],
};

export class GeminiProvider implements AIProvider {
  private readonly client: GoogleGenAI;
  private readonly model = process.env.GEMINI_MODEL ?? 'gemini-2.5-pro';
  private readonly fallbackModel = process.env.GEMINI_FALLBACK_MODEL ?? 'gemini-2.5-flash';

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');
    this.client = new GoogleGenAI({ apiKey });
  }

  async detectProductSelectors(input: DetectInput): Promise<SelectorSuggestion> {
    const json = await this.generateJson(productSelectorPrompt(input.cleanedDom), productSchema);
    return selectorSuggestionSchema.parse(json);
  }

  async detectCategorySelectors(input: DetectInput): Promise<CategorySuggestion> {
    const json = await this.generateJson(categorySelectorPrompt(input.cleanedDom), categorySchema);
    return categorySuggestionSchema.parse(json);
  }

  async validateSelectors(input: ValidateInput): Promise<ValidationResult> {
    const json = await this.generateJson(
      selectorValidationPrompt(input.cleanedDom, JSON.stringify(input.selectors)),
      validationSchema,
    );
    return {
      valid: Boolean(json.valid),
      confidence: Number(json.confidence ?? 0),
      problems: Array.isArray(json.problems) ? json.problems.map(String) : [],
    };
  }

  private async generateJson(prompt: string, responseSchema: object): Promise<Record<string, unknown>> {
    const errors: string[] = [];
    for (const model of [this.model, this.fallbackModel].filter(Boolean)) {
      try {
        const response = await this.client.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema,
            temperature: 0.1,
          },
        });
        const text = response.text?.trim() ?? '';
        return JSON.parse(text) as Record<string, unknown>;
      } catch (err) {
        errors.push(`${model}: ${(err as Error).message}`);
      }
    }
    throw new Error(`Gemini request failed: ${errors.join('; ')}`);
  }
}
