import { referenceLabel, useI18n } from '../i18n';
import './submitForm.css';

/**
 * Части формы подачи (#312 A3, A4): счётчик символов и карточки категорий с примерами.
 * Лимиты совпадают с contracts/api.yaml → CreateComplaint (description, proposedSolution: maxLength 5000);
 * тест web/tests/submit-form-ux.test.tsx сверяет их с контрактом.
 */
export const SUBMIT_LIMITS = { description: 5000, proposedSolution: 5000 } as const;
/** С этой доли лимита счётчик переходит в состояние предупреждения. */
export const COUNTER_WARNING_RATIO = 0.9;

export function counterWarning(length: number, max: number): boolean {
  return length >= Math.floor(max * COUNTER_WARNING_RATIO);
}

/** Видимый счётчик «n / max». Связывается с полем через aria-describedby по id. */
export function CharCounter({ id, length, max }: { id: string; length: number; max: number }) {
  const { t } = useI18n();
  const warning = counterWarning(length, max);
  return <p id={id} className={`char-counter${warning ? ' is-warning' : ''}`} data-state={warning ? 'warning' : 'ok'}>
    <span>{length} / {max}</span>
    {warning && <span className="char-counter-left"> · {t('Осталось символов: {n}', { n: Math.max(0, max - length) })}</span>}
    <span className="visually-hidden" aria-live="polite">{warning ? t('Текст близок к лимиту: не больше {max} символов.', { max }) : ''}</span>
  </p>;
}

/** Короткие примеры живыми словами по id категории из seed. Категории без примера доступны в списке «Категория». */
export const CATEGORY_EXAMPLES: Record<string, string> = {
  cross_department: 'Заявки между отделами приходят без нужных данных',
  transparency: 'Непонятно, на какой стадии проект',
  catalog: 'Одно изделие в материалах называют по-разному',
  training: 'Нужно занятие по новой товарной линейке',
  documents: 'Неясно, у кого сейчас документ на согласовании',
  regulations: 'Нет пошаговой памятки для операции',
  it: 'Одни и те же данные вводим в разные системы',
  mentoring: 'Новичку не хватает разбора типовых ошибок',
  contracts: 'Непонятно, кто готовит приложение к договору',
  tasks: 'Задачу закрыли, не дождавшись подтверждения',
  responsiveness: 'Смежный отдел долго отвечает на срочный запрос',
  communication: 'Обсуждения разбросаны по разным каналам',
  projects: 'Состав оборудования изменили, а спецификацию — нет',
  resources: 'Не видно загрузки проектной группы',
  task_definition: 'Поручение пришло без срока и ожидаемого результата',
  environment: 'Негде сделать короткий перерыв',
  document_storage: 'Трудно найти актуальную редакцию инструкции',
  results: 'Не видно, какие улучшения уже сделаны',
};

type Category = { id: string; name: string };

/**
 * Карточки категорий — радиогруппа (стрелки переключают выбор). Значение общее со списком «Категория»,
 * который остаётся запасным вариантом. Подсказанная категория выделяется рамкой и меткой.
 */
export function CategoryCards({ categories, value, suggestedId, onChange }: {
  categories: readonly Category[]; value: string; suggestedId?: string; onChange: (id: string) => void;
}) {
  const { t, locale } = useI18n();
  const cards = categories.filter(category => CATEGORY_EXAMPLES[category.id]);
  if (!cards.length) return null;
  return <fieldset className="category-cards" aria-describedby="category-cards-hint">
    <legend>{t('На что похожа ситуация?')}</legend>
    <p className="field-hint" id="category-cards-hint">{t('Выберите карточку или категорию из полного списка ниже.')}</p>
    <div className="category-cards-grid">
      {cards.map(category => {
        const selected = value === category.id;
        const suggested = suggestedId === category.id;
        return <label key={category.id} className={`category-card${selected ? ' is-selected' : ''}${suggested ? ' is-suggested' : ''}`} data-category={category.id}>
          <input type="radio" name="category-card" value={category.id} checked={selected} onChange={() => onChange(category.id)} />
          <span className="category-card-body">
            <span className="category-card-name">{referenceLabel(locale, 'category', category.id, category.name)}</span>
            <span className="category-card-example">{t(CATEGORY_EXAMPLES[category.id]!)}</span>
            {suggested && <span className="category-card-tag">{t('Предложено подсказкой')}</span>}
          </span>
        </label>;
      })}
    </div>
  </fieldset>;
}
