import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { buildApp } from '../../api/dist/app.js';

const requireApi = createRequire(new URL('../../api/package.json', import.meta.url));
const Ajv = requireApi('ajv/dist/2020.js').default;
const ajv = new Ajv({ strict: false, allErrors: true }); requireApi('ajv-formats').default(ajv);
const contract = JSON.parse(readFileSync(new URL('../../contracts/api.yaml', import.meta.url), 'utf8'));
ajv.addSchema(contract, 'contract');
const validError = ajv.compile({ $ref: 'contract#/components/schemas/Error' });
const seed = 0x5eed0097;
const atoms = [null, [], {}, true, false, 0, -1, Number.MAX_VALUE, Number.MAX_SAFE_INTEGER + 1,
    '', ' ', '\0', '漢字 العربية', '🙂🚀', "'; DROP TABLE complaints; --", '<img src=x onerror=alert(1)>', 'x'.repeat(5001)];
function randomValues(initial, count) {
  let state = initial >>> 0;
  return Array.from({ length: count }, () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return structuredClone(atoms[(state >>> 0) % atoms.length]);
  });
}
const mutations = [
  { operationId: 'createComplaint', method: 'POST', path: '/complaints', user: 'employee-1',
    body: { type: 'problem', categoryId: 'cross_department', description: 'Описание.' } },
  { operationId: 'assignComplaint', method: 'PATCH', path: '/complaints/complaint-1/assignment', user: 'manager-1', body: { assigneeId: 'manager-2' } },
  { operationId: 'changeComplaintStatus', method: 'PATCH', path: '/complaints/complaint-1/status', user: 'manager-1', body: { status: 'in_review' } },
  { operationId: 'addComment', method: 'POST', path: '/complaints/complaint-1/comments', user: 'manager-1', body: { kind: 'comment', text: 'Комментарий.' } },
  { operationId: 'recordDecision', method: 'POST', path: '/complaints/complaint-1/decision', user: 'manager-1', body: { outcome: 'rejected', explanation: 'Причина.' } },
];
async function invoke(operation, payload) {
  const app = buildApp();
  try { return await app.inject({ method: operation.method, url: operation.path,
    headers: { 'x-demo-user': operation.user, 'content-type': 'application/json' }, payload: JSON.stringify(payload) }); }
  finally { await app.close(); }
}
function problem(response) {
  if (response.statusCode >= 500) return `unexpected ${response.statusCode}`;
  if (response.statusCode >= 400 && !validError(response.json())) return `invalid error shape ${JSON.stringify(validError.errors)}`;
  return null;
}
// On a failure, retry smaller independent inputs against a fresh app so the
// assertion prints a reproducible counterexample instead of a huge fuzz corpus.
async function minimize(operation, payload) {
  let current = payload;
  for (let pass = 0; pass < 12; pass++) {
    const candidates = current && typeof current === 'object' && !Array.isArray(current)
      ? Object.keys(current).map(key => Object.fromEntries(Object.entries(current).filter(([name]) => name !== key)))
      : typeof current === 'string' && current.length ? ['', current.slice(0, Math.floor(current.length / 2))] : [];
    let smaller = false;
    for (const candidate of candidates) {
      if (problem(await invoke(operation, candidate))) { current = candidate; smaller = true; break; }
    }
    if (!smaller) break;
  }
  return current;
}

test('#97 seeded boundary inputs cover every write operation without 5xx or divergent errors', { timeout: 60000 }, async t => {
  assert.deepEqual(randomValues(seed, 24), randomValues(seed, 24));
  const writes = Object.values(contract.paths).flatMap(path => Object.entries(path)
    // #89 captain-approved contract-first stage; all implemented writes remain strict.
    .filter(([method, op]) => ['post', 'put', 'patch', 'delete'].includes(method) && !op['x-implementation-issue'])
    .map(([, op]) => op.operationId));
  assert.deepEqual([...writes].sort(), mutations.map(op => op.operationId).sort(), 'Add fuzz fixtures for every new write operation');
  let checked = 0;
  for (const operation of mutations) {
    const values = [...atoms, ...randomValues(seed, 24)];
    const inputs = [...values, ...Object.keys(operation.body).flatMap(key => values.map(value => ({ ...operation.body, [key]: value })))];
    for (const input of inputs) {
      const response = await invoke(operation, input); checked++;
      const failure = problem(response);
      if (failure) {
        const minimal = await minimize(operation, input);
        assert.fail(`seed=${seed} ${operation.method} ${operation.path}: ${failure}; minimal input=${JSON.stringify(minimal)}`);
      }
    }
  }
  t.diagnostic(`seed=${seed}; checked ${checked} deterministic mutation inputs`);
});

test('#97 malformed list query values stay within documented 2xx/4xx responses', { timeout: 60000 }, async t => {
  const app = buildApp(); t.after(() => app.close());
  const queries = ['limit=1&limit=2', 'status=new&status=closed', 'unknown=1', 'q=', 'limit=', 'offset=',
    'status=', 'departmentId=', 'categoryId=', 'dueBefore=', 'dueAfter=not-a-date', 'dueBefore=2026-02-30T00:00:00Z',
    'overdue=null', 'offset=1e309', 'limit=-1', 'categoryId=%00', 'q=%F0%9F%99%82', 'q=%27%3B%20DROP%20TABLE%20complaints',
    'dueAfter=2026-12-01T00:00:00Z&dueBefore=2026-01-01T00:00:00Z'];
  const documented = contract.paths['/complaints'].get.responses;
  for (const query of queries) {
    const response = await app.inject({ url: `/complaints?${query}`, headers: { 'x-demo-user': 'manager-1' } });
    assert.ok(response.statusCode < 500 && Object.hasOwn(documented, String(response.statusCode)), `${query}: ${response.statusCode}`);
    assert.equal(problem(response), null, `query=${query}; ${response.body}`);
  }
});

test('#97 XSS-like content is preserved as data and not transformed by the API', async t => {
  const app = buildApp(); t.after(() => app.close());
  const description = '<script>alert("demo")</script><img src=x onerror=alert(1)>🙂\0';
  const created = await app.inject({ method: 'POST', url: '/complaints', headers: { 'x-demo-user': 'employee-1' },
    payload: { type: 'problem', categoryId: 'cross_department', description } });
  assert.equal(created.statusCode, 201);
  assert.equal(created.json().description, description);
  const read = await app.inject({ url: `/complaints/${created.json().id}`, headers: { 'x-demo-user': 'employee-1' } });
  assert.equal(read.statusCode, 200); assert.equal(read.json().description, description);
  assert.match(read.headers['content-type'], /application\/json/);
});
