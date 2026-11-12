import { describe, expect, it } from 'vitest';
import { answerQualityHints, completenessHints } from '../src/features/qualityHints';
import { escalationLevel, escalatedCount } from '../src/features/escalation';

describe('проверка качества ответа', () => {
  it('молчит на пустом тексте и хвалит развёрнутый ответ', () => {
    expect(answerQualityHints('', 'rejected', '')).toEqual([]);
    expect(answerQualityHints('Мы обновили регламент закупок, новая версия доступна в разделе документов и будет проверена до пятницы.', 'implemented', '')).toEqual([]);
  });
  it('ловит короткий ответ, общую причину отказа и отсутствие следующего шага', () => {
    expect(answerQualityHints('Нельзя.', 'rejected', '')).toEqual(expect.arrayContaining([
      expect.stringContaining('слишком короткий'), expect.stringContaining('Причина отказа')]));
    expect(answerQualityHints('Отказываем, потому что это противоречит политике закупок компании.', 'rejected', '')).toEqual([]);
    expect(answerQualityHints('Мы изменили порядок согласования заявок в системе.', 'implemented', '')).toEqual([expect.stringContaining('следующий шаг')]);
    expect(answerQualityHints('Мы изменили порядок согласования заявок в системе.', 'implemented', 'Сообщить отделам')).toEqual([]);
  });
});

describe('помощник полноты обращения', () => {
  it('ничего не говорит о слишком коротком черновике', () => expect(completenessHints('Печать', '')).toEqual([]));
  it('просит пример, частоту и ожидаемый результат', () => {
    expect(completenessHints('Не работает принтер на этаже.', '')).toHaveLength(3);
    expect(completenessHints('Каждую неделю в бухгалтерии не работает принтер на третьем этаже, заявки приходится печатать в другом офисе. Нужно починить.', '')).toEqual([]);
    expect(completenessHints('Не работает принтер на этаже.', 'Заменить картридж')).toHaveLength(2);
  });
});

describe('эскалация зависших', () => {
  it('уровни по часам просрочки', () => {
    expect([0, 0.5, 1, 47, 48, 119, 120, 500].map(escalationLevel)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    expect(escalationLevel(Number.NaN)).toBe(0);
    expect(escalatedCount([{ overdueHours: 10 }, { overdueHours: 60 }, { overdueHours: 200 }])).toBe(2);
  });
});
