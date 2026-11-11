import { useContext } from 'react';
import { createPortal } from 'react-dom';
import { CompletionSlot } from './completionSlot';
import { useRevealOnView } from './designMotion';
import type { Complaint } from './complaint';
import { localeNames, useI18n } from '../i18n';

const terminal = new Set<Complaint['status']>(['implemented', 'rejected', 'closed']);

export function PageCompletionSignal({ items }: { items: readonly Pick<Complaint, 'status'>[] }) {
  const { t } = useI18n();
  const closed = items.filter(item => terminal.has(item.status)).length;
  return <CompletionSignal total={items.length} closed={closed} scope={t('На этой странице')} />;
}

export function CompletionSignal({ total, closed, scope }: { total: number; closed: number; scope?: string }) {
  const host = useContext(CompletionSlot);
  const { t, locale } = useI18n();
  const observe = useRevealOnView<HTMLDivElement>(true);
  if (!host || total <= 0) return null;

  const percent = Math.min(100, Math.max(0, closed / total * 100));
  const number = new Intl.NumberFormat(localeNames[locale]);
  return createPortal(<div className="completion-signal" ref={observe} role="group" aria-label={t('Доля обращений с итогом')}>
    <span className="completion-caption">{t('Обращения с итогом')}</span>
    <div className="completion-dial">
      <svg viewBox="0 0 160 160" aria-hidden="true" focusable="false">
        <g className="completion-orbit">
          <circle className="completion-dots" cx="80" cy="80" r="66" />
          <path className="completion-marks" d="M80 8v12m0 120v12M8 80h12m120 0h12" />
        </g>
        <circle className="completion-track" cx="80" cy="80" r="54" />
        <circle className="completion-progress" cx="80" cy="80" r="54" pathLength="100" strokeDasharray={`${percent} 100`} transform="rotate(-90 80 80)" />
      </svg>
      <strong>{number.format(Math.round(percent))}<small>%</small></strong>
    </div>
    <span>{t('{closed} из {total}', { closed: number.format(closed), total: number.format(total) })}</span>
    {scope && <span className="completion-scope">{scope}</span>}
    <div className="completion-pixels" aria-hidden="true">
      {Array.from({ length: 20 }, (_, index) => <i key={index} className={index < Math.round(percent / 5) ? 'is-filled' : undefined} />)}
    </div>
  </div>, host);
}
