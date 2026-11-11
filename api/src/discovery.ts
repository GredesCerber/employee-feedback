import { readFileSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import type { Complaint, ReferenceData, Status, User } from './model.js';
import { identity, invalid, queryParameters } from './http.js';

/** Fixed stop-word set (documented in api/README.md). */
export const stopWords: ReadonlySet<string> = new Set([
  'и', 'в', 'во', 'на', 'не', 'что', 'это', 'как', 'а', 'но', 'или', 'по', 'к', 'с', 'со', 'у', 'о', 'об', 'от', 'до',
  'из', 'за', 'для', 'при', 'про', 'же', 'ли', 'бы', 'то', 'так', 'там', 'тут', 'он', 'она', 'они', 'оно', 'мы', 'вы',
  'я', 'его', 'ее', 'их', 'наш', 'ваш', 'быть', 'был', 'была', 'были', 'было', 'есть', 'можно', 'нужно', 'очень',
  'также', 'еще', 'уже', 'всех', 'все', 'всё', 'чтобы', 'если', 'когда', 'который', 'которые', 'этот', 'эти', 'такой',
]);
/** Trimmed text shorter than this gets no suggestion and is never sent to a model. */
export const MIN_SUGGESTION_LENGTH = 10;
const MIN_LENGTH = MIN_SUGGESTION_LENGTH;
const MAX_LENGTH = 5000;
const FIXTURE_THRESHOLD = 0.3;

/** Case/ё-insensitive set of Unicode letter and digit tokens without stop words. */
export function tokenSet(text: string): Set<string> {
  const tokens = text.toLowerCase().replaceAll('ё', 'е').match(/[\p{L}\p{N}]+/gu) ?? [];
  return new Set(tokens.filter(token => !stopWords.has(token)));
}

export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let common = 0;
  for (const token of a) if (b.has(token)) common++;
  return common / (a.size + b.size - common);
}

interface Fixture { text: string; categoryId: string }
let fixtureCache: { text: string; categoryId: string; tokens: Set<string> }[] | undefined;
function fixtures() {
  fixtureCache ??= (JSON.parse(readFileSync(new URL('../data/ai-fixtures.json', import.meta.url), 'utf8')) as Fixture[])
    .map(fixture => ({ ...fixture, tokens: tokenSet(fixture.text) }));
  return fixtureCache;
}

export function suggestDemoCategory(text: string, references: ReferenceData) {
  const none = { category: null, source: 'none' as const };
  if (text.trim().length < MIN_LENGTH) return none;
  const tokens = tokenSet(text);
  let best: { categoryId: string; score: number } | undefined;
  for (const fixture of fixtures()) {
    const score = jaccard(tokens, fixture.tokens);
    if (score >= FIXTURE_THRESHOLD && (!best || score > best.score)) best = { categoryId: fixture.categoryId, score };
  }
  const category = best && references.categories.find(candidate => candidate.id === best.categoryId);
  return category ? { category: { id: category.id, name: category.name }, source: 'demo-fixture' as const } : none;
}

function textParameter(app: FastifyInstance, request: Parameters<typeof queryParameters>[0]): { user: User; text: string } {
  const user = identity(app, request);
  const text = queryParameters(request, ['text']).get('text');
  if (text === null || text.length > MAX_LENGTH) invalid('Параметр text обязателен и не длиннее 5000 символов.');
  return { user, text };
}

export function registerDiscovery(app: FastifyInstance) {
  app.get('/complaints/similar', async (request) => {
    const { user, text } = textParameter(app, request);
    if (text.trim().length < MIN_LENGTH) return { items: [] };
    const query = tokenSet(text);
    const categories = new Map(app.store.referenceData.categories.map(category => [category.id, category.name]));
    const items = app.store.list()
      .filter((item: Complaint) => user.role !== 'employee' || item.author.id === user.id)
      .map(item => ({ item, score: jaccard(query, tokenSet(`${item.description} ${item.proposedSolution ?? ''}`)) }))
      .filter(entry => entry.score > 0)
      .sort((a, b) => b.score - a.score || Date.parse(b.item.createdAt) - Date.parse(a.item.createdAt)
        || (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0))
      .slice(0, 3)
      .map(({ item, score }) => ({ id: item.id, number: item.number, categoryId: item.categoryId,
        categoryName: categories.get(item.categoryId) ?? item.categoryId, status: item.status as Status, score }));
    return { items };
  });

  app.get('/complaints/suggest-category', async (request) => {
    const { text } = textParameter(app, request);
    return app.ai.suggestCategory(text, app.store.referenceData, request.log);
  });
}
