import { useEffect, useId, useRef, useState } from 'react';
import { useSession } from '../app/session';
import { useI18n } from '../i18n';
import type { components } from '../api/schema';
import { requireData, retryAfterOf, useCooldown } from './data';
import './aiAdvice.css';

type Advice = components['schemas']['AdviceResponse'];

/**
 * «Помощь ИИ»: компактная кнопка на карточке. Сервер собирает всю видимую этой роли переписку и историю,
 * спрашивает ИИ-цепочку и возвращает 2–3 варианта с плюсами и минусами. Ничего не меняет в обращении.
 */
export function AiAdvice({ complaintId }: { complaintId: string }) {
  const { role } = useSession();
  // New role or complaint: forget the previous answer (it was written for another viewer).
  return <AdvicePanel key={`${complaintId}:${role}`} complaintId={complaintId} />;
}

function AdvicePanel({ complaintId }: { complaintId: string }) {
  const { api } = useSession();
  const { t } = useI18n();
  const panelId = useId();
  const [advice, setAdvice] = useState<Advice>();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const cooldown = useCooldown();
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), [api]);

  async function ask() {
    if (busy || cooldown.active) return;
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setOpen(true); setBusy(true); setError(false);
    try {
      const response = await api.POST('/complaints/{complaintId}/advice', { params: { path: { complaintId } }, signal: current.signal });
      if (!current.signal.aborted) setAdvice(requireData(response.data));
    } catch (cause) {
      if (current.signal.aborted) return;
      const seconds = retryAfterOf(cause);
      if (seconds) cooldown.start(seconds);
      setError(true);
    } finally {
      if (controller.current === current) { controller.current = null; setBusy(false); }
    }
  }

  function toggle() {
    if (open && !busy) { setOpen(false); return; }
    if (!advice || error) void ask(); else setOpen(true);
  }

  return <div className="ai-advice">
    <button type="button" className="ai-advice-toggle" aria-expanded={open} aria-controls={panelId} aria-busy={busy}
      disabled={busy || cooldown.active} onClick={toggle}>
      <span aria-hidden="true" className="ai-advice-spark">✦</span>{busy ? t("ИИ думает…") : t("Помощь ИИ")}
    </button>
    {open && <div id={panelId} className="ai-advice-panel" role="region" aria-label={t("Варианты решения")}>
      {busy && <p role="status" className="muted">{t("Собираем переписку и историю обращения…")}</p>}
      {error && <p role="alert">{cooldown.active ? cooldown.message : t("Подсказка сейчас недоступна. Попробуйте ещё раз.")}</p>}
      {advice && !busy && <>
        <div className="ai-advice-head">
          <span className="imitation-badge" title={advice.source === 'llm'
            ? t("Варианты предложила модель по переписке, статусам и истории. Решение принимаете вы.")
            : t("Типовые варианты по роли и статусу: ключ не настроен, модель недоступна или обращение анонимное.")}>
            {advice.source === 'llm' ? t("ИИ") : t("Правила (без ИИ)")}
          </span>
          <button type="button" className="ai-advice-again" onClick={() => void ask()}>{t("Ещё раз")}</button>
        </div>
        <ol className="ai-advice-options">
          {advice.options.map((option, index) => <li key={index} className="ai-advice-option">
            <h3>{option.title}</h3>
            <p>{option.summary}</p>
            <div className="ai-advice-tradeoffs">
              <div><strong>{t("Плюсы")}</strong><ul className="ai-advice-pros">{option.pros.map((item, n) => <li key={n}>{item}</li>)}</ul></div>
              <div><strong>{t("Минусы")}</strong><ul className="ai-advice-cons">{option.cons.map((item, n) => <li key={n}>{item}</li>)}</ul></div>
            </div>
          </li>)}
        </ol>
        <p className="field-hint">{t("Это подсказка: в обращении ничего не меняется.")}</p>
      </>}
    </div>}
  </div>;
}
