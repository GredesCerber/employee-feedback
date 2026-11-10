import type { Complaint } from './model.js';

function normalize(text: string): string {
  return text.toLowerCase().replaceAll('ё', 'е');
}

/** Literal word fragments, without morphology or regular-expression evaluation. */
export function searchWords(query?: string): string[] {
  return normalize(query ?? '').split(/\s+/u).filter(Boolean);
}

export function matchesComplaintText(item: Complaint, words: readonly string[]): boolean {
  if (words.length === 0) return true;
  const text = normalize([item.number, item.description, item.proposedSolution ?? '',
    ...item.comments.map(comment => comment.text)].join('\n'));
  return words.every(word => text.includes(word));
}
