import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../dist/app.js';

const request = (app, method, url, user, payload) => app.inject({
  method, url, headers: { 'x-demo-user': user },
  ...(payload === undefined ? {} : { payload }),
});

test('#123 status, assignment and undo redact the anonymous author without changing stored ownership', async t => {
  const app = buildApp();
  t.after(() => app.close());
  const created = await request(app, 'POST', '/complaints', 'employee-1', {
    type: 'problem', categoryId: 'no_rule_demo', anonymous: true,
    description: 'Нужно улучшить освещение склада.',
  });
  assert.equal(created.statusCode, 201, created.body);
  const item = created.json(), path = `/complaints/${item.id}`;
  const assertRedacted = response => {
    assert.equal(response.statusCode, 200, response.body);
    const view = response.json();
    assert.deepEqual(view.author, { name: 'Аноним' });
    assert.ok(!response.body.includes('employee-1'));
    assert.ok(!response.body.includes('Сотрудник закупок'));
    assert.equal(view.anonymous, true);
    return view;
  };
  const assigned = assertRedacted(await request(app, 'PATCH', `${path}/assignment`, 'manager-1', { assigneeId: 'manager-1' }));
  assert.equal(assigned.canUndo, true);
  // Reassigning to the same person is also a response path that must redact.
  assertRedacted(await request(app, 'PATCH', `${path}/assignment`, 'manager-1', { assigneeId: 'manager-1' }));
  const changed = assertRedacted(await request(app, 'PATCH', `${path}/status`, 'manager-1', { status: 'in_review' }));
  assert.equal(changed.canUndo, true);
  const restored = assertRedacted(await request(app, 'POST', `${path}/undo`, 'manager-1'));
  assert.equal(restored.status, 'new');
  assert.equal(restored.history.at(-1).kind, 'undone');
  const unassigned = assertRedacted(await request(app, 'POST', `${path}/undo`, 'manager-1'));
  assert.equal(unassigned.assignee, null);
  assert.equal(unassigned.canUndo, false);
  assertRedacted(await request(app, 'GET', path, 'admin-1'));
  const own = await request(app, 'GET', path, 'employee-1');
  assert.equal(own.statusCode, 200);
  assert.equal(own.json().author.id, 'employee-1');
  assert.equal(app.store.get(item.id).author.id, 'employee-1');
});
