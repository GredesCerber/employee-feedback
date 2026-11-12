import type { FastifyInstance } from 'fastify';
import type { Complaint, Status, User } from './model.js';
import { terminalStatuses } from './model.js';
import { contract, identity, invalid, queryParameters } from './http.js';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { fullFormats } from 'ajv-formats/dist/formats.js';

const DISCLAIMER = 'Имитация: в промышленной версии email / Битрикс24';
const DAY = 86400000;
const sinceValidator = new Ajv2020({ strict: false, formats: fullFormats }).compile(
  (contract.paths['/notifications'].get.parameters as { name: string; schema: Record<string, unknown> }[])
    .find(parameter => parameter.name === 'since')!.schema);

type Kind = 'clarification_requested' | 'decision_recorded' | 'unassigned' | 'clarification_received' | 'due_soon'
  | 'status_changed' | 'overdue';
interface Event { id: string; kind: Kind; complaintId: string; complaintNumber: string; createdAt: string;
  message: string; href: string; simulated: true; disclaimer: string }

const safeId = (value: string) => value.replace(/[^A-Za-z0-9_-]/g, '_');
/** Status changes the author is told about while the complaint is open; clarification and decision have their own kinds. */
const statusMessages: Partial<Record<Status, (number: string) => string>> = {
  in_review: number => `Обращение ${number} принято на рассмотрение.`,
  in_progress: number => `Обращение ${number} взято в работу.`,
};

/** Events are derived from complaint history; messages carry only the number, never author data. */
function eventsFor(user: User, items: Complaint[], now: number): Event[] {
  const events: Event[] = [];
  const base = (item: Complaint) => ({ complaintId: item.id, complaintNumber: item.number,
    href: `/${user.role === 'employee' ? 'my' : 'queue'}/${item.id}`, simulated: true as const, disclaimer: DISCLAIMER });
  for (const item of items) {
    if (user.role === 'employee') {
      if (item.author.id !== user.id) continue;
      for (const comment of item.comments.filter(entry => entry.kind === 'clarification_request')) {
        events.push({ ...base(item), id: `clarification-requested-${safeId(comment.id)}`, kind: 'clarification_requested',
          createdAt: comment.createdAt, message: `По обращению ${item.number} запрошено уточнение.` });
      }
      // Only while the complaint is open: once decided, decision_recorded replaces the intermediate status news.
      if (!terminalStatuses.includes(item.status)) for (const entry of item.history) {
        const message = entry.kind === 'status_changed' && entry.toStatus && entry.fromStatus !== 'awaiting_clarification'
          ? statusMessages[entry.toStatus] : undefined;
        if (message) events.push({ ...base(item), id: `status-changed-${safeId(entry.id)}`, kind: 'status_changed',
          createdAt: entry.createdAt, message: message(item.number) });
      }
      if (item.decision) {
        events.push({ ...base(item), id: `decision-recorded-${safeId(item.id)}`, kind: 'decision_recorded',
          createdAt: item.decision.createdAt, message: `По обращению ${item.number} принято решение.` });
      }
      continue;
    }
    const open = !terminalStatuses.includes(item.status);
    const mine = item.assignee?.id === user.id;
    if (open && !item.assignee) {
      events.push({ ...base(item), id: `unassigned-${safeId(item.id)}`, kind: 'unassigned', createdAt: item.createdAt,
        message: `Обращение ${item.number} поступило без ответственного.` });
    }
    if (mine) {
      for (const comment of item.comments.filter(entry => entry.kind === 'clarification_response')) {
        events.push({ ...base(item), id: `clarification-received-${safeId(comment.id)}`, kind: 'clarification_received',
          createdAt: comment.createdAt, message: `По обращению ${item.number} получено уточнение от автора.` });
      }
    }
    const left = Date.parse(item.dueAt) - now;
    if (open && (mine || !item.assignee) && left > 0 && left < DAY) {
      events.push({ ...base(item), id: `due-soon-${safeId(item.id)}-${Date.parse(item.dueAt)}`, kind: 'due_soon',
        createdAt: new Date(Date.parse(item.dueAt) - DAY).toISOString(),
        message: `Срок рассмотрения обращения ${item.number} истекает менее чем через 24 часа.` });
    }
    if (open && (mine || !item.assignee) && left <= 0) {
      events.push({ ...base(item), id: `overdue-${safeId(item.id)}-${Date.parse(item.dueAt)}`, kind: 'overdue',
        createdAt: new Date(Date.parse(item.dueAt)).toISOString(),
        message: `Срок рассмотрения обращения ${item.number} истёк.` });
    }
  }
  return events;
}

export function registerNotifications(app: FastifyInstance) {
  app.get('/notifications', async request => {
    const user = identity(app, request, ['employee', 'manager']);
    const params = queryParameters(request, ['since']);
    const since = params.get('since');
    if (since !== null && !sinceValidator(since)) invalid('Некорректная метка времени since.');
    const lowerBound = since === null ? -Infinity : Date.parse(since);
    const now = Date.now();
    const items = eventsFor(user, app.store.list(), now)
      .filter(event => Date.parse(event.createdAt) > lowerBound)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return { items, unreadCount: items.length, generatedAt: new Date(now).toISOString() };
  });
}
