import { useI18n } from '../i18n';
import { statusLabels, type Complaint } from './complaint';

/**
 * Шкала статуса (#312 A1): Подано → На рассмотрении → В работе → Итог.
 * Статусы и переходы — из контракта (api/policy.ts): new → in_review ⇄ in_progress → implemented | rejected | closed;
 * awaiting_clarification — отдельная ветка от того шага, где запросили уточнение, возврат только в in_review.
 */
type Status = Complaint['status'];
export type StepState = 'done' | 'current' | 'upcoming' | 'skipped';
export type ProgressStep = { key: 'submitted' | 'in_review' | 'in_progress' | 'outcome'; label: string; state: StepState; tone?: Status };
export type ProgressModel = { steps: ProgressStep[]; clarification: boolean };

const terminal: readonly Status[] = ['implemented', 'rejected', 'closed'];
const stepIndex: Partial<Record<Status, number>> = { new: 0, in_review: 1, in_progress: 2 };
const stepKeys = ['submitted', 'in_review', 'in_progress', 'outcome'] as const;
const stepLabels = ['Подано', 'На рассмотрении', 'В работе', 'Итог'];

export function progressModel(item: Pick<Complaint, 'status' | 'history'>): ProgressModel {
  const { status, history } = item;
  const clarification = status === 'awaiting_clarification';
  let current: number;
  if (terminal.includes(status)) current = 3;
  else if (clarification) {
    // Ветка уточнения растёт из шага, на котором его запросили.
    const from = [...history].reverse().find(event => event.toStatus === 'awaiting_clarification')?.fromStatus;
    current = (from && stepIndex[from]) ?? 1;
  } else current = stepIndex[status] ?? 0;
  // Шаг считается пройденным, только если обращение действительно было в этом статусе (например, new → rejected пропускает работу).
  const visited = new Set<Status>(['new']);
  for (const event of history) if (event.toStatus) visited.add(event.toStatus);
  const reached = [true, visited.has('in_review'), visited.has('in_progress')];
  const steps = stepKeys.map((key, index): ProgressStep => {
    const state: StepState = index === current ? 'current' : index > current ? 'upcoming' : reached[index] ? 'done' : 'skipped';
    if (key === 'outcome' && terminal.includes(status)) return { key, label: statusLabels[status], state, tone: status };
    return { key, label: stepLabels[index]!, state };
  });
  return { steps, clarification };
}

const stateLabels: Record<StepState, string> = { done: 'пройден', current: 'текущий шаг', upcoming: 'впереди', skipped: 'пропущен' };

export function StatusProgress({ item }: { item: Pick<Complaint, 'status' | 'history'> }) {
  const { t } = useI18n();
  const model = progressModel(item);
  return <nav className="status-progress" aria-label={t('Ход рассмотрения')}>
    <ol>
      {model.steps.map((step, index) => <li key={step.key} className={`status-step is-${step.state}${step.tone ? ` tone-${step.tone}` : ''}`} aria-current={step.state === 'current' ? 'step' : undefined}>
        <span className="status-step-marker" aria-hidden="true">{step.state === 'done' ? '✓' : step.state === 'skipped' ? '–' : index + 1}</span>
        <span className="status-step-text">
          <span className="status-step-label">{t(step.label)}</span>
          <span className="visually-hidden">, {t(stateLabels[step.state])}</span>
          {step.state === 'current' && model.clarification && <span className="status-step-branch">{t('Ветка: ждём уточнения от автора')}<span className="status-step-branch-hint">{t('Рассмотрение продолжится после ответа автора.')}</span></span>}
        </span>
      </li>)}
    </ol>
  </nav>;
}
