import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildApp } from '../../api/dist/app.js';

// #99: полный перебор 49 пар «из -> в» против x-status-transitions контракта.
// Тест работает in-process (app.inject): без сети и Docker.
const contract = JSON.parse(readFileSync(new URL('../../contracts/api.yaml', import.meta.url), 'utf8'));
const transitions = contract['x-status-transitions'];
const STATUSES = Object.keys(transitions);
const TERMINAL = ['implemented', 'rejected', 'closed'];
const EXPLANATION = 'Обоснованное решение по обращению.';

const req = (app, method, url, payload, user = 'manager-1') => app.inject({ method, url,
  headers: { 'x-demo-user': user }, ...(payload === undefined ? {} : { payload }) });

async function fresh(t) {
  const app = buildApp(); t.after(() => app.close());
  const created = await req(app, 'POST', '/complaints',
    { type: 'problem', categoryId: 'cross_department', description: 'Перебор переходов статусов.' }, 'employee-1');
  assert.equal(created.statusCode, 201);
  return { app, path: `/complaints/${created.json().id}` };
}

// Приводит свежее обращение в исходный статус через операции контракта.
async function toStatus(app, path, status) {
  const ok = (res, code) => assert.equal(res.statusCode, code, res.body);
  if (status === 'new') return;
  if (status === 'in_review') return ok(await req(app, 'PATCH', `${path}/status`, { status }), 200);
  if (status === 'in_progress') {
    ok(await req(app, 'PATCH', `${path}/status`, { status: 'in_review' }), 200);
    return ok(await req(app, 'PATCH', `${path}/status`, { status }), 200);
  }
  if (status === 'awaiting_clarification') {
    return ok(await req(app, 'POST', `${path}/comments`, { kind: 'clarification_request', text: 'Уточните детали.' }), 201);
  }
  ok(await req(app, 'PATCH', `${path}/status`, { status: 'in_review' }), 200);
  return ok(await req(app, 'POST', `${path}/decision`, { outcome: status, explanation: EXPLANATION }), 201);
}

// Операция контракта, пытающаяся перевести обращение в целевой статус.
function attempt(app, path, target) {
  if (target === 'in_review' || target === 'in_progress' || target === 'new') {
    return req(app, 'PATCH', `${path}/status`, { status: target });
  }
  if (target === 'awaiting_clarification') {
    return req(app, 'POST', `${path}/comments`, { kind: 'clarification_request', text: 'Нужны уточнения.' });
  }
  return req(app, 'POST', `${path}/decision`, { outcome: target, explanation: EXPLANATION });
}

test('#99 contract lists exactly seven statuses (49 pairs)', () => {
  assert.deepEqual([...STATUSES].sort(),
    ['awaiting_clarification', 'closed', 'implemented', 'in_progress', 'in_review', 'new', 'rejected']);
  for (const [from, targets] of Object.entries(transitions)) {
    for (const to of targets) assert.ok(STATUSES.includes(to), `${from} -> ${to}`);
  }
});

test('#99 all 49 from->to pairs match x-status-transitions', async t => {
  let pairs = 0;
  for (const from of STATUSES) {
    for (const to of STATUSES) {
      pairs += 1;
      const label = `${from} -> ${to}`;
      const { app, path } = await fresh(t);
      await toStatus(app, path, from);
      const before = (await req(app, 'GET', path)).json();
      assert.equal(before.status, from, label);
      const result = await attempt(app, path, to);
      const after = (await req(app, 'GET', path)).json();
      if (to === 'new') {
        assert.equal(result.statusCode, 422, `${label}: ${result.body}`);
        assert.deepEqual(after, before, `${label}: данные не должны меняться`);
      } else if (transitions[from].includes(to)) {
        assert.ok([200, 201].includes(result.statusCode), `${label}: ${result.statusCode} ${result.body}`);
        assert.equal(result.json().status, to, label);
        assert.equal(after.status, to, label);
        assert.equal(after.history.at(-1).fromStatus, from, label);
        assert.equal(after.history.at(-1).toStatus, to, label);
      } else {
        assert.equal(result.statusCode, 409, `${label}: ${result.statusCode} ${result.body}`);
        assert.equal(result.json().code, 'INVALID_TRANSITION', label);
        assert.deepEqual(after, before, `${label}: данные не должны меняться`);
      }
    }
  }
  assert.equal(pairs, 49);
});

