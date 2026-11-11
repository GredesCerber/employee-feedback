import type { FastifyInstance } from 'fastify';
import type { Complaint, User } from './model.js';
import { terminalStatuses } from './model.js';
import type { ComplaintStore } from './store.js';
import { ApiError, identity, present, queryParameters, visibleComplaint } from './http.js';

const DEFAULT_WINDOW_S = 600;

/** Undo window in milliseconds: env UNDO_WINDOW_S (positive integer), default 600 seconds. */
export function undoWindowMs(): number {
  const raw = process.env.UNDO_WINDOW_S;
  const seconds = raw !== undefined && /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : DEFAULT_WINDOW_S;
  return (seconds > 0 ? seconds : DEFAULT_WINDOW_S) * 1000;
}

type Before = Pick<Complaint, 'status' | 'assignee' | 'routing' | 'firstResponseAt' | 'dueAt' | 'nextAction'>;
interface Entry { actorId: string; at: number; before: Before }
/** Per complaint: stack of undoable actions and the history length right after the last tracked write. */
interface State { entries: Entry[]; expectedLength: number }

const states = new WeakMap<ComplaintStore, Map<string, State>>();
function stateOf(app: FastifyInstance, id: string): State | undefined { return states.get(app.store)?.get(id); }

export function snapshot(item: Complaint): Before {
  return structuredClone({ status: item.status, assignee: item.assignee, routing: item.routing,
    firstResponseAt: item.firstResponseAt, dueAt: item.dueAt, nextAction: item.nextAction });
}

/**
 * Remember an eligible manager action (status change or assignment) that has just been saved.
 * `before` is the snapshot and `lengthBefore` the history length taken before the mutation.
 * If anything else (comment, decision, other write) happened since the last tracked write, older entries are dropped.
 */
export function recordAction(app: FastifyInstance, item: Complaint, actor: User, before: Before, lengthBefore: number): void {
  let map = states.get(app.store);
  if (!map) { map = new Map(); states.set(app.store, map); }
  let state = map.get(item.id);
  if (!state || state.expectedLength !== lengthBefore) { state = { entries: [], expectedLength: 0 }; map.set(item.id, state); }
  state.entries.push({ actorId: actor.id, at: Date.parse(item.updatedAt), before });
  state.expectedLength = item.history.length;
}

function topEntry(app: FastifyInstance, item: Complaint, user: User): Entry | null {
  const state = stateOf(app, item.id);
  const entry = state?.entries.at(-1);
  if (!state || !entry || state.expectedLength !== item.history.length) return null;
  if (entry.actorId !== user.id || terminalStatuses.includes(item.status)) return null;
  return entry;
}

/** Complaint as seen by the given user: managers also get canUndo / undoExpiresAt. */
export function presentFor(app: FastifyInstance, item: Complaint, user: User, now = Date.now()): Complaint {
  const view = present(item, now);
  if (user.role !== 'manager') return view;
  const entry = topEntry(app, item, user);
  const deadline = entry ? entry.at + undoWindowMs() : 0;
  const available = entry !== null && now < deadline;
  return { ...view, canUndo: available, undoExpiresAt: available ? new Date(deadline).toISOString() : null };
}

export function registerUndo(app: FastifyInstance) {
  app.post<{ Params: { complaintId: string } }>('/complaints/:complaintId/undo', async request => {
    const user = identity(app, request, ['manager']);
    queryParameters(request, []);
    const item = visibleComplaint(app, request.params.complaintId, user);
    const entry = topEntry(app, item, user);
    if (!entry) throw new ApiError(409, 'NOTHING_TO_UNDO', 'Нет доступного для отмены действия.');
    const nowMs = Date.now();
    if (nowMs >= entry.at + undoWindowMs()) throw new ApiError(409, 'UNDO_EXPIRED', 'Время отмены действия истекло.');
    const now = new Date(Math.max(nowMs, Date.parse(item.updatedAt))).toISOString();
    const previousStatus = item.status;
    Object.assign(item, structuredClone(entry.before));
    item.updatedAt = now;
    item.history.push({ id: `${item.id}-event-${String(item.history.length + 1).padStart(6, '0')}`,
      kind: 'undone', actor: user, createdAt: now, fromStatus: previousStatus, toStatus: item.status,
      text: 'Руководитель отменил последнее действие.' });
    app.store.save(item);
    const state = stateOf(app, item.id)!;
    state.entries.pop();
    state.expectedLength = item.history.length;
    return presentFor(app, item, user);
  });
}
