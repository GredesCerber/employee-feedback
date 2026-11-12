import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { referenceLabel, useI18n } from '../i18n';
import { useSession } from '../app/session';
import { errorMessage, requireData, retryAfterOf, useCooldown, useResource } from './data';
import { Loading, LoadError, StatusBadge, statusLabels } from './complaint';
import type { Complaint } from './complaint';
import type { components } from '../api/client';
import './engagement.css';

type Similar = components['schemas']['SimilarComplaint'];
const open = (status: string) => !['implemented', 'rejected', 'closed'].includes(status);

/** Руководитель объединяет близкие обращения в одну общую проблему с планом (решение остаётся за человеком). */
export function MergeIntoProblem({ item, categoryName, onUpdated }: { item: Complaint; categoryName: string; onUpdated: (message?: string) => void }) {
  const { t, locale } = useI18n();
  const { api } = useSession();
  const [expanded, setExpanded] = useState(false);
  const [candidates, setCandidates] = useState<Similar[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState(categoryName);
  const [plan, setPlan] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cooldown = useCooldown();
  useEffect(() => {
    if (!expanded || candidates !== null) return;
    let active = true;
    api.GET('/complaints/similar', { params: { query: { text: item.description.slice(0, 5000) } } })
      .then(result => { if (active) setCandidates((result.data?.items ?? []).filter(other => other.id !== item.id && open(other.status))); })
      .catch(() => { if (active) setCandidates([]); });
    return () => { active = false; };
  }, [api, expanded, candidates, item.id, item.description]);
  if (item.problem || !open(item.status)) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (selected.length === 0) { setError(t("Выберите хотя бы одно похожее обращение.")); return; }
    if (title.trim().length < 3) { setError(t("Название проблемы — не короче трёх символов.")); return; }
    if (busy || cooldown.active) return;
    setBusy(true); setError('');
    try {
      requireData((await api.POST('/problems', { body: { title: title.trim(), ...(plan.trim() ? { plan: plan.trim() } : {}), complaintIds: [item.id, ...selected] } })).data);
      onUpdated(t("Обращения объединены в общую проблему."));
    } catch (failure) {
      const wait = retryAfterOf(failure);
      if (wait) cooldown.start(wait); else setError(errorMessage(failure));
    } finally { setBusy(false); }
  }
  return <details className="action-panel" open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary>{t("Объединить с похожими в общую проблему")}</summary>
    {expanded && candidates === null && <Loading label={t("Ищем похожие обращения…")} />}
    {candidates !== null && (candidates.length === 0 ? <p className="muted">{t("Похожих открытых обращений не нашлось.")}</p>
      : <form className="problem-form" onSubmit={submit} noValidate>
        <p className="muted">{t("Найдены по совпадению слов; решение об объединении принимаете вы.")}</p>
        <ul className="problem-candidates">{candidates.map(other => <li key={other.id}><label>
          <input type="checkbox" checked={selected.includes(other.id)} onChange={event => setSelected(list => event.target.checked ? [...list, other.id] : list.filter(id => id !== other.id))} />
          {other.number} · {referenceLabel(locale, 'category', other.categoryId, other.categoryName)} · {t(statusLabels[other.status])}
        </label></li>)}</ul>
        <label htmlFor="problem-title">{t("Название общей проблемы")}</label>
        <input id="problem-title" value={title} maxLength={120} onChange={event => setTitle(event.target.value)} />
        <label htmlFor="problem-plan">{t("План действий (необязательно)")}</label>
        <textarea id="problem-plan" rows={3} maxLength={2000} value={plan} onChange={event => setPlan(event.target.value)} />
        {(cooldown.active || error) && <p role="alert" className="field-error">{cooldown.active ? cooldown.message : error}</p>}
        <button className="primary-button" type="submit" disabled={busy || cooldown.active} aria-busy={busy}>{t("Объединить")}</button>
      </form>)}
  </details>;
}

/** Общие проблемы: список для руководителя и администратора. */
export function ProblemsPanel() {
  const { t } = useI18n();
  const { api, role } = useSession();
  const load = useCallback(async () => requireData((await api.GET('/problems')).data), [api]);
  const result = useResource(load);
  return <section className="dashboard-panel problems-panel" aria-labelledby="problems-title">
    <h2 id="problems-title">{t("Общие проблемы")}</h2>
    <p className="muted">{t("Несколько обращений об одном: решение по одному применяется ко всем открытым.")}</p>
    {result.loading && <Loading label={t("Загрузка общих проблем…")} />}
    {result.error && <LoadError message={result.error} retry={result.reload} retryAfter={result.retryAfter} />}
    {Array.isArray(result.data?.items) && (result.data.items.length === 0 ? <p>{t("Общих проблем пока нет. Объединить обращения можно в карточке руководителя.")}</p>
      : <ul className="problem-list">{result.data.items.map(problem => <li key={problem.id}>
        <strong>{problem.title}</strong> · {problem.status === 'resolved' ? t("решена") : t("в работе")}
        {problem.plan && <p className="preserve-lines">{problem.plan}</p>}
        <p className="muted">{problem.complaints.map(member => role === 'manager'
          ? <span key={member.id}><Link to={`/queue/${encodeURIComponent(member.id)}`}>{member.number}</Link> <StatusBadge status={member.status} />{' '}</span>
          : <span key={member.id}>{member.number} <StatusBadge status={member.status} />{' '}</span>)}</p>
      </li>)}</ul>)}
  </section>;
}
