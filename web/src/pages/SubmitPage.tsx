import { referenceLabel, useI18n } from '../i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../app/session';
import { ApiError } from '../api/client';
import { errorMessage, requireData, retryAfterOf, useCooldown, useResource } from '../features/data';
import { Loading, LoadError } from '../features/complaint';
import type { Complaint } from '../features/complaint';
import { ImitationBadge } from '../features/demo';
import { AnonymousBadge } from '../features/complaintMeta';
import { CopyNumber, WhatNext } from '../features/complaintFollowUp';
import { SimilarList, SuggestionNote, useSubmitAssist } from '../features/submitAssist';
import { MapPicker, type LocationPoint } from '../features/MapPicker';
import { clearDraft, readDraft, writeDraft } from '../features/submitDraft';
import { CategoryCards, CharCounter, SUBMIT_LIMITS } from '../features/submitForm';

const mapCopy = {
  ru: { title: 'Указать место на карте — необязательно', invalid: 'Проверьте широту и долготу или очистите координаты.', privacy: 'Точное место может косвенно указать на автора анонимного обращения.', selected: 'Точка выбрана' },
  en: { title: 'Add a location on the map — optional', invalid: 'Check the latitude and longitude or clear the coordinates.', privacy: 'An exact location may indirectly identify the author of an anonymous complaint.', selected: 'Location selected' },
  kk: { title: 'Картада орынды белгілеу — міндетті емес', invalid: 'Ендік пен бойлықты тексеріңіз немесе координаттарды тазалаңыз.', privacy: 'Нақты орын анонимді өтініш авторын жанама түрде танытуы мүмкін.', selected: 'Орын белгіленді' },
};

import '../styles/feedback-layout.css';

const fieldIds: Record<string, string> = { categoryId: 'category', description: 'description', proposedSolution: 'solution', type: 'complaint-type' };
function focusFirstInvalid(errors: Record<string, string>) {
  const first = ['type', 'categoryId', 'description', 'proposedSolution'].find(field => errors[field]);
  if (first) document.getElementById(fieldIds[first]!)?.focus();
}

const describedBy = (...ids: (string | false | undefined)[]) => ids.filter(Boolean).join(' ') || undefined;

/** Черновик хранится по роли (#312 A2): при смене роли форма монтируется заново со своим черновиком. */
export default function SubmitPage() {
  const { role } = useSession();
  return <SubmitForm key={role} role={role} />;
}