test('#99 completed complaints reject status change, comment and assignment with 409', async t => {
  for (const terminal of TERMINAL) {
    const { app, path } = await fresh(t);
    await toStatus(app, path, terminal);
    const before = (await req(app, 'GET', path)).json();
    assert.equal(before.status, terminal);
    const attempts = [
      ['status', req(app, 'PATCH', `${path}/status`, { status: 'in_review' })],
      ['comment', req(app, 'POST', `${path}/comments`, { kind: 'comment', text: 'Поздно.' })],
      ['assignment', req(app, 'PATCH', `${path}/assignment`, { assigneeId: 'manager-2' })],
    ];
    for (const [name, pending] of attempts) {
      const res = await pending;
      assert.equal(res.statusCode, 409, `${terminal}/${name}: ${res.body}`);
    }
    assert.deepEqual((await req(app, 'GET', path)).json(), before, `${terminal}: данные не должны меняться`);
  }
});

test('#99 author reply to clarification returns status by contract and keeps both events', async t => {
  const { app, path } = await fresh(t);
  await toStatus(app, path, 'in_progress');
  const requested = await req(app, 'POST', `${path}/comments`, { kind: 'clarification_request', text: 'Что именно сломано?' });
  assert.equal(requested.statusCode, 201);
  assert.equal(requested.json().status, 'awaiting_clarification');
  const replied = await req(app, 'POST', `${path}/comments`, { kind: 'clarification_response', text: 'Сломан принтер.' }, 'employee-1');
  assert.equal(replied.statusCode, 201);
  const item = replied.json();
  // По контракту единственный выход из awaiting_clarification - in_review.
  assert.deepEqual(transitions.awaiting_clarification, ['in_review']);
  assert.equal(item.status, 'in_review');
  const history = item.history.map(h => `${h.fromStatus}>${h.toStatus}`);
  assert.ok(history.includes('in_progress>awaiting_clarification'), history.join(','));
  assert.equal(history.at(-1), 'awaiting_clarification>in_review');
  assert.deepEqual(item.comments.map(c => c.kind), ['clarification_request', 'clarification_response']);
  assert.deepEqual(item.comments.map(c => c.author.id), ['manager-1', 'employee-1']);
});

test('#99 motivated refusal without explanation is 422 and changes nothing', async t => {
  const { app, path } = await fresh(t);
  await toStatus(app, path, 'in_review');
  const before = (await req(app, 'GET', path)).json();
  for (const payload of [{ outcome: 'rejected' }, { outcome: 'rejected', explanation: '' }, { outcome: 'rejected', explanation: '   ' }]) {
    const res = await req(app, 'POST', `${path}/decision`, payload);
    assert.equal(res.statusCode, 422, `${JSON.stringify(payload)}: ${res.body}`);
  }
  assert.deepEqual((await req(app, 'GET', path)).json(), before);
  const ok = await req(app, 'POST', `${path}/decision`, { outcome: 'rejected', explanation: EXPLANATION });
  assert.equal(ok.statusCode, 201);
  assert.equal(ok.json().status, 'rejected');
});

test('#99 suite runs offline: only in-process app, no network or container modules', () => {
  const source = readFileSync(new URL(import.meta.url), 'utf8');
  const imports = [...source.matchAll(/^import .* from '([^']+)'/gm)].map(m => m[1]);
  assert.deepEqual(imports.sort(), ['../../api/dist/app.js', 'node:assert/strict', 'node:fs', 'node:test']);
});
