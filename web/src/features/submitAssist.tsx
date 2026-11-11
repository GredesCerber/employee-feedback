import { useEffect, useRef, useState } from 'react';
import type { ApiClient, components } from '../api/client';
import { requireData, retryAfterOf, useCooldown } from './data';
import { ImitationBadge } from './demo';
import { StatusBadge } from './complaint';

/**
 * Помощники формы подачи (#128, идея #83): похожие обращения и «Подсказать категорию».
 * Оба ответа вспомогательные: любая ошибка только показывает сообщение и никогда не блокирует отправку.
 */
type Similar = components['schemas']['SimilarComplaint'];
type Source = components['schemas']['CategorySuggestion']['source'];
type Category = { id: string; name: string };
type Suggestion = { kind: 'found'; category: Category; source: Source } | { kind: 'none' } | { kind: 'failed'; message: string };

export const SIMILAR_DELAY_MS = 500;
export const MIN_TEXT_LENGTH = 10;

const sourceBadge: Record<Source, { label: string; hint: string }> = {
  'demo-fixture': { label: 'Демо ИИ', hint: 'записанный ответ, а не живая модель' },
  rules: { label: 'Демо ИИ', hint: 'простые локальные правила, не живая модель' },
  llm: { label: 'ИИ', hint: 'ответ живой модели; проверьте категорию сами' },
  none: { label: 'Демо ИИ', hint: 'записанный ответ, а не живая модель' },
};

export function useSubmitAssist(options: { api: ApiClient; description: string; categories: readonly Category[]; categoryId: string; setCategory: (id: string) => void }) {
  const { api, description, categories, categoryId, setCategory } = options;
  const [similar, setSimilar] = useState<Similar[]>([]);
  const [suggestion, setSuggestion] = useState<Suggestion>();
  const [suggesting, setSuggesting] = useState(false);
  const cooldown = useCooldown();
  const cooldownRef = useRef(cooldown);
  cooldownRef.current = cooldown;
  const text = description.trim();
  const ready = text.length > MIN_TEXT_LENGTH;

  useEffect(() => {
    if (!ready) { setSimilar([]); return; }
    let active = true;
    const timer = setTimeout(() => {
      if (cooldownRef.current.active) return;
      api.GET('/complaints/similar', { params: { query: { text } } })
        .then(result => { if (active) setSimilar((result.data?.items ?? []).slice(0, 3)); })
        .catch(error => {
          if (!active) return;
          setSimilar([]);
          const wait = retryAfterOf(error);
          if (wait) cooldownRef.current.start(wait);
        });
    }, SIMILAR_DELAY_MS);
    return () => { active = false; clearTimeout(timer); };
  }, [api, text, ready]);

  async function suggest() {
    if (!text || suggesting || cooldown.active) return;
    setSuggesting(true);
    try {
      const data = requireData((await api.GET('/complaints/suggest-category', { params: { query: { text } } })).data);
      const found = data.category && categories.find(item => item.id === data.category!.id);
      if (!found) { setSuggestion({ kind: 'none' }); return; }
      setSuggestion({ kind: 'found', category: { id: found.id, name: found.name }, source: data.source });
      if (!categoryId) setCategory(found.id);
    } catch (error) {
      const wait = retryAfterOf(error);
      if (wait) cooldown.start(wait);
      setSuggestion({ kind: 'failed', message: wait ? '' : 'Подсказка сейчас недоступна, выберите категорию вручную.' });
    } finally { setSuggesting(false); }
  }

  return { similar, suggestion, suggesting, cooldown, suggest, canSuggest: Boolean(text) && !suggesting && !cooldown.active };
}

export function SimilarList({ items }: { items: Similar[] }) {
  if (!items.length) return null;
  return <div className="similar-box"><p className="field-hint">Похожие обращения: возможно, вопрос уже подавали.</p>
    <ul className="similar-list" aria-label="Похожие обращения">{items.map(item => <li key={item.id}>
      <span className="complaint-number">{item.number}</span> <span>{item.categoryName}</span> <StatusBadge status={item.status} />
    </li>)}</ul></div>;
}

export function SuggestionNote({ assist, categoryId, categoryName, apply }: { assist: ReturnType<typeof useSubmitAssist>; categoryId: string; categoryName: string | undefined; apply: (id: string) => void }) {
  const { suggestion, cooldown } = assist;
  if (!suggestion && !cooldown.active) return null;
  let body: React.ReactNode = null;
  if (cooldown.active) body = cooldown.message;
  else if (suggestion?.kind === 'failed') body = suggestion.message;
  else if (suggestion?.kind === 'none') body = 'Подходящей категории не нашлось, выберите её вручную.';
  else if (suggestion?.kind === 'found') {
    const { category, source } = suggestion;
    const badge = sourceBadge[source];
    body = <>
      <ImitationBadge label={badge.label} hint={badge.hint} /> Подсказка: <strong>{category.name}</strong>.
      {categoryId === category.id
        ? ' Эта категория уже выбрана.'
        : <> Выбрана другая категория{categoryName ? ` («${categoryName}»)` : ''}, мы её не меняли. <button type="button" onClick={() => apply(category.id)}>Применить: {category.name}</button></>}
    </>;
  }
  return <div className="suggestion-note" role="status" aria-label="Подсказка категории">{body}</div>;
}
