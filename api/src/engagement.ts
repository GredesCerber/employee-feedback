import type { FastifyInstance } from 'fastify';
import type { Complaint } from './model.js';
import { terminalStatuses } from './model.js';
import { ApiError, identity, invalid, queryParameters, validateBody, visibleComplaint } from './http.js';
import { presentFor } from './undo.js';
import { appendHistory } from './lifecycle.js';

const DAY = 86_400_000;
const share = (part: number, whole: number) => whole === 0 ? null : part / whole;

/** Pilot metrics for complaints created in [from, to). */
function period(items: Complaint[], from: number, to: number, employeesTotal: number) {
  const cohort = items.filter(item => {
    const created = Date.parse(item.createdAt);
    return created >= from && created < to;
  });
  const reviewed = cohort.filter(item => item.status !== 'new').length;
  const rated = cohort.filter(item => item.feedback);
  const solved = rated.filter(item => item.feedback!.solved).length;
  return {
    total: cohort.length, reachEmployees: new Set(cohort.map(item => item.author.id)).size, employeesTotal,
    reviewedCount: reviewed, reviewedShare: share(reviewed, cohort.length),
    implementedCount: cohort.filter(item => item.status === 'implemented').length,
    feedbackCount: rated.length, solvedCount: solved, solvedShare: share(solved, rated.length),
    understoodShare: share(rated.filter(item => item.feedback!.understood).length, rated.length),
  };
}

export function registerEngagement(app: FastifyInstance) {
  app.post<{ Params: { complaintId: string } }>('/complaints/:complaintId/feedback', async (request, reply) => {
    const user = identity(app, request, ['employee']);
    queryParameters(request, []);
    const body = validateBody<{ understood: boolean; solved: boolean; comment?: string }>('FeedbackInput', request.body);
    const item = visibleComplaint(app, request.params.complaintId, user);
    if (!terminalStatuses.includes(item.status)) throw new ApiError(409, 'INVALID_TRANSITION', 'Оценить результат можно после итога рассмотрения.');
    if (item.feedback) throw new ApiError(409, 'INVALID_TRANSITION', 'Оценка уже отправлена.');
    item.feedback = { understood: body.understood, solved: body.solved,
      ...(body.comment?.trim() ? { comment: body.comment.trim() } : {}), createdAt: new Date().toISOString() };
    app.store.save(item);
    return reply.code(201).send(presentFor(app, item, user));
  });

  app.get('/improvements', async request => {
    const user = identity(app, request);
    queryParameters(request, []);
    const all = app.store.list();
    const { categories } = app.store.referenceData;
    const implemented = all.filter(item => item.status === 'implemented' && item.decision);
    const groups = new Map<string, Complaint[]>();
    for (const item of implemented) groups.set(item.problem?.id ?? item.id, [...(groups.get(item.problem?.id ?? item.id) ?? []), item]);
    const items = [...groups.entries()].map(([key, members]) => {
      const first = members[0]!;
      const linked = first.problem ? all.filter(item => item.problem?.id === first.problem!.id) : members;
      const at = Math.max(...members.map(item => Date.parse(item.decision!.createdAt)));
      return { key, categoryId: first.categoryId,
        categoryName: categories.find(category => category.id === first.categoryId)?.name ?? first.categoryId,
        result: first.decision!.explanation, implementedAt: new Date(at).toISOString(),
        problemTitle: first.problem?.title ?? null, reportersCount: Math.max(1, linked.length),
        answeredCount: linked.filter(item => item.feedback).length,
        confirmedCount: linked.filter(item => item.feedback?.solved).length,
        mine: linked.some(item => item.author.id === user.id) };
    }).sort((a, b) => b.implementedAt.localeCompare(a.implementedAt) || a.key.localeCompare(b.key));
    return { items, total: items.length, generatedAt: new Date().toISOString() };
  });

  app.get('/impact', async request => {
    identity(app, request, ['manager', 'admin']);
    const raw = queryParameters(request, ['days']).get('days');
    if (raw !== null && !/^\d{1,3}$/.test(raw)) invalid('Период задаётся числом дней от 1 до 365.');
    const days = raw === null ? 30 : Number(raw);
    if (days < 1 || days > 365) invalid('Период задаётся числом дней от 1 до 365.');
    const now = Date.now(), items = app.store.list();
    const employeesTotal = app.store.users.filter(user => user.role === 'employee').length;
    const current = period(items, now - days * DAY, now, employeesTotal);
    const previous = period(items, now - 2 * days * DAY, now - days * DAY, employeesTotal);
    const count = (from: number, to: number, id: string) => items.filter(item => item.categoryId === id
      && Date.parse(item.createdAt) >= from && Date.parse(item.createdAt) < to).length;
    const { categories } = app.store.referenceData;
    const changes = categories.map(category => ({ categoryId: category.id, categoryName: category.name,
      current: count(now - days * DAY, now, category.id), previous: count(now - 2 * days * DAY, now - days * DAY, category.id) }))
      .filter(change => change.current > 0 || change.previous > 0)
      .sort((a, b) => b.current - a.current || a.categoryId.localeCompare(b.categoryId));
    return { generatedAt: new Date(now).toISOString(), days, current, previous, categories: changes };
  });

  const groupOf = (members: Complaint[]) => {
    const first = members[0]!;
    return { id: first.problem!.id, title: first.problem!.title, plan: first.problem!.plan, createdAt: first.problem!.createdAt,
      status: members.every(item => terminalStatuses.includes(item.status)) ? 'resolved' as const : 'open' as const,
      complaints: members.map(item => ({ id: item.id, number: item.number, status: item.status, categoryId: item.categoryId })) };
  };
  const problems = () => {
    const groups = new Map<string, Complaint[]>();
    for (const item of app.store.list()) if (item.problem) groups.set(item.problem.id, [...(groups.get(item.problem.id) ?? []), item]);
    return [...groups.values()].map(groupOf).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  };

  app.get('/problems', async request => {
    identity(app, request, ['manager', 'admin']);
    queryParameters(request, []);
    const items = problems();
    return { items, total: items.length };
  });

  app.post('/problems', async (request, reply) => {
    const user = identity(app, request, ['manager']);
    queryParameters(request, []);
    const body = validateBody<{ title: string; plan?: string; complaintIds: string[] }>('ProblemInput', request.body);
    const members = body.complaintIds.map(id => visibleComplaint(app, id, user));
    for (const item of members) {
      if (terminalStatuses.includes(item.status)) throw new ApiError(409, 'INVALID_TRANSITION', `Обращение ${item.number} уже завершено.`);
      if (item.problem) throw new ApiError(409, 'INVALID_TRANSITION', `Обращение ${item.number} уже входит в общую проблему.`);
    }
    const nextIndex = Math.max(0, ...app.store.list().map(item => Number(item.problem?.id.replace('problem-', '')) || 0)) + 1;
    const now = new Date().toISOString();
    const ref = { id: `problem-${nextIndex}`, title: body.title.trim(), plan: body.plan?.trim() || null, createdAt: now };
    for (const item of members) {
      item.problem = ref;
      appendHistory(item, user, new Date(Math.max(Date.parse(now), Date.parse(item.updatedAt))).toISOString(), 'commented',
        `Обращение объединено с похожими в общую проблему «${ref.title}».`);
      app.store.save(item);
    }
    return reply.code(201).send(groupOf(members.map(item => app.store.get(item.id)!)));
  });
}
