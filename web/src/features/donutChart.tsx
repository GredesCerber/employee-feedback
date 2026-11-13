import { useId } from 'react';
import { localeNames, useI18n } from '../i18n';
import { useRevealOnView } from './designMotion';
import './donutChart.css';

export type Slice = { key: string; label: string; value: number };

/** Окружность длиной 100: доли задаются прямо в процентах через stroke-dasharray. */
const R = 100 / (2 * Math.PI);
const GAP = 0.9;

/**
 * Кольцевая диаграмма на чистом SVG: доли в оттенках основного цвета темы, итог в центре, легенда рядом.
 * Для экранных читалок — заголовок SVG; легенда скрыта от них, чтобы не повторять те же числа.
 */
export function DonutChart({ title, slices }: { title: string; slices: Slice[] }) {
  const { locale } = useI18n();
  const number = new Intl.NumberFormat(localeNames[locale], { maximumFractionDigits: 1 });
  const percent = new Intl.NumberFormat(localeNames[locale], { style: 'percent', maximumFractionDigits: 0 });
  const titleId = useId();
  const reveal = useRevealOnView<HTMLDivElement>();
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const visible = slices.filter(slice => slice.value > 0);
  const gap = visible.length > 1 ? GAP : 0;
  let offset = 0;
  const arcs = visible.map(slice => {
    const share = total > 0 ? (slice.value / total) * 100 : 0;
    const arc = { ...slice, start: offset, length: Math.max(0, share - gap) };
    offset += share;
    return arc;
  });
  // В центре — доля самого частого типа: общее число уже стоит в карточке «Всего обращений» над диаграммой.
  const top = visible.reduce<Slice | undefined>((best, slice) => !best || slice.value > best.value ? slice : best, undefined);
  const shade = (key: string) => Math.max(0, slices.findIndex(slice => slice.key === key));
  return <div ref={reveal} className="donut">
    <svg className="donut-chart" role="img" aria-labelledby={titleId} viewBox="0 0 42 42" width="168" height="168">
      <title id={titleId}>{`${title}: ${slices.map(slice => `${slice.label} ${number.format(slice.value)}`).join(', ')}`}</title>
      <circle className="donut-track" cx="21" cy="21" r={R} />
      <g className="donut-arcs">
        {arcs.map(arc => <circle key={arc.key} data-slice={arc.key} className={`donut-slice donut-shade-${shade(arc.key)}`} cx="21" cy="21" r={R}
          strokeDasharray={`${arc.length} ${100 - arc.length}`} strokeDashoffset={25 - arc.start - gap / 2} />)}
      </g>
      {top && <text className="donut-total" x="21" y="20" textAnchor="middle" dominantBaseline="middle">{percent.format(top.value / total)}</text>}
      {top && <text className="donut-caption" x="21" y="26.5" textAnchor="middle" dominantBaseline="middle">{top.label}</text>}
    </svg>
    <ul className="donut-legend" aria-hidden="true">{slices.map(slice => <li key={slice.key}>
      <span className={`donut-swatch donut-shade-${shade(slice.key)}`} />
      <span className="donut-label">{slice.label}</span>
      <span className="donut-value">{number.format(slice.value)}</span>
      <span className="donut-share">{percent.format(total > 0 ? slice.value / total : 0)}</span>
    </li>)}</ul>
  </div>;
}
