import { useId, useState, type ReactNode, type Ref } from 'react';
import './collapsiblePanel.css';

const storageKey = (id: string) => `feedback:panel:${id}`;

function storedOpen(id: string) {
  try { return localStorage.getItem(storageKey(id)) !== 'closed'; } catch { return true; }
}

/**
 * Панель аналитики со сворачиванием: заголовок — кнопка с aria-expanded, содержимое скрывается атрибутом hidden.
 * По умолчанию раскрыта; выбор запоминается в браузере, чтобы руководитель держал открытыми только нужные разделы.
 */
export function CollapsiblePanel({ id, title, className = 'dashboard-panel', badge, panelRef, children }: {
  id: string; title: string; className?: string; badge?: ReactNode; panelRef?: Ref<HTMLElement>; children: ReactNode;
}) {
  const headingId = useId();
  const contentId = useId();
  const [open, setOpen] = useState(() => storedOpen(id));
  const toggle = () => setOpen(value => {
    try { localStorage.setItem(storageKey(id), value ? 'closed' : 'open'); } catch { /* состояние работает и без хранилища */ }
    return !value;
  });
  return <section ref={panelRef} className={`${className} collapsible-panel`} data-open={open} aria-labelledby={headingId}>
    <div className="collapsible-heading">
      <h2 id={headingId}><button type="button" className="dashboard-section-toggle" aria-expanded={open} aria-controls={contentId} onClick={toggle}>
        {title}<span className="collapsible-chevron" aria-hidden="true" /></button></h2>
      {badge}
    </div>
    <div id={contentId} className="collapsible-body" hidden={!open}>{children}</div>
  </section>;
}

/** Длинный список: первые `limit` элементов и кнопка «Показать все» / «Свернуть». */
export function useShowAll<T>(items: T[], limit = SHOW_LIMIT) {
  const [all, setAll] = useState(false);
  return { visible: all ? items : items.slice(0, limit), more: items.length > limit, all, toggle: () => setAll(value => !value) };
}
export const SHOW_LIMIT = 8;

export function ShowAllButton({ all, toggle, label }: { all: boolean; toggle: () => void; label: { more: string; less: string } }) {
  return <button type="button" className="show-all-button" aria-expanded={all} onClick={toggle}>{all ? label.less : label.more}</button>;
}

/** Подписи столбцов над диаграммой: то, что раньше было шапкой дублирующей таблицы. */
export function ChartHeader({ label, value }: { label: string; value: string }) {
  return <div className="chart-header" aria-hidden="true"><span>{label}</span><span>{value}</span></div>;
}
