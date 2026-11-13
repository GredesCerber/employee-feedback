import { useI18n } from '../i18n';
import { useState } from 'react';
import { Link, matchPath, useLocation } from 'react-router-dom';
import { useRevealOnView } from './designMotion';

/**
 * Честная демонстрация (R12, задача #116, идея #82).
 * Тексты шагов совпадают со сценарием в docs/tz-analysis.md, строки таблицы — с web/concept/prototype-approach.md
 * и api/concept/access.md. Расхождение с документами ловит тест web/tests/demo-honesty.test.tsx.
 */

export type DemoStep = { n: number; action: string; screen: string; path: string };

export const DEMO_STEPS: DemoStep[] = [
  { n: 1, path: '/submit', screen: 'Сотрудник · Новое обращение', action: 'Сотрудник закупок подаёт обращение: тип «Проблема», категория «Межотдельное взаимодействие», описание, предлагаемое решение, тестовый файл' },
  { n: 2, path: '/my', screen: 'Сотрудник · Мои обращения', action: 'Система сама назначает ответственного по категории; показываем случай, когда ответственного нет' },
  { n: 3, path: '/queue/:complaintId', screen: 'Руководитель · карточка обращения', action: 'Руководитель меняет статус, запрашивает уточнение, автор отвечает' },
  { n: 4, path: '/my/:complaintId', screen: 'Сотрудник · карточка обращения', action: 'Руководитель закрывает одно обращение решением, другое мотивированным отказом' },
  { n: 5, path: '/queue', screen: 'Руководитель · Очередь обращений', action: 'Руководитель фильтрует по подразделению, категории, статусу, сроку и находит просроченные' },
  { n: 6, path: '/summary', screen: 'Администратор · Сводка', action: 'Админ открывает сводку' },
];

/** Куда вести со ссылки «следующий шаг» и что подсказать про роль. */
const NEXT: Record<number, { to: string; label: string }> = {
  1: { to: '/my', label: 'Шаг 2: откройте «Мои обращения» и карточку, ответственный уже назначен' },
  2: { to: '/queue', label: 'Шаг 3: переключите роль на «Руководитель» и откройте обращение в очереди' },
  3: { to: '/my', label: 'Шаг 4: после решения переключитесь на «Сотрудник» и откройте итог' },
  4: { to: '/queue', label: 'Шаг 5: роль «Руководитель», фильтры очереди и просроченные' },
  5: { to: '/summary', label: 'Шаг 6: переключите роль на «Администратор» и откройте сводку' },
  6: { to: '/about', label: 'Итог: что в прототипе реально, а что имитация (О прототипе)' },
};

export function stepFor(pathname: string): DemoStep | undefined {
  return DEMO_STEPS.find(step => matchPath({ path: step.path, end: true }, pathname));
}

const STORAGE_KEY = 'demo-hints';
function readStored(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
}
function writeStored(value: boolean) {
  try { localStorage.setItem(STORAGE_KEY, value ? '1' : '0'); } catch { /* приватный режим или запрет хранилища: выбор живёт до перезагрузки */ }
}

/** Переключатель «Подсказки демо» с памятью в localStorage. */
export function useDemoHints() {
  const [enabled, setEnabled] = useState(readStored);
  return { enabled, set(value: boolean) { setEnabled(value); writeStored(value); } };
}

/** Плашка «Шаг N из 6» для текущего экрана. */
export function DemoHint() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const { state } = useLocation();
  const found = stepFor(pathname);
  const override = (state as { demoStep?: unknown } | null)?.demoStep;
  const step = found && found.path === '/my/:complaintId' && typeof override === 'number' ? DEMO_STEPS.find(item => item.n === override) ?? found : found;
  if (!step) return null;
  const next = NEXT[step.n]!;
  return <aside role="note" aria-label={t("Подсказка демо")} className="demo-hint">
    <p><strong>{t("Шаг")} {step.n} {t("из")} {DEMO_STEPS.length}:</strong> {t(step.action)}.</p>
    <p className="demo-hint-next"><Link to={next.to}>{t(next.label)}</Link></p>
  </aside>;
}

/** Бейдж «Имитация» с объяснением, что за ним нет настоящей системы. */
export function ImitationBadge({ hint, label = 'Имитация' }: { hint: string; label?: string }) {
  const { t } = useI18n();
  return <span className="imitation-badge" title={t(hint)}>{t(label)}<span className="visually-hidden">: {t(hint)}</span></span>;
}

export type AboutRow = {
  req: string;
  feature: string;
  source: 'prototype-approach' | 'access' | 'app';
  /** Колонки «Реализовано», «Имитация», «План развития» как в документе. */
  done?: string;
  imitation?: string;
  plan?: string;
  /** Что изменилось в текущей сборке относительно документа (показывается честно). */
  build?: string;
};

