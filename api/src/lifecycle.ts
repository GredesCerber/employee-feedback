import type { FastifyInstance } from 'fastify';
import type { Comment, Complaint, Decision, HistoryEvent, Status, User } from './model.js';
import { terminalStatuses } from './model.js';
import { ApiError, contract, identity, queryParameters, validateBody, isSimulated, visibleComplaint } from './http.js';
import { presentFor, recordAction, snapshot } from './undo.js';

const transitions = contract['x-status-transitions'] as Record<Status, Status[]>;
function conflict(message: string): never { throw new ApiError(409, 'INVALID_TRANSITION', message); }
function assertOpen(item: Complaint) {
  if (terminalStatuses.includes(item.status)) conflict('Завершённое обращение нельзя изменить.');
}
function assertTransition(item: Complaint, target: Status) {
  if (!transitions[item.status].includes(target)) conflict(`Переход ${item.status} → ${target} недопустим.`);
}
function timestamp(item: Complaint): string {
  return new Date(Math.max(Date.now(), Date.parse(item.updatedAt))).toISOString();
}
export function appendHistory(item: Complaint, actor: User, createdAt: string, kind: HistoryEvent['kind'],
  text: string, fromStatus: Status | null = null, toStatus: Status | null = null, simulated = false) {
  item.history.push({ id: `${item.id}-event-${String(item.history.length + 1).padStart(6, '0')}`,
    kind, actor, createdAt, fromStatus, toStatus, text, simulated });
}
export function update(item: Complaint, actor: User, now: string) {
  item.updatedAt = now;
  if (actor.role === 'manager') item.firstResponseAt ??= now;
  item.nextAction = item.status === 'awaiting_clarification' ? 'Автору нужно ответить на запрос уточнения.'
    : terminalStatuses.includes(item.status) ? 'Рассмотрение завершено. Ознакомьтесь с решением.'
    : item.status === 'in_progress' ? 'Ответственный выполняет согласованные действия.'
    : item.status === 'new' ? (item.assignee ? 'Ответственный рассмотрит обращение до указанного срока.' : 'Ожидается назначение ответственного руководителем.')
    : 'Ответственный рассматривает обращение.';
}

export function registerLifecycle(app: FastifyInstance) {
  app.patch<{ Params: { complaintId: string } }>('/complaints/:complaintId/status', async request => {
    const user = identity(app, request, ['manager']);
    queryParameters(request, []);
    const body = validateBody<{ status: 'in_review' | 'in_progress' }>('StatusInput', request.body);
    const item = visibleComplaint(app, request.params.complaintId, user);
    assertTransition(item, body.status);
    const now = timestamp(item), previous = item.status;
    const before = snapshot(item), lengthBefore = item.history.length;
    item.status = body.status;
    appendHistory(item, user, now, 'status_changed', 'Руководитель изменил статус.', previous, item.status, isSimulated(request));
    update(item, user, now);
    app.store.save(item);
    recordAction(app, item, user, before, lengthBefore);
    return presentFor(app, item, user);
  });

  app.post<{ Params: { complaintId: string } }>('/complaints/:complaintId/comments', async (request, reply) => {
    const user = identity(app, request, ['employee', 'manager']);
    queryParameters(request, []);
    const body = validateBody<{ kind: Comment['kind']; text: string }>('CommentInput', request.body);
    const item = visibleComplaint(app, request.params.complaintId, user);
    if ((user.role === 'employee' && body.kind === 'clarification_request')
      || (user.role === 'manager' && body.kind === 'clarification_response')) {
      throw new ApiError(403, 'FORBIDDEN', 'Роль не разрешает этот вид комментария.');
    }
    assertOpen(item);
    let target = item.status;
    if (body.kind === 'clarification_request') {
      target = 'awaiting_clarification';
      assertTransition(item, target);
    } else if (body.kind === 'clarification_response') {
      if (item.status !== 'awaiting_clarification') conflict('Нет открытого запроса уточнения.');
      target = 'in_review';
    }
    const now = timestamp(item), previous = item.status;
    const text = body.text.trim();
    item.comments.push({ id: `${item.id}-comment-${String(item.comments.length + 1).padStart(6, '0')}`,
      author: user, kind: body.kind, text, createdAt: now });
    appendHistory(item, user, now, 'commented', text, null, null, isSimulated(request));
    if (target !== previous) {
      item.status = target;
      appendHistory(item, user, now, 'status_changed', body.kind === 'clarification_request'
        ? 'Запрошено уточнение у автора.' : 'Автор ответил на запрос уточнения.', previous, target, isSimulated(request));
    }
    update(item, user, now);
    app.store.save(item);
    return reply.code(201).send(presentFor(app, item, user));
  });

  app.post<{ Params: { complaintId: string } }>('/complaints/:complaintId/decision', async (request, reply) => {
    const user = identity(app, request, ['manager']);
    queryParameters(request, []);
    const body = validateBody<{ outcome: Decision['outcome']; explanation: string; actions?: string }>('DecisionInput', request.body);
    const item = visibleComplaint(app, request.params.complaintId, user);
    assertTransition(item, body.outcome);
    const now = timestamp(item), previous = item.status;
    item.decision = { outcome: body.outcome, explanation: body.explanation.trim(), actions: body.actions?.trim() ?? null,
      author: user, createdAt: now };
    item.status = body.outcome;
    item.closedAt = now;
    appendHistory(item, user, now, 'decided', item.decision.explanation, previous, item.status, isSimulated(request));
    update(item, user, now);
    app.store.save(item);
    if (item.problem && (body.outcome === 'implemented' || body.outcome === 'rejected')) propagateDecision(app, item, user, now, isSimulated(request));
    return reply.code(201).send(presentFor(app, item, user));
  });
}

/** Shared problem: the same implemented or rejected decision applies to the other open complaints linked to it. */
function propagateDecision(app: FastifyInstance, source: Complaint, user: User, now: string, simulated: boolean) {
  const decision = source.decision!;
  for (const other of app.store.list()) {
    if (other.id === source.id || other.problem?.id !== source.problem!.id || terminalStatuses.includes(other.status)) continue;
    if (!transitions[other.status].includes(decision.outcome)) {
      if (other.status !== 'new') continue;
      appendHistory(other, user, now, 'status_changed', 'Рассмотрение начато в рамках общей проблемы.', 'new', 'in_review', simulated);
      other.status = 'in_review';
    }
    const previous = other.status;
    other.decision = { outcome: decision.outcome, explanation: decision.explanation, actions: decision.actions, author: user, createdAt: now };
    other.status = decision.outcome;
    other.closedAt = now;
    appendHistory(other, user, now, 'decided', `${decision.explanation} (Решено в рамках общей проблемы «${source.problem!.title}».)`, previous, other.status, simulated);
    update(other, user, now);
    app.store.save(other);
  }
}
