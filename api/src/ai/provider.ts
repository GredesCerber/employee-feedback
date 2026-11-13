import type { FastifyBaseLogger } from 'fastify';
import type { ReferenceData } from '../model.js';
import { MIN_SUGGESTION_LENGTH, suggestDemoCategory } from '../discovery.js';
import { createAnthropicClassifier, createAnthropicJson, describeFailure, type CategoryClassifier } from './anthropic.js';
import { ADVICE_JSON_SCHEMA, ADVICE_SYSTEM_PROMPT, adviceByRules, parseAdvice, type Advice, type AdviceContext } from './advice.js';
import { suggestByRules } from './rules.js';
import { compatConfigsFromEnv, timeoutFromEnv, CompatError, createCompatClassifier, type CompatClassifier, type CompatProviderConfig } from './openai-compatible.js';
import { hasDigestFacts, templateDigest, type DigestContent, type DigestFacts } from './digest.js';

export const DEFAULT_AI_MODEL = 'claude-haiku-5-5';
export const DEFAULT_AI_TIMEOUT_MS = 15_000;

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
  /** Chain before Anthropic: Gemini first, then the second provider (xAI or Groq), then local rules. */
  compat?: CompatProviderConfig[];
  /** Called when a provider fails (names and short reasons only, never keys or request text). */
  onFailure?: (info: { provider: string; model: string; reason: string }) => void;
}

export interface AiProvider {
  readonly llmEnabled: boolean;
  readonly model: string;
  /** Names of configured providers in call order (no keys). */
  readonly providers: string[];
  readonly timeoutMs: number;
  suggestCategory(text: string, references: ReferenceData, log?: FastifyBaseLogger): Promise<CategorySuggestion>;
  summarize(facts: DigestFacts, log?: FastifyBaseLogger): Promise<DigestContent>;
  /** «Помощь ИИ»: 2–3 options for the viewer's role. `localOnly` (anonymous complaint) never calls a provider. */
  advise(context: AdviceContext, localOnly: boolean, log?: FastifyBaseLogger): Promise<Advice>;
}

/** Answers with several options take longer than a category id; never wait less than this. */
export const MIN_ADVICE_TIMEOUT_MS = 15_000;

/** ANTHROPIC_API_KEY turns the live model on; AI_MODEL overrides the default model. */
export function aiConfigFromEnv(): { apiKey: string | undefined; model: string } {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const model = process.env.AI_MODEL?.trim();
  return { apiKey: apiKey || undefined, model: model || DEFAULT_AI_MODEL };
}

/** Extra providers and timeout from the environment (GEMINI_API_KEY, XAI_API_KEY or GROQ_API_KEY, AI_TIMEOUT_MS). */
export function aiChainConfigFromEnv(): Pick<AiProviderOptions, 'compat' | 'timeoutMs'> {
  const timeoutMs = timeoutFromEnv();
  return { compat: compatConfigsFromEnv(), ...(timeoutMs ? { timeoutMs } : {}) };
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
  const anthropic: CategoryClassifier | undefined = apiKey
    ? createAnthropicClassifier({ apiKey, model, timeoutMs, fetch: options.fetch })
    : undefined;
  const compat: CompatClassifier[] = (options.compat ?? []).map(config => createCompatClassifier(config, timeoutMs, options.fetch));
  const secrets = [apiKey, ...(options.compat ?? []).map(config => config.apiKey)].filter((value): value is string => Boolean(value));
  const chain: { name: string; model: string; classifier: CategoryClassifier }[] = [
    ...compat.map(item => ({ name: item.kind, model: item.model, classifier: item as CategoryClassifier })),
    ...(anthropic ? [{ name: 'anthropic', model, classifier: anthropic }] : []),
  ];
  const describe = (error: unknown) => error instanceof CompatError ? error.message : describeFailure(error);
  const adviceTimeoutMs = Math.max(timeoutMs, MIN_ADVICE_TIMEOUT_MS);
  const anthropicJson = apiKey ? createAnthropicJson({ apiKey, model, timeoutMs: adviceTimeoutMs, fetch: options.fetch }) : undefined;
  const adviceChain: { name: string; model: string; ask: (system: string, user: string) => Promise<unknown> }[] = [
    ...compat.map(item => ({ name: item.kind, model: item.model,
      ask: (system: string, user: string) => item.completeJson(system, user, { timeoutMs: adviceTimeoutMs, maxTokens: 8192 }) })),
    ...(anthropicJson ? [{ name: 'anthropic', model, ask: (system: string, user: string) => anthropicJson(system, user, ADVICE_JSON_SCHEMA) }] : []),
  ];
  return {
    async advise(context, localOnly, log) {
      if (!localOnly) for (const provider of adviceChain) {
        try {
          return { options: parseAdvice(await provider.ask(ADVICE_SYSTEM_PROMPT, JSON.stringify(context)), secrets), source: 'llm' };
        } catch (error) {
          const reason = error instanceof Error && !(error instanceof CompatError) && error.constructor === Error ? `unusable answer: ${error.message}` : describe(error);
          log?.warn({ reason, provider: provider.name, model: provider.model }, '«Помощь ИИ» недоступна у провайдера, пробуем следующего или правила');
          options.onFailure?.({ provider: provider.name, model: provider.model, reason });
        }
      }
      return { options: adviceByRules(context), source: 'rules' };
    },
    llmEnabled: chain.length > 0,
    model: chain[0]?.model ?? model,
    providers: chain.map(item => item.name),
    timeoutMs,
    async summarize(facts, log) {
      const fallback = templateDigest(facts);
      if (facts.total > 0) for (const provider of chain) {
        try {
          const text = await provider.classifier.summarize(facts);
          if (secrets.some(secret => text.includes(secret)) || !hasDigestFacts(text, facts)) throw new Error('invalid digest content');
          return { ...fallback, text, source: 'llm' };
        } catch (error) {
          log?.warn({ reason: describe(error), provider: provider.name, model: provider.model }, 'ИИ-сводка недоступна, пробуем следующего провайдера или запасной шаблон');
        }
      }
      return fallback;
    },
    async suggestCategory(text, references, log) {
      if (text.trim().length < MIN_SUGGESTION_LENGTH) return { category: null, source: 'none' };
      for (const provider of chain) {
        try {
          const categoryId = await provider.classifier.classify(text, references.categories.map(({ id, name }) => ({ id, name })));
          const category = references.categories.find(candidate => candidate.id === categoryId);
          return category ? { category: { id: category.id, name: category.name }, source: 'llm' } : { category: null, source: 'none' };
        } catch (error) {
          log?.warn({ reason: describe(error), provider: provider.name, model: provider.model }, 'ИИ-подсказка категории недоступна, пробуем следующего провайдера или запасной вариант без ИИ');
        }
      }
      return suggestLocally(text, references);
    },
  };
}