export const ABOUT_ROWS: AboutRow[] = [
  { req: 'R1', source: 'prototype-approach', feature: 'Форма подачи: тип, категория, описание, предполагаемое решение', done: '✓ сохраняется через API, выдаётся номер' },
  { req: 'R1', source: 'prototype-approach', feature: 'Вложение к обращению', done: '✓ небольшой файл-заглушка', plan: 'большие архивы, загрузка по частям, объектное хранилище' },
  { req: 'R2', source: 'prototype-approach', feature: 'Назначение ответственного по категории, запасной путь «без ответственного»', done: '✓ простые правила из таблицы категорий', plan: 'гибкие правила, замещение, загрузка из оргструктуры' },
  { req: 'R3', source: 'prototype-approach', feature: 'Статусы, сроки, история, запрос и ответ на уточнение', done: '✓' },
  { req: 'R4', source: 'prototype-approach', feature: 'Решение и мотивированный отказ, видимые автору', done: '✓' },
  { req: 'R5', source: 'prototype-approach', feature: 'Роли и права', done: '✓ проверка роли на API', imitation: 'вход: переключатель роли вместо логина', plan: 'SSO / учётки Битрикс24' },
  { req: 'R5', source: 'access', feature: 'Анонимная подача (скрытие имени от ответственного)', plan: 'флажок анонимной подачи в форме; согласование политики конфиденциальности перед пилотом', build: 'флажок «Подать анонимно» в форме уже есть, согласование политики перед пилотом впереди. Серверное скрытие автора описано отдельно в api/concept/access.md. Текст и вложения могут раскрыть автора' },
  { req: 'R2, R5', source: 'app', feature: 'Справочник «Категории и ответственные» у администратора', done: '✓ просмотр правил и сроков', plan: 'редактирование категорий и правил' },
  { req: 'R3, R4', source: 'app', feature: 'Шаблоны вопроса и решения для руководителя', done: '✓ подставляют текст в поле, человек правит и отправляет сам', plan: 'черновики на основе ИИ' },
  { req: 'R3, R4', source: 'app', feature: 'Подтверждение результата автором: «Понятен ли ответ?», «Решена ли проблема?»', done: '✓ оценка в карточке, видна руководителю и в эффекте пилота' },
  { req: 'R7, R9', source: 'app', feature: 'Лента «Вы предложили — мы сделали» и панель эффекта пилота', done: '✓ обезличенная лента, сравнение периодов, подтверждённые решения', plan: 'проверка эффекта на реальном пилоте' },
  { req: 'R7', source: 'app', feature: 'Общая проблема из нескольких обращений с планом', done: '✓ объединение решает руководитель, итог применяется ко всем открытым', plan: 'автоматическое предложение групп по смыслу' },
  { req: 'R6', source: 'app', feature: 'Эскалация зависших обращений и проверка ответа и обращения по правилам', done: '✓ уровни по просрочке; подсказки без ИИ, отправке не мешают', plan: 'автоматическое переназначение' },
  { req: 'R6', source: 'prototype-approach', feature: 'Поиск по номеру, фильтры, просроченные', done: '✓', plan: 'сохранённые фильтры', build: 'фильтры уже сохраняются в адресе страницы (#115)' },
  { req: 'R7', source: 'prototype-approach', feature: 'Сводка: типы, доля закрытых, время первого ответа, повторы', done: '✓ по тестовым датам', imitation: 'повторяющиеся темы: категории с двумя и более обращениями', plan: 'семантический поиск дублей' },
  { req: 'R8', source: 'prototype-approach', feature: 'Уведомления автору и ответственным', imitation: '✓ список событий и значок внутри приложения', plan: 'email, Битрикс24', build: 'колокольчик показывает счётчик событий и ссылки на карточки; доставка за пределы приложения имитируется' },
  { req: 'R1, R7', source: 'prototype-approach', feature: 'ИИ-помощник (подсказка категории, черновик ответа)', done: '✓ похожие обращения, подсказка категории и агрегатная сводка', imitation: '✓ записанные примеры, локальные правила и шаблон сводки без ключа', plan: 'черновик ответа; согласование провайдера и политики данных для пилота (ТЗ п. 3.5)', build: 'живая модель включается опционально серверным ключом: метка «ИИ». Без ключа или при сбое используются «Демо ИИ», «Правила (без ИИ)» и «Шаблон (без ИИ)»; черновика ответа пока нет' },
  { req: 'R9', source: 'app', feature: 'Концепция, пользователи, граница MVP и план развития', done: 'материалы защиты и docs/' },
  { req: 'R10', source: 'app', feature: 'Прототип интерфейса: основные экраны и переходы', done: '✓ этот интерфейс: подача, мои обращения, карточка, очередь, сводка' },
  { req: 'R11', source: 'prototype-approach', feature: 'Интеграция с 1С УТ и Битрикс24', plan: 'описание в техконцепции (R11), реализация после уточнений' },
  { req: 'R12', source: 'app', feature: 'Честная демонстрация: что реально, что имитация, что план', done: '✓ бейджи «Имитация», подсказки шагов и эта страница' },
  { req: 'R13', source: 'prototype-approach', feature: 'Опросы, NPS, клиентская обратная связь', plan: 'R13, после проверки внутреннего процесса' },
];

export function AboutPage() {
  const reveal = useRevealOnView<HTMLDivElement>();
  const { t } = useI18n();
  return <section className="section"><p className="eyebrow">{t("Честная демонстрация")}</p><h1>{t("О прототипе")}</h1>
    <p className="muted">{t("Что в этом прототипе работает по-настоящему, что показано имитацией и что остаётся в плане развития. Данные только синтетические.")}</p>
    <div ref={reveal} className="about-table-wrap reveal-panel" role="region" tabIndex={0} aria-label={t("Реализовано, имитация, план")}><table className="about-table" aria-label={t("Реализовано, имитация, план")}>
      <thead><tr><th scope="col">{t("Требование")}</th><th scope="col">{t("Функция")}</th><th scope="col">{t("Реализовано")}</th><th scope="col">{t("Имитация")}</th><th scope="col">{t("План")}</th></tr></thead>
      <tbody>{ABOUT_ROWS.map(row => <tr key={`${row.req}-${t(row.feature)}`}>
        <td>{row.req}</td>
        <th scope="row">{t(row.feature)}{row.build && <p className="about-build">{t("Сейчас:")} {t(row.build)}</p>}</th>
        <td>{row.done ? t(row.done) : '—'}</td><td>{row.imitation ? t(row.imitation) : '—'}</td><td>{row.plan ? t(row.plan) : '—'}</td>
      </tr>)}</tbody>
    </table></div>
  </section>;
}
