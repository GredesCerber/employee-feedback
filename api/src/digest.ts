import { Ajv2020 } from 'ajv/dist/2020.js';
import { fullFormats } from 'ajv-formats/dist/formats.js';
import type { FastifyInstance } from 'fastify';
import { contract, identity, invalid, queryParameters } from './http.js';
import { terminalStatuses } from './model.js';
import type { DigestContent, DigestFacts } from './ai/digest.js';

const DAY = 86_400_000;
const CACHE_MS = 60_000;
const parameters = contract.paths['/summary/digest'].get.parameters as { name: string; schema: Record<string, unknown> }[];
const validate = new Ajv2020({ strict: false, formats: fullFormats }).compile({
  type: 'object', additionalProperties: false,
  properties: Object.fromEntries(parameters.map(item => [item.name, item.schema])),
});
type Snapshot = DigestContent & { period: { from: string; to: string }; generatedAt: string };

/** A per-app cache also shares pending model calls for the same aggregate facts. */
export function registerDigest(app: FastifyInstance) {
  const cache = new Map<string, { at: number; value: Promise<Snapshot> }>();
  app.get('/summary/digest', async request => {
    identity(app, request, ['manager', 'admin']);
    const params = queryParameters(request, parameters.map(item => item.name));
    if (!validate(Object.fromEntries(params))) invalid('Некорректные параметры сводки.');
    const now = Date.now();
    const to = params.has('to') ? Date.parse(params.get('to')!) : now;
    const from = params.has('from') ? Date.parse(params.get('from')!) : to - 7 * DAY;
    if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) invalid('Начало периода должно быть раньше окончания.');
    const department = params.get('department');
    const rows = app.store.list().filter(item => Date.parse(item.createdAt) >= from && Date.parse(item.createdAt) < to
      && (department === null || item.departmentId === department));
    const references = app.store.referenceData;
    const byCategory = references.categories.map(category => ({ name: category.name,
      count: rows.filter(item => item.categoryId === category.id).length })).filter(item => item.count > 0)
      .sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const byDepartment = references.departments.map(dept => ({ name: dept.name,
      count: rows.filter(item => item.departmentId === dept.id).length })).filter(item => item.count > 0)
      .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    const facts: DigestFacts = { total: rows.length,
      overdueCount: rows.filter(item => !terminalStatuses.includes(item.status) && Date.parse(item.dueAt) < now).length,
      byCategory, byDepartment };
    // Omitted boundaries are kept omitted in the key: a cached snapshot retains
    // its original period for at most a minute, while changed facts invalidate it.
    const key = JSON.stringify({ from: params.get('from'), to: params.get('to'), department, facts });
    for (const [id, entry] of cache) if (now < entry.at || now - entry.at >= CACHE_MS) cache.delete(id);
    const cached = cache.get(key);
    if (cached) return cached.value;
    if (cache.size >= 100) cache.delete(cache.keys().next().value!);
    const period = { from: new Date(from).toISOString(), to: new Date(to).toISOString() };
    const value = app.ai.summarize(facts, request.log).then(content => ({ ...content, period, generatedAt: new Date(now).toISOString() }));
    cache.set(key, { at: now, value });
    return value;
  });
}
