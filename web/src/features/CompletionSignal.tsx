import { useContext } from 'react';
import { createPortal } from 'react-dom';
import { CompletionSlot } from './completionSlot';
import { useRevealOnView } from './designMotion';

const number = new Intl.NumberFormat('ru-RU');

export function CompletionSignal({ total, closed, scope }: { total: number; closed: number; scope?: string }) {
  const host = useContext(CompletionSlot);
  const observe = useRevealOnView<HTMLDivElement>(true);
  if (!host || total <= 0) return null;

  const percent = Math.min(100, Math.max(0, closed / total * 100));
  return createPortal(<div className="completion-signal" ref={observe} role="group" aria-label="Доля обращений с итогом">
    <span className="completion-caption">Обращения с итогом</span>
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
    <span>{number.format(closed)} из {number.format(total)}</span>
    {scope && <span className="completion-scope">{scope}</span>}
    <div className="completion-pixels" aria-hidden="true">
      {Array.from({ length: 20 }, (_, index) => <i key={index} className={index < Math.round(percent / 5) ? 'is-filled' : undefined} />)}
    </div>
  </div>, host);
}
