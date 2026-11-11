import type { components } from '../api/client';
import type { Complaint } from './complaint';

type ReferenceData = components['schemas']['ReferenceData'];
type CommentKind = components['schemas']['Comment']['kind'];
type Actor = Complaint['author'];

export const priorityLabels: Record<Complaint['priority'], string> = { low: 'Низкий', medium: 'Средний', high: 'Высокий' };

/** Как назначен ответственный: подпись для каждого значения `routing.reason`. */
export const routingReasonLabels: Record<Complaint['routing']['reason'], string> = {
  category_rule: 'Автоматически по правилу категории',
  no_rule: 'Правила для категории нет — запасная очередь',
  manual_assignment: 'Назначено вручную руководителем',
};

export const fallbackQueueHint = 'Обращение в запасной очереди: для категории не настроено правило назначения. Руководитель назначит ответственного вручную.';

export const commentKindLabels: Record<CommentKind, string> = {
  comment: 'Комментарий',
  clarification_request: 'Запрос уточнения',
  clarification_response: 'Ответ автора',
};

export function CommentKindBadge({ kind }: { kind: CommentKind }) {
  return <span className={`comment-kind comment-kind-${kind}`}>{commentKindLabels[kind]}</span>;
}

/** Анонимный автор (`AnonymousActor`) приходит без id и показывается как «Аноним». */
export function isAnonymousActor(actor: Actor): actor is components['schemas']['AnonymousActor'] {
  return !('id' in actor);
}
export function authorLabel(item: Complaint) {
  if (isAnonymousActor(item.author)) return 'Аноним';
  return item.anonymous ? `${item.author.name} (анонимно для руководителей)` : item.author.name;
}

/** Бейдж «Анонимно»: автор скрыт от других читателей (`anonymous: true`). */
export function AnonymousBadge() {
  return <span className="anonymous-badge">Анонимно</span>;
}

/** Название из справочника вместо id. Пока справочник грузится — многоточие, если записи нет — сам id. */
export function referenceName(list: readonly { id: string; name: string }[] | undefined, id: string, loading: boolean) {
  return list?.find(entry => entry.id === id)?.name ?? (loading ? '…' : id);
}
export type { ReferenceData };
