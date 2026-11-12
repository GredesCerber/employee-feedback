import { useI18n } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import { useSession } from '../app/session';
import { ApiError } from '../api/client';
import { errorMessage, requireData, retryAfterOf, useCooldown } from './data';
import type { Complaint } from './complaint';

export function UndoAction({ item, onUpdated }: { item: Complaint; onUpdated: (message?: string) => void }) {
  const { t } = useI18n();
  const { api, role } = useSession();
  const [now, setNow] = useState(Date.now);
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const cooldown = useCooldown();
  const expires = Date.parse(item.undoExpiresAt ?? '');
  const seconds = Math.max(0, Math.ceil((expires - now) / 1000));
  useEffect(() => {
    setUnavailable(false); setError(''); setNow(Date.now());
    if (role !== 'manager' || !item.canUndo || !Number.isFinite(expires)) return;
    const timer = setInterval(() => {
      const current = Date.now(); setNow(current);
      if (current >= expires) clearInterval(timer);
    }, 250);
    return () => clearInterval(timer);
  }, [role, item.id, item.canUndo, expires]);

  async function undo() {
    if (lock.current || cooldown.active) return;
    if (Date.now() >= expires) { setUnavailable(true); setError('Время отмены истекло. Обновите карточку.'); return; }
    lock.current = true; setBusy(true); setError('');
    try {
      requireData((await api.POST('/complaints/{complaintId}/undo', { params: { path: { complaintId: item.id } } })).data);
      setUnavailable(true);
      onUpdated('Последнее действие отменено.');
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 409
        && ['UNDO_EXPIRED', 'NOTHING_TO_UNDO'].includes(failure.code)) {
        setUnavailable(true);
        setError(failure.code === 'UNDO_EXPIRED' ? 'Время отмены истекло. Обновите карточку.' : 'Нет доступного действия для отмены. Обновите карточку.');
      } else {
        const wait = retryAfterOf(failure);
        if (wait) cooldown.start(wait);
        setError(wait ? '' : errorMessage(failure));
      }
    } finally { lock.current = false; setBusy(false); }
  }

  if (role !== 'manager' || ['implemented', 'rejected', 'closed'].includes(item.status)) return null;
  const available = item.canUndo && Number.isFinite(expires) && seconds > 0 && !unavailable;
  return <div className="undo-action">
    {available && <div className="actions"><button type="button" disabled={busy || cooldown.active} aria-busy={busy} onClick={() => void undo()}>{busy ? t("Отмена…") : t("Отменить действие")}</button>
      <span className="muted">{t("Осталось для отмены:")} {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</span>
    </div>}
    {(error || cooldown.active) && <p role="alert" className="field-error">{cooldown.active ? cooldown.message : t(error)}</p>}
  </div>;
}
