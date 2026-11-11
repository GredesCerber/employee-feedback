import { readFileSync } from 'node:fs';
import type { ReferenceData } from '../model.js';
import { tokenSet } from '../discovery.js';

/** One row of api/data/ai-rules.json: word stems that point to a category. */
interface KeywordRule { categoryId: string; keywords: string[] }

let cache: KeywordRule[] | undefined;
function keywordRules(): KeywordRule[] {
  cache ??= JSON.parse(readFileSync(new URL('../../data/ai-rules.json', import.meta.url), 'utf8')) as KeywordRule[];
  return cache;
}

/**
 * Offline fallback without any model: counts how many stems of each category occur in the text
 * (a token matches a stem when it starts with it, case- and ё-insensitive).
 * Returns the category with the strictly highest count, or null when nothing matches or the top is a tie.
 */
export function suggestByRules(text: string, references: Pick<ReferenceData, 'categories'>): { id: string; name: string } | null {
  const tokens = [...tokenSet(text)];
  let best: { categoryId: string; score: number } | undefined;
  let tie = false;
  for (const rule of keywordRules()) {
    const score = rule.keywords.filter(stem => tokens.some(token => token.startsWith(stem))).length;
    if (score === 0) continue;
    if (!best || score > best.score) { best = { categoryId: rule.categoryId, score }; tie = false; }
    else if (score === best.score) tie = true;
  }
  if (!best || tie) return null;
  const category = references.categories.find(candidate => candidate.id === best.categoryId);
  return category ? { id: category.id, name: category.name } : null;
}
