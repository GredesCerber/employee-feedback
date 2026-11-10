import type { FastifyInstance } from 'fastify';
import type { Attachment, Complaint, ComplaintType, Priority } from './model.js';
import { terminalStatuses } from './model.js';
import { ApiError, identity, invalid, present, queryParameters, validateBody, visibleComplaint } from './http.js';

interface CreateInput {
  type: ComplaintType; categoryId: string; description: string; proposedSolution?: string;
  priority?: Priority; attachments?: Attachment[];
}

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
    const index = app.store.nextNumber();
    const item: Complaint = {
      id: `complaint-${index}`, number: `A-${String(index).padStart(3, '0')}`, type: body.type,
      categoryId: category.id, departmentId: user.departmentId, author: user,
      description: body.description.trim(), proposedSolution: body.proposedSolution?.trim() ?? null,
      priority: body.priority ?? 'medium', attachments: body.attachments ?? [], status: 'new', assignee,
      routing: assignee ? { queue: 'assigned', reason: 'category_rule' } : { queue: 'unassigned', reason: 'no_rule' },
      createdAt: now, updatedAt: now, dueAt: new Date(Date.parse(now) + category.dueInDays * 86400000).toISOString(),
      firstResponseAt: null, closedAt: null, overdue: false, comments: [], decision: null,
      history: [{ id: `complaint-${index}-event-000001`, kind: 'created', actor: user, createdAt: now,
        fromStatus: null, toStatus: 'new', text: 'Обращение зарегистрировано.' }],
      nextAction: assignee ? 'Ответственный рассмотрит обращение до указанного срока.' : 'Ожидается назначение ответственного руководителем.',
    };
    if (assignee) item.history.push({ id: `complaint-${index}-event-000002`, kind: 'assigned', actor: null,
      createdAt: now, fromStatus: null, toStatus: null, text: 'Ответственный назначен по категории.' });
    app.store.save(item);
    return reply.code(201).send(item);
  });

  app.get('/complaints', async (request) => {
    const user = identity(app, request);
    const params = queryParameters(request, ['queue', 'limit', 'offset']);
    const queue = params.get('queue');
    if (queue !== null && !['assigned', 'unassigned'].includes(queue)) invalid('Неизвестная очередь.');
    const limitText = params.get('limit') ?? '20';
    const offsetText = params.get('offset') ?? '0';
    if (!/^\d+$/.test(limitText) || !/^\d+$/.test(offsetText)) invalid('Некорректная пагинация.');
    const limit = Number(limitText), offset = Number(offsetText);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset)) invalid('Некорректная пагинация.');
    const items = app.store.list().filter(item => (user.role !== 'employee' || item.author.id === user.id)
      && (queue === null || item.routing.queue === queue))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id));
    const now = Date.now();
    return { items: items.slice(offset, offset + limit).map(item => present(item, now)), total: items.length, limit, offset };
  });

  app.get<{ Params: { complaintId: string } }>('/complaints/:complaintId', async (request) => {
    const user = identity(app, request);
    queryParameters(request, []);
    return present(visibleComplaint(app, request.params.complaintId, user));
  });

  app.patch<{ Params: { complaintId: string } }>('/complaints/:complaintId/assignment', async (request) => {
    const user = identity(app, request, ['manager']);
    queryParameters(request, []);
    const body = validateBody<{ assigneeId: string }>('AssignmentInput', request.body);
    const item = visibleComplaint(app, request.params.complaintId, user);
    const assignee = app.store.users.find(candidate => candidate.id === body.assigneeId && candidate.role === 'manager');
    if (!assignee) invalid('Ответственным может быть только известный руководитель.');
    if (terminalStatuses.includes(item.status)) throw new ApiError(409, 'INVALID_TRANSITION', 'Завершённое обращение нельзя переназначить.');
    if (item.assignee?.id === assignee.id) return present(item);
    const now = new Date().toISOString();
    item.assignee = assignee;
    item.routing = { queue: 'assigned', reason: 'manual_assignment' };
    item.updatedAt = now;
    item.nextAction = 'Ответственный рассмотрит обращение до указанного срока.';
    item.history.push({ id: `${item.id}-event-${String(item.history.length + 1).padStart(6, '0')}`,
      kind: 'assigned', actor: user, createdAt: now, fromStatus: null, toStatus: null, text: 'Руководитель назначил ответственного.' });
    app.store.save(item);
    return present(item);
  });
}
