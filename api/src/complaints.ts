import type { FastifyInstance } from 'fastify';
import type { Attachment, Complaint, ComplaintType, ComplaintView, GeoPoint, Priority, User } from './model.js';
import { terminalStatuses } from './model.js';
import { ApiError, identity, invalid, listQuery, type ListQuery, queryParameters, validateBody, isSimulated, visibleComplaint } from './http.js';
import { presentFor, recordAction, snapshot } from './undo.js';
import { summarize, trends } from './analytics.js';
import { matchesComplaintText, searchWords } from './search.js';

interface CreateInput {
  type: ComplaintType; categoryId: string; description: string; proposedSolution?: string;
  priority?: Priority; attachments?: Attachment[]; anonymous?: boolean; location?: GeoPoint;
}

const typeLabels: Record<string, string> = { problem: 'Проблема', suggestion: 'Предложение', praise: 'Похвала' };
const statusLabels: Record<string, string> = { new: 'Новое', in_review: 'На рассмотрении', in_progress: 'В работе',
  awaiting_clarification: 'Ожидает уточнения', implemented: 'Реализовано', rejected: 'Отклонено', closed: 'Закрыто' };
const csvHeader = ['номер', 'тип', 'категория', 'подразделение', 'статус', 'ответственный', 'создано', 'срок',
  'просрочено', 'первый ответ', 'итог'];

