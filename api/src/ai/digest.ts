/** The entire model input: labels and counts, without complaint or user records. */
export interface DigestFacts {
  total: number;
  overdueCount: number;
  byCategory: { name: string; count: number }[];
  byDepartment: { name: string; count: number }[];
}

export interface DigestContent { text: string; highlights: string[]; source: 'llm' | 'template' }

/** Refuse uncheckable prose or invented numbers; deterministic highlights remain authoritative. */
export function hasDigestFacts(text: string, facts: DigestFacts): boolean {
  const numbers = new Set(text.match(/\d+(?:[.,]\d+)?/g) ?? []);
  const allowed = new Set([facts.total, facts.overdueCount, ...facts.byCategory.map(item => item.count),
    ...facts.byDepartment.map(item => item.count)].map(String));
  const top = facts.byCategory[0];
  return numbers.has(String(facts.total)) && numbers.has(String(facts.overdueCount))
    && [...numbers].every(number => allowed.has(number))
    && (!top || (text.toLowerCase().includes(top.name.toLowerCase()) && numbers.has(String(top.count))));
}

export function templateDigest(facts: DigestFacts): DigestContent {
  if (!facts.total) return { text: 'Обращений за период нет.', highlights: [], source: 'template' };
  const top = facts.byCategory[0];
  const highlights = [`Всего за период: ${facts.total}.`,
    ...(top ? [`${top.name}: ${top.count}.`] : []), `Просрочено: ${facts.overdueCount}.`];
  return { text: `За период поступило обращений: ${facts.total}. ${top ? `Топ-категория — ${top.name}: ${top.count}. ` : ''}Просрочено обращений из этого периода: ${facts.overdueCount}.`, highlights, source: 'template' };
}