function SubmitForm({ role }: { role: string }) {
  const { t, locale } = useI18n();
  const mapLabels = mapCopy[locale];
  const { api } = useSession();
  const [draft] = useState(() => readDraft(role));
  const [draftRestored, setDraftRestored] = useState(Boolean(draft));
  const [mapKey, setMapKey] = useState(0);
  const load = useCallback(async () => requireData((await api.GET('/reference-data')).data), [api]);
  const reference = useResource(load);
  const [type, setType] = useState<Complaint['type']>(draft?.type ?? 'problem');
  const [categoryId, setCategory] = useState(draft?.categoryId ?? '');
  const [description, setDescription] = useState(draft?.description ?? '');
  const [solution, setSolution] = useState(draft?.solution ?? '');
  const [attachment, setAttachment] = useState(false);
  const [anonymous, setAnonymous] = useState(draft?.anonymous ?? false);
  const [point, setPoint] = useState<LocationPoint | undefined>(draft?.location);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [locationValid, setLocationValid] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const cooldown = useCooldown();
  function clearFieldError(field: string) {
    setErrors(current => {
      if (!(field in current)) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }
  function chooseCategory(value: string) {
    setCategory(value);
    if (value) clearFieldError('categoryId');
  }
  const assist = useSubmitAssist({ api, description, categories: reference.data?.categories ?? [], categoryId, setCategory: chooseCategory });
  const [created, setCreated] = useState<Complaint>();
  const resultHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (created) resultHeading.current?.focus(); }, [created]);
  useEffect(() => {
    if (created) return;
    writeDraft(role, { type, categoryId, description, solution, anonymous, ...(point ? { location: point } : {}) });
  }, [role, created, type, categoryId, description, solution, anonymous, point]);

  function resetDraft() {
    clearDraft(role);
    setType('problem'); setCategory(''); setDescription(''); setSolution('');
    setAnonymous(false); setPoint(undefined); setAttachment(false); setLocationValid(true);
    setErrors({}); setFailure(''); setDraftRestored(false); setMapKey(key => key + 1);
    document.getElementById('description')?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || cooldown.active) return;
    const nextErrors: Record<string, string> = {};
    if (!categoryId) nextErrors.categoryId = 'Выберите категорию.';
    if (!description.trim()) nextErrors.description = 'Опишите проблему или предложение.';
    if (!locationValid) nextErrors.location = mapLabels.invalid;
    setErrors(nextErrors); setFailure('');
    if (Object.keys(nextErrors).length) { focusFirstInvalid(nextErrors); return; }
    lock.current = true; setBusy(true);
    try {
      const result = await api.POST('/complaints', { body: {
        type, categoryId, description: description.trim(),
        ...(anonymous ? { anonymous: true } : {}),
        ...(point ? { location: point } : {}),
        ...(solution.trim() ? { proposedSolution: solution.trim() } : {}),
        ...(attachment ? { attachments: [{ name: 'sample-request.txt', mediaType: 'text/plain', sizeBytes: 120, isPlaceholder: true }] } : {}),
      } });
      const complaint = requireData(result.data);
      clearDraft(role);
      setCreated(complaint);
    } catch (error) {
      const wait = retryAfterOf(error);
      if (wait) cooldown.start(wait);
      setFailure(wait ? '' : errorMessage(error));
      if (error instanceof ApiError) {
        const serverErrors = Object.fromEntries((error.details ?? []).map(item => [item.field, item.message]));
        setErrors(serverErrors); focusFirstInvalid(serverErrors);
      }
    } finally { lock.current = false; setBusy(false); }
  }

  const announcement = <p className="visually-hidden" aria-live="polite">{created ? (locale === 'en' ? `Complaint ${created.number} registered.` : locale === 'kk' ? `${created.number} өтініші тіркелді.` : `Обращение ${created.number} зарегистрировано.`) : ''}</p>;

  if (created) return <><section className="section">
    <p className="eyebrow">{t("Отправлено")}</p><h1 ref={resultHeading} tabIndex={-1}>{t("Обращение зарегистрировано")}</h1>
    <div className="registration-row"><p className="registration-number" id="registration-number">{created.number}</p><CopyNumber number={created.number} targetId="registration-number" /></div>{(created.anonymous ?? anonymous) && <p><AnonymousBadge /></p>}
    <WhatNext item={created} reference={reference.data} />
    <div className="actions"><Link className="primary-link" to={`/my/${created.id}`}>{t("Открыть обращение")}</Link><Link to="/my">{t("К моим обращениям")}</Link></div>
  </section>{announcement}</>;

  return <><section className="section submit-page"><p className="eyebrow">{t("Обратная связь")}</p><h1>{t("Новое обращение")}</h1>
    <p className="muted">{t("Сообщите о проблеме или предложите улучшение. Обращение видят вы, руководители и администраторы.")}</p>
    {reference.loading && <Loading label={t("Загрузка категорий…")} />}
    {reference.error && <LoadError message={reference.error} retry={reference.reload} retryAfter={reference.retryAfter} />}
    {reference.data && <div className="submit-layout"><form onSubmit={submit} noValidate className="complaint-form">
      {draftRestored && <div className="draft-note" role="status">
        <span>{t("Черновик восстановлен")}</span>
        <button type="button" onClick={resetDraft}>{t("Очистить")}</button>
      </div>}
      <fieldset className="form-block" data-block="what">
        <legend><span className="form-block-step" aria-hidden="true">1</span>{t("Что случилось")}</legend>
        <label htmlFor="complaint-type">{t("Тип обращения")}</label><select id="complaint-type" value={type} onChange={event => setType(event.target.value as Complaint['type'])}><option value="problem">{t("Проблема")}</option><option value="suggestion">{t("Предложение")}</option><option value="praise">{t("Благодарность")}</option></select>
        <CategoryCards categories={reference.data.categories} value={categoryId} suggestedId={assist.suggestion?.kind === 'found' ? assist.suggestion.category.id : undefined} onChange={chooseCategory} />
        <label htmlFor="category">{t("Категория")}</label><select id="category" value={categoryId} onChange={event => chooseCategory(event.target.value)} required aria-invalid={Boolean(errors.categoryId)} aria-describedby={errors.categoryId ? 'category-error' : undefined}><option value="">{t("Выберите категорию")}</option>{reference.data.categories.map(category => <option key={category.id} value={category.id}>{referenceLabel(locale, 'category', category.id, category.name)}</option>)}</select>
        {errors.categoryId && <p id="category-error" role="alert" className="field-error">{errors.categoryId}</p>}
        <button type="button" className="suggest-button" disabled={!assist.canSuggest} onClick={assist.suggest}>{t("Подсказать категорию")}</button>
        <SuggestionNote assist={assist} categoryId={categoryId} categoryName={reference.data.categories.find(item => item.id === categoryId)?.name} apply={chooseCategory} />
        <label htmlFor="description">{t("Описание")}</label><textarea id="description" value={description} onChange={event => {
          setDescription(event.target.value);
          if (event.target.value.trim()) clearFieldError('description');
        }} rows={5} maxLength={SUBMIT_LIMITS.description} required aria-invalid={Boolean(errors.description)} aria-describedby={describedBy('description-counter', errors.description && 'description-error')} />
        <CharCounter id="description-counter" length={description.length} max={SUBMIT_LIMITS.description} />
        {errors.description && <p id="description-error" role="alert" className="field-error">{t(errors.description)}</p>}
        <SimilarList items={assist.similar} />
      </fieldset>
      <fieldset className="form-block" data-block="proposal">
        <legend><span className="form-block-step" aria-hidden="true">2</span>{t("Что предлагаете")}</legend>
        <label htmlFor="solution">{t("Предлагаемое решение")} <span className="optional">{t("(необязательно)")}</span></label><textarea id="solution" value={solution} onChange={event => setSolution(event.target.value)} rows={3} maxLength={SUBMIT_LIMITS.proposedSolution} aria-describedby="solution-counter" />
        <CharCounter id="solution-counter" length={solution.length} max={SUBMIT_LIMITS.proposedSolution} />
      </fieldset>
      <fieldset className="form-block" data-block="how">
        <legend><span className="form-block-step" aria-hidden="true">3</span>{t("Как подать")}</legend>
        <p className="field-hint how-to-note">{t("Анонимность скрывает ваше имя от ответственного. Точка на карте и подробности в тексте всё равно могут указать на вас: отмечайте место, только если оно важно для решения.")}</p>
        <label className="checkbox-label"><input type="checkbox" checked={anonymous} onChange={event => setAnonymous(event.target.checked)} aria-describedby="anonymous-hint" />{t("Подать анонимно")}</label>
        <p id="anonymous-hint" className="field-hint">{t("Ответственный не видит автора, но по тексту и вложениям автора могут узнать. Не указывайте лишних подробностей, по которым вас можно опознать.")}</p>
        <details className="optional-map" open={mapOpen} onToggle={event => { setMapOpen(event.currentTarget.open); if (event.currentTarget.open) setMapLoaded(true); }}>
          <summary>{mapLabels.title}{point ? ` · ${mapLabels.selected}` : ''}</summary>
          {mapLoaded && <MapPicker key={mapKey} value={point} onChange={setPoint} onValidityChange={valid => {
            setLocationValid(valid);
            if (valid) clearFieldError('location');
          }} />}
        </details>
        {anonymous && point && <p className="field-hint">{mapLabels.privacy}</p>}
        {errors.location && <p role="alert" className="field-error">{errors.location}</p>}
        <label className="checkbox-label"><input type="checkbox" checked={attachment} onChange={event => setAttachment(event.target.checked)} />{t("Добавить тестовое вложение")} <ImitationBadge hint={t("не настоящий файл: сохраняются только название, тип и размер заглушки")} /></label>
        <p className="field-hint">{t("Файл-заглушка sample-request.txt: сохраняются только название, тип и размер, содержимое не загружается.")}</p>
      </fieldset>
      {(cooldown.active || failure) && <p role="alert" className="field-error">{cooldown.active ? cooldown.message : failure}</p>}
      <button className="primary-button" disabled={busy || cooldown.active} aria-busy={busy} type="submit">{busy ? t("Отправка…") : t("Отправить обращение")}</button>
    </form><aside className="submit-guide" aria-labelledby="submit-guide-heading">
      <h2 id="submit-guide-heading">{t("Что будет дальше")}</h2>
      <ol>
        <li><strong>{t("Регистрация.")}</strong> {t("Вы получите номер обращения.")}</li>
        <li><strong>{t("Рассмотрение.")}</strong> {t("Ответственный изучит обращение и при необходимости задаст вопрос.")}</li>
        <li><strong>{t("Решение.")}</strong> {t("Итог и пояснение появятся в «Моих обращениях».")}</li>
      </ol>
    </aside></div>}
  </section>{announcement}</>;
}