function filteredComplaints(app: FastifyInstance, user: User, query: ListQuery): ComplaintView[] {
  const words = searchWords(query.q);
  const now = Date.now();
  return app.store.list().filter(item => user.role !== 'employee' || item.author.id === user.id)
    .map(item => presentFor(app, item, user, now)).filter(item =>
      (query.departmentId === undefined || item.departmentId === query.departmentId)
      && (query.categoryId === undefined || item.categoryId === query.categoryId)
      && (query.status === undefined || item.status === query.status)
      && (query.type === undefined || item.type === query.type)
      && (query.simulated === undefined || (item.simulated ?? false) === query.simulated)
      && (query.queue === undefined || item.routing.queue === query.queue)
      && (query.overdue === undefined || item.overdue === query.overdue)
      && (query.dueAfter === undefined || Date.parse(item.dueAt) >= Date.parse(query.dueAfter))
      && (query.dueBefore === undefined || Date.parse(item.dueAt) <= Date.parse(query.dueBefore))
      && matchesComplaintText(item, words))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** RFC 4180 quoting plus spreadsheet formula protection (apostrophe prefix). */
export function csvCell(value: string): string {
  let text = value;
  if (/^[\s\u0000-\u001f]*[=+\-@]/u.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
const isoDate = (value: string | null) => value ? new Date(value).toISOString() : '';

export function registerComplaints(app: FastifyInstance) {
  app.get('/session', async (request) => {
    const user = identity(app, request);
    queryParameters(request, []);
    return user;
  });
  app.get('/reference-data', async (request) => {
    const user = identity(app, request);
    queryParameters(request, []);
    const references = app.store.referenceData;
    if (user.role === 'employee') references.assignees = [];
    return references;
  });

  app.post('/complaints', async (request, reply) => {
    const user = identity(app, request, ['employee']);
    queryParameters(request, []);
    const body = validateBody<CreateInput>('CreateComplaint', request.body);
    const category = app.store.referenceData.categories.find(category => category.id === body.categoryId);
    if (!category) invalid('Неизвестная категория.');
    const assignee = app.store.users.find(candidate => candidate.id === category.assigneeId && candidate.role === 'manager') ?? null;
    const now = new Date().toISOString();
    const simulated = isSimulated(request);
    const index = app.store.nextNumber();
    const item: Complaint = {
      id: `complaint-${index}`, number: `A-${String(index).padStart(3, '0')}`, type: body.type,
      categoryId: category.id, departmentId: user.departmentId, author: user,
      ...(body.anonymous !== undefined ? { anonymous: body.anonymous } : {}),
      ...(body.location ? { location: { latitude: body.location.latitude, longitude: body.location.longitude } } : {}),
      description: body.description.trim(), proposedSolution: body.proposedSolution?.trim() ?? null,
      priority: body.priority ?? 'medium', attachments: body.attachments ?? [], status: 'new', assignee,
      routing: assignee ? { queue: 'assigned', reason: 'category_rule' } : { queue: 'unassigned', reason: 'no_rule' },
      createdAt: now, updatedAt: now, dueAt: new Date(Date.parse(now) + category.dueInDays * 86400000).toISOString(),
      firstResponseAt: null, closedAt: null, overdue: false, comments: [], decision: null,
      history: [{ id: `complaint-${index}-event-000001`, kind: 'created', actor: user, createdAt: now,
        fromStatus: null, toStatus: 'new', text: 'Обращение зарегистрировано.', simulated }],
      nextAction: assignee ? 'Ответственный рассмотрит обращение до указанного срока.' : 'Ожидается назначение ответственного руководителем.',
      simulated,
    };
    if (assignee) item.history.push({ id: `complaint-${index}-event-000002`, kind: 'assigned', actor: null,
      createdAt: now, fromStatus: null, toStatus: null, text: 'Ответственный назначен по категории.', simulated });
    app.store.save(item);
    return reply.code(201).send(item);
  });

  app.get('/complaints', async (request) => {
    const user = identity(app, request);
    const query = listQuery(request);
    const limit = query.limit ?? 20, offset = query.offset ?? 0;
    const items = filteredComplaints(app, user, query);
    return { items: items.slice(offset, offset + limit), total: items.length, limit, offset };
  });

  app.get('/complaints/export', async (request, reply) => {
    const user = identity(app, request, ['manager', 'admin']);
    const items = filteredComplaints(app, user, listQuery(request, false));
    const { categories, departments } = app.store.referenceData;
    const rows = items.map(item => [item.number, typeLabels[item.type] ?? item.type,
      categories.find(category => category.id === item.categoryId)?.name ?? item.categoryId,
      departments.find(department => department.id === item.departmentId)?.name ?? item.departmentId,
      statusLabels[item.status] ?? item.status, item.assignee?.name ?? '', isoDate(item.createdAt), isoDate(item.dueAt),
      item.overdue ? 'да' : 'нет', isoDate(item.firstResponseAt), item.decision?.explanation ?? '']);
    const csv = '﻿' + [csvHeader, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
    return reply.header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="obrasheniya-${new Date().toISOString().slice(0, 10)}.csv"`)
      .send(csv);
  });

  app.get('/summary', async (request) => {
    identity(app, request, ['admin']);
    queryParameters(request, []);
    const { categories, departments } = app.store.referenceData;
    return summarize(app.store.list(), categories, new Date(), departments);
  });

  app.get('/analytics/trends', async (request) => {
    identity(app, request, ['manager', 'admin']);
    const department = queryParameters(request, ['department']).get('department');
    if (department !== null && !/^[A-Za-z0-9_-]{1,100}$/.test(department)) invalid('Некорректный фильтр подразделения.');
    const { categories, departments } = app.store.referenceData;
    const items = app.store.list().filter(item => department === null || item.departmentId === department);
    return trends(items, categories, new Date(), departments);
  });

  app.get<{ Params: { complaintId: string } }>('/complaints/:complaintId', async (request) => {
    const user = identity(app, request);
    queryParameters(request, []);
    return presentFor(app, visibleComplaint(app, request.params.complaintId, user), user);
  });

  app.patch<{ Params: { complaintId: string } }>('/complaints/:complaintId/assignment', async (request) => {
    const user = identity(app, request, ['manager']);
    queryParameters(request, []);
    const body = validateBody<{ assigneeId: string }>('AssignmentInput', request.body);
    const item = visibleComplaint(app, request.params.complaintId, user);
    const assignee = app.store.users.find(candidate => candidate.id === body.assigneeId && candidate.role === 'manager');
    if (!assignee) invalid('Ответственным может быть только известный руководитель.');
    if (terminalStatuses.includes(item.status)) throw new ApiError(409, 'INVALID_TRANSITION', 'Завершённое обращение нельзя переназначить.');
    if (item.assignee?.id === assignee.id) return presentFor(app, item, user);
    const now = new Date().toISOString();
    const before = snapshot(item), lengthBefore = item.history.length;
    item.assignee = assignee;
    item.routing = { queue: 'assigned', reason: 'manual_assignment' };
    item.updatedAt = now;
    item.nextAction = 'Ответственный рассмотрит обращение до указанного срока.';
    item.history.push({ id: `${item.id}-event-${String(item.history.length + 1).padStart(6, '0')}`,
      kind: 'assigned', actor: user, createdAt: now, fromStatus: null, toStatus: null, text: 'Руководитель назначил ответственного.',
      simulated: isSimulated(request) });
    app.store.save(item);
    recordAction(app, item, user, before, lengthBefore);
    return presentFor(app, item, user);
  });
}
