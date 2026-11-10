import type { components } from '../api/client';

export type Complaint = components['schemas']['Complaint'];
export const statusLabels: Record<Complaint['status'], string> = {
  new: 'Новое', in_review: 'На рассмотрении', in_progress: 'В работе',
  awaiting_clarification: 'Ожидает уточнения', implemented: 'Реализовано', rejected: 'Отклонено', closed: 'Закрыто',
};
export const typeLabels: Record<Complaint['type'], string> = { problem: 'Проблема', suggestion: 'Предложение', praise: 'Благодарность' };
export function dateLabel(value: string) {
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
export function StatusBadge({ status }: { status: Complaint['status'] }) {
  return <span className={`status-badge status-${status}`}>{statusLabels[status]}</span>;
}
export function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return <div className="load-error"><p role="alert">{message}</p><button type="button" onClick={retry}>Повторить</button></div>;
}
