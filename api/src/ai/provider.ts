import type { FastifyBaseLogger } from 'fastify';
import type { ReferenceData } from '../model.js';
import { MIN_SUGGESTION_LENGTH, suggestDemoCategory } from '../discovery.js';
import { createAnthropicClassifier, describeFailure, type CategoryClassifier } from './anthropic.js';
import { suggestByRules } from './rules.js';

export const DEFAULT_AI_MODEL = 'claude-haiku-5-5';
export const DEFAULT_AI_TIMEOUT_MS = 3000;

export interface CategorySuggestion {
  category: { id: string; name: string } | null;
  /** llm: live model answer; demo-fixture: recorded example; rules: keyword table; none: no suggestion. */
  source: 'llm' | 'demo-fixture' | 'rules' | 'none';
}

export interface AiProviderOptions {
  /** Empty or missing key: the model is never called and no network is used. */
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  /** Test seam for the SDK HTTP layer (recorded responses instead of the network). */
  fetch?: typeof globalThis.fetch;
}

export interface AiProvider {
  readonly llmEnabled: boolean;
  readonly model: string;
  readonly timeoutMs: number;
  suggestCategory(text: string, references: ReferenceData, log?: FastifyBaseLogger): Promise<CategorySuggestion>;
}

/** ANTHROPIC_API_KEY turns the live model on; AI_MODEL overrides the default model. */
export function aiConfigFromEnv(): { apiKey: string | undefined; model: string } {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const model = process.env.AI_MODEL?.trim();
  return { apiKey: apiKey || undefined, model: model || DEFAULT_AI_MODEL };
}

/** Local answer without any model: recorded demo examples first (#121), then keyword rules. */
function suggestLocally(text: string, references: ReferenceData): CategorySuggestion {
  const recorded = suggestDemoCategory(text, references);
  if (recorded.category) return recorded;
  const category = suggestByRules(text, references);
  return category ? { category, source: 'rules' } : { category: null, source: 'none' };
}

/**
 * Single entry point for AI features. With a key it asks the model once and, on any failure
 * (timeout, HTTP error, refusal, malformed or unknown answer), answers locally and logs a warning.
 * Without a key it always answers locally. Errors and credentials never reach the client.
 */
export function createAiProvider(options: AiProviderOptions = {}): AiProvider {
  const apiKey = options.apiKey?.trim() || undefined;
  const model = options.model?.trim() || DEFAULT_AI_MODEL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_AI_TIMEOUT_MS;
  const classifier: CategoryClassifier | undefined = apiKey
    ? createAnthropicClassifier({ apiKey, model, timeoutMs, fetch: options.fetch })
    : undefined;
  return {
    llmEnabled: classifier !== undefined,
    model,
    timeoutMs,
    async suggestCategory(text, references, log) {
      if (text.trim().length < MIN_SUGGESTION_LENGTH) return { category: null, source: 'none' };
      if (classifier) {
        try {
          const categoryId = await classifier.classify(text, references.categories.map(({ id, name }) => ({ id, name })));
          const category = references.categories.find(candidate => candidate.id === categoryId);
          return category ? { category: { id: category.id, name: category.name }, source: 'llm' } : { category: null, source: 'none' };
        } catch (error) {
          log?.warn({ reason: describeFailure(error), model }, 'ИИ-подсказка категории недоступна, используется запасной вариант без ИИ');
        }
      }
      return suggestLocally(text, references);
    },
  };
}
