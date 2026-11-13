import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { buildSummaryCsv, CSV_SEPARATOR, isSummaryEmpty } from '../src/features/summaryCsv';
import SummaryPage from '../src/pages/SummaryPage';

const full = {
  total: 3, byType: [{ type: 'problem' as const, count: 2 }, { type: 'idea' as const, count: 1 }], closedCount: 1, closedShare: 1 / 3,
  averageFirstResponseHours: 2.25, respondedCount: 2, generatedAt: '2026-11-10T10:00:00Z', overdueCount: 1,
  recurringTopics: [{ categoryId: 'safety', categoryName: 'Безопасность; "цех"', count: 2 }],
  byDepartment: [{ departmentId: 'd1', departmentName: '=Склад', count: 3, closedCount: 1, closedShare: 1 / 3 }],
  avgResolutionHoursByCategory: [{ categoryId: 'safety', categoryName: 'Безопасность', closedCount: 0, averageResolutionHours: null }],
};
const empty = { total: 0, byType: [], closedCount: 0, closedShare: 0, averageFirstResponseHours: null, respondedCount: 0, recurringTopics: [], generatedAt: '2026-11-10T10:00:00Z' };

describe('#346 summary CSV builder', () => {
  const csv = buildSummaryCsv(full as never, { exportedAt: new Date('2026-11-13T08:30:00Z') });
  const lines = csv.slice(1).split('\r\n');

  it('starts with a UTF-8 BOM and uses ; with CRLF line endings', () => {
    expect(CSV_SEPARATOR).toBe(';');
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(lines[0]).toBe('Раздел;Показатель;Значение;Закрыто;Доля закрытых, %');
  });

  it('includes the export date, snapshot date and the main metrics', () => {
    expect(lines).toContain('Экспорт;Дата выгрузки;2026-11-13T08:30:00.000Z;;');
    expect(lines).toContain('Экспорт;Сводка на;2026-11-10T10:00:00Z;;');
    expect(lines).toContain('Метрики;Всего обращений;3;;');
    expect(lines).toContain('Метрики;Доля закрытых, %;33,3;;');
    expect(lines).toContain('Метрики;Среднее время первого ответа, ч;2,3;;');
    expect(lines).toContain('Метрики;Просрочено;1;;');
    expect(lines).toContain('Обращения по типам;problem;2;;');
  });

  it('escapes separators and quotes and neutralises spreadsheet formulas', () => {
    expect(lines).toContain('Повторяющиеся темы;"Безопасность; ""цех""";2;;');
    expect(lines).toContain("Обращения по подразделениям;'=Склад;3;1;33,3");
    expect(lines).toContain('Время решения по категориям, ч;Безопасность;;0;');
  });

  it('applies translation and label callbacks', () => {
    const en = buildSummaryCsv(full as never, { exportedAt: new Date(0), t: key => (key === 'Раздел' ? 'Section' : key), typeLabel: type => `type:${type}` });
    expect(en).toContain('Section;');
    expect(en).toContain('type:problem');
  });

  it('treats a summary without complaints as empty', () => {
    expect(isSummaryEmpty(empty as never)).toBe(true);
    expect(isSummaryEmpty(full as never)).toBe(false);
  });
});

const session = vi.hoisted(() => ({ role: 'manager', api: { GET: async () => ({ data: { total: 0, byType: [], closedCount: 0, closedShare: 0, averageFirstResponseHours: null, respondedCount: 0, recurringTopics: [], generatedAt: '2026-11-10T10:00:00Z' } }) } }));
vi.mock('../src/app/session', () => ({ useSession: () => session }));
vi.mock('../src/i18n', async importOriginal => ({ ...(await importOriginal<typeof import('../src/i18n')>()), useI18n: () => ({ locale: 'ru', t: (key: string) => key }) }));
afterEach(cleanup);

describe('#346 summary export buttons', () => {
  it('shows a clear message instead of exporting or printing an empty summary', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    render(<MemoryRouter><SummaryPage /></MemoryRouter>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Скачать CSV' }));
    expect(screen.getByText('Нет данных для выгрузки: обращений пока нет.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Печать' }));
    expect(print).not.toHaveBeenCalled();
    print.mockRestore();
  });
});
