import type { components } from '../api/schema';

type Summary = components['schemas']['Summary'];
type ComplaintType = Summary['byType'][number]['type'];

/**
 * Экспорт сводки в CSV (#346). Только данные, которые уже вернул GET /summary.
 *
 * Формат выбран под Excel с русской локалью:
 * - разделитель полей «;» (в ru-Excel «,» — десятичный разделитель, поэтому файл с «,» открылся бы одной колонкой);
 * - дробные числа с десятичной запятой и не более одного знака после неё;
 * - в начале BOM (U+FEFF), чтобы Excel распознал UTF-8 и показал кириллицу;
 * - строки разделены CRLF, поля с «;», кавычками или переносами берутся в кавычки по RFC 4180;
 * - текст, начинающийся с = + - @, получает префикс «'», чтобы Excel не принял его за формулу.
 */
export const CSV_SEPARATOR = ';';
const BOM = '﻿';

export type SummaryCsvOptions = {
  /** Момент выгрузки; попадает в файл как «Дата выгрузки». */
  exportedAt: Date;
  /** Перевод подписей (ключи — русские строки, как в translations.json). */
  t?: (key: string) => string;
  typeLabel?: (type: ComplaintType) => string;
  categoryLabel?: (id: string, name: string) => string;
  departmentLabel?: (id: string, name: string) => string;
};

type Cell = string | number | null | undefined;

const decimal = (value: number) => String(Math.round(value * 10) / 10).replace('.', ',');

function cell(value: Cell) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? decimal(value) : '';
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[";\r\n]/.test(text) || text !== text.trim() ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Пустая сводка: обращений нет — выгружать и печатать нечего. */
export const isSummaryEmpty = (summary: Summary | null | undefined) => !summary || summary.total === 0;

export function buildSummaryCsv(summary: Summary, options: SummaryCsvOptions) {
  const t = options.t ?? ((key: string) => key);
  const typeLabel = options.typeLabel ?? ((type: ComplaintType) => type);
  const categoryLabel = options.categoryLabel ?? ((_id: string, name: string) => name);
  const departmentLabel = options.departmentLabel ?? ((_id: string, name: string) => name);
  const rows: Cell[][] = [[t('Раздел'), t('Показатель'), t('Значение'), t('Закрыто'), t('Доля закрытых, %')]];
  const add = (section: string, label: string, value: Cell, closed?: Cell, share?: Cell) => rows.push([t(section), label, value, closed, share]);

  add('Экспорт', t('Дата выгрузки'), options.exportedAt.toISOString());
  add('Экспорт', t('Сводка на'), summary.generatedAt);
  add('Метрики', t('Всего обращений'), summary.total);
  add('Метрики', t('Закрыто'), summary.closedCount);
  add('Метрики', t('Доля закрытых, %'), summary.closedShare * 100);
  add('Метрики', t('Среднее время первого ответа, ч'), summary.averageFirstResponseHours);
  add('Метрики', t('Обращений с первым ответом'), summary.respondedCount);
  if (summary.overdueCount !== undefined) add('Метрики', t('Просрочено'), summary.overdueCount);
  for (const item of summary.byType) add('Обращения по типам', typeLabel(item.type), item.count);
  for (const topic of summary.recurringTopics) add('Повторяющиеся темы', categoryLabel(topic.categoryId, topic.categoryName), topic.count);
  for (const item of summary.byDepartment ?? []) add('Обращения по подразделениям', departmentLabel(item.departmentId, item.departmentName), item.count, item.closedCount, item.closedShare * 100);
  for (const item of summary.avgResolutionHoursByCategory ?? []) add('Время решения по категориям, ч', categoryLabel(item.categoryId, item.categoryName), item.averageResolutionHours, item.closedCount);

  return BOM + rows.map(row => row.map(cell).join(CSV_SEPARATOR)).join('\r\n') + '\r\n';
}

/** Имя файла по дате выгрузки: summary-2026-11-13.csv. */
export const summaryCsvFileName = (exportedAt: Date) => `summary-${exportedAt.toISOString().slice(0, 10)}.csv`;
