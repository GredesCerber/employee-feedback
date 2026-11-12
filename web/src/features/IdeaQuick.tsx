import { referenceLabel, useI18n } from '../i18n';
import { useCallback, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSession } from '../app/session';
import { errorMessage, requireData, retryAfterOf, useCooldown, useResource } from './data';
import type { Complaint } from './complaint';
import { writeDraft } from './submitDraft';
import { CharCounter, SUBMIT_LIMITS } from './submitForm';
import './ideaQuick.css';

/**
 * #312 B1: короткая форма «Предложить идею» на главной сотрудника.
 * Отправляет обычное обращение с type=suggestion (контракт не меняется): категория и одно поле текста.
 * «Полная форма» переносит набранное в черновик формы подачи (#312 A2) и открывает /submit.
 */
export function IdeaQuick({ onCreated }: { onCreated?: (item: Complaint) => void }) {
  const { t, locale } = useI18n();
  const { api, role } = useSession();
  const navigate = useNavigate();
  const load = useCallback(async () => requireData((await api.GET('/reference-data')).data), [api]);
  const reference = useResource(load);
  const [categoryId, setCategory] = useState('');
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<{ category?: string; text?: string }>({});
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Complaint>();
  const lock = useRef(false);
  const cooldown = useCooldown();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || cooldown.active) return;
    const next: typeof errors = {};
    if (!categoryId) next.category = 'Выберите категорию.';
    if (!text.trim()) next.text = 'Опишите идею.';
    setErrors(next); setFailure('');
    if (next.category) { document.getElementById('idea-category')?.focus(); return; }
    if (next.text) { document.getElementById('idea-text')?.focus(); return; }
    lock.current = true; setBusy(true);
    try {
      const result = await api.POST('/complaints', { body: { type: 'suggestion', categoryId, description: text.trim() } });
      const complaint = requireData(result.data);
      setCreated(complaint); setText(''); setCategory('');
      onCreated?.(complaint);
    } catch (error) {
      const wait = retryAfterOf(error);
      if (wait) cooldown.start(wait);
      setFailure(wait ? '' : errorMessage(error));
    } finally { lock.current = false; setBusy(false); }
  }

  function openFullForm() {
    writeDraft(role, { type: 'suggestion', categoryId, description: text, solution: '', anonymous: false });
    navigate('/submit');
  }

  return <section className="idea-quick" aria-labelledby="idea-quick-title">
    <div className="idea-quick-head">
      <h2 id="idea-quick-title">{t("Предложить идею")}</h2>
      <p className="muted">{t("Есть мысль, как улучшить работу? Опишите её в паре предложений — она уйдёт ответственному по категории как предложение.")}</p>
    </div>
    {reference.error && <p role="alert" className="field-error">{reference.error}</p>}
    <form className="idea-quick-form" onSubmit={submit} noValidate>
      <label htmlFor="idea-category">{t("Категория идеи")}</label>
      <select id="idea-category" value={categoryId} disabled={!reference.data} onChange={event => { setCategory(event.target.value); if (event.target.value) setErrors(current => ({ ...current, category: undefined })); }}
        aria-invalid={Boolean(errors.category)} aria-describedby={errors.category ? 'idea-category-error' : undefined}>
        <option value="">{reference.loading ? t("Загрузка категорий…") : t("Выберите категорию")}</option>
        {(reference.data?.categories ?? []).map(category => <option key={category.id} value={category.id}>{referenceLabel(locale, 'category', category.id, category.name)}</option>)}
      </select>
      {errors.category && <p id="idea-category-error" role="alert" className="field-error">{t(errors.category)}</p>}
      <label htmlFor="idea-text">{t("Ваша идея")}</label>
      <textarea id="idea-text" rows={3} value={text} maxLength={SUBMIT_LIMITS.description} onChange={event => { setText(event.target.value); if (event.target.value.trim()) setErrors(current => ({ ...current, text: undefined })); }}
        aria-invalid={Boolean(errors.text)} aria-describedby={['idea-text-counter', errors.text && 'idea-text-error'].filter(Boolean).join(' ')} />
      <CharCounter id="idea-text-counter" length={text.length} max={SUBMIT_LIMITS.description} />
      {errors.text && <p id="idea-text-error" role="alert" className="field-error">{t(errors.text)}</p>}
      {(cooldown.active || failure) && <p role="alert" className="field-error">{cooldown.active ? cooldown.message : failure}</p>}
      <div className="actions idea-quick-actions">
        <button className="primary-button" type="submit" disabled={busy || cooldown.active} aria-busy={busy}>{busy ? t("Отправка…") : t("Отправить идею")}</button>
        <button type="button" className="link-button" onClick={openFullForm}>{t("Полная форма: решение, анонимность, место")}</button>
      </div>
    </form>
    {created && <p className="idea-quick-done" role="status">
      {t("Идея отправлена, номер {number}.", { number: created.number })} <Link to={`/my/${created.id}`}>{t("Открыть обращение")}</Link>
    </p>}
  </section>;
}
