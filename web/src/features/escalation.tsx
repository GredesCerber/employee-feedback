import { useI18n } from '../i18n';

/** Эскалация зависших обращений: уровень зависит от того, насколько давно прошёл срок (часы просрочки). */
export type EscalationLevel = 0 | 1 | 2 | 3;
export const ESCALATION_HOURS = { reminder: 1, manager: 48, admin: 120 } as const;

export function escalationLevel(overdueHours: number): EscalationLevel {
  if (!Number.isFinite(overdueHours) || overdueHours < ESCALATION_HOURS.reminder) return 0;
  if (overdueHours >= ESCALATION_HOURS.admin) return 3;
  if (overdueHours >= ESCALATION_HOURS.manager) return 2;
  return 1;
}

const labels: Record<Exclude<EscalationLevel, 0>, string> = {
  1: 'Напоминание ответственному',
  2: 'Эскалация: руководитель направления',
  3: 'Эскалация: администратор',
};

/** Уровень выражен текстом, а не только цветом. */
export function EscalationBadge({ overdueHours }: { overdueHours: number }) {
  const { t } = useI18n();
  const level = escalationLevel(overdueHours);
  if (level === 0) return null;
  return <span className={`escalation-badge escalation-${level}`}>{t(labels[level])}</span>;
}

export function escalatedCount(items: { overdueHours: number }[]) {
  return items.filter(item => escalationLevel(item.overdueHours) >= 2).length;
}
