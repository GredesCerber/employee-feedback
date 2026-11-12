import { useI18n } from '../i18n';

/** Подсказки без ИИ и сети: простые правила по тексту. Ничего не блокируют, решение остаётся за человеком. */
const REASON = /(потому|причин|так как|поскольку|из-за|в связи|не соответству|противореч|нет (?:возможности|бюджета|ресурс))/i;
const NEXT = /(срок|до \d|будет|планиру|следующ|после этого|в течение|обратитесь|напишите)/i;

export function answerQualityHints(explanation: string, outcome: string, actions: string): string[] {
  const text = explanation.trim();
  if (!text) return [];
  const hints: string[] = [];
  if (text.length < 40) hints.push('Ответ слишком короткий: не указано, что именно сделано или решено.');
  if (outcome === 'rejected' && !REASON.test(text)) hints.push('Причина отказа слишком общая: назовите конкретную причину.');
  if (outcome !== 'rejected' && !actions.trim() && !NEXT.test(text)) hints.push('Не описан следующий шаг или срок: что произойдёт дальше?');
  return hints;
}

export function AnswerQualityHints({ explanation, outcome, actions }: { explanation: string; outcome: string; actions: string }) {
  const { t } = useI18n();
  const hints = answerQualityHints(explanation, outcome, actions);
  return <div className="quality-hints" aria-live="polite">{hints.length > 0 && <>
    <p className="muted">{t("Проверка ответа перед отправкой (подсказки, отправке не мешают):")}</p>
    <ul>{hints.map(hint => <li key={hint}>{t(hint)}</li>)}</ul>
  </>}</div>;
}

const FREQUENCY = /(раз|част|кажд|ежедневн|постоянн|иногда|всегда|регулярн|обычно|снова|опять)/i;
const EXPECTATION = /(хочу|хотелось|нужн|ожида|предлага|надо|должн|пусть|желательно|было бы)/i;

export function completenessHints(description: string, solution: string): string[] {
  const text = description.trim();
  if (text.length < 15) return [];
  const hints: string[] = [];
  if (text.length < 80) hints.push('Добавьте пример: когда и где это случилось, номер заявки или документа.');
  if (!FREQUENCY.test(text)) hints.push('Как часто это происходит: один раз или регулярно?');
  if (!EXPECTATION.test(text) && !solution.trim()) hints.push('Какой результат вы ожидаете? Опишите его в тексте или в поле «Предлагаемое решение».');
  return hints;
}

/** Помощник полноты обращения: подсказывает, что стоит добавить; отправку не блокирует. */
export function CompletenessHints({ description, solution }: { description: string; solution: string }) {
  const { t } = useI18n();
  const hints = completenessHints(description, solution);
  return <div className="quality-hints completeness-hints" aria-live="polite">{hints.length > 0 && <>
    <p className="muted">{t("Что стоит добавить, чтобы обращение быстрее разобрали (необязательно):")}</p>
    <ul>{hints.map(hint => <li key={hint}>{t(hint)}</li>)}</ul>
  </>}</div>;
}
