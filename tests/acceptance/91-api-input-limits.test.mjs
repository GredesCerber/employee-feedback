import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { buildApp } from '../../api/dist/app.js';

const contract = JSON.parse(readFileSync(new URL('../../contracts/api.yaml', import.meta.url), 'utf8'));
const schemas = contract.components.schemas;
const requireApi = createRequire(new URL('../../api/package.json', import.meta.url));
const Ajv = requireApi('ajv/dist/2020.js').default;
const ajv = new Ajv({ strict: false }); requireApi('ajv-formats').default(ajv);
ajv.addSchema(contract, 'contract'); const validError = ajv.compile({ $ref: 'contract#/components/schemas/Error' });
function setup(t) {
  const previous = { NODE_ENV: process.env.NODE_ENV, PERSIST_FILE: process.env.PERSIST_FILE };
  process.env.NODE_ENV = 'test'; delete process.env.PERSIST_FILE;
  t.after(() => { for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value; });
  const app = buildApp(); t.after(() => app.close()); return app;
}
const payload = { type: 'problem', categoryId: 'cross_department', description: 'Проверка входных данных.' };
const create = (app, body) => app.inject({ method: 'POST', url: '/complaints', headers: { 'x-demo-user': 'employee-1' }, payload: body });
function limitError(response, field, limit) {
  assert.equal(response.statusCode, 422); const error = response.json();
  assert.ok(validError(error), JSON.stringify(validError.errors)); assert.equal(error.code, 'VALIDATION_ERROR');
  const detail = error.details?.find(entry => entry.field === field);
  assert.ok(detail, `missing detail for ${field}`); assert.ok(detail.message.includes(String(limit)));
}

test('#91 contract length limits reject excess description/solution with field and limit, preserving data', async t => {
  const app = setup(t);
  for (const field of ['description', 'proposedSolution']) {
    const limit = schemas.CreateComplaint.properties[field].maxLength;
    const boundary = await create(app, { ...payload, [field]: 'я'.repeat(limit) });
    assert.equal(boundary.statusCode, 201);
    const before = app.store.list();
    limitError(await create(app, { ...payload, [field]: 'я'.repeat(limit + 1) }), field, limit);
    assert.deepEqual(app.store.list(), before);
  }
});

test('#91 comment length follows contract with a clear validation detail', async t => {
  const app = setup(t); const item = (await create(app, payload)).json();
  const limit = schemas.CommentInput.properties.text.maxLength;
  const comment = text => app.inject({ method: 'POST', url: `/complaints/${item.id}/comments`, headers: { 'x-demo-user': 'manager-1' }, payload: { kind: 'comment', text } });
  assert.equal((await comment('к'.repeat(limit))).statusCode, 201);
  const before = app.store.list(); limitError(await comment('к'.repeat(limit + 1)), 'text', limit);
  assert.deepEqual(app.store.list(), before);
});

test('#91 body over 64 KiB is rejected with 413 before field validation', async t => {
  const app = setup(t); const before = app.store.list();
  const response = await create(app, { ...payload, description: 'x'.repeat(65537) });
  assert.equal(response.statusCode, 413); assert.equal(response.json().code, 'PAYLOAD_TOO_LARGE');
  assert.ok(validError(response.json())); assert.deepEqual(app.store.list(), before);
});

test('#91 blank descriptions are rejected and accepted text is trimmed', async t => {
  const app = setup(t);
  for (const description of ['', ' \t\n ']) {
    const response = await create(app, { ...payload, description });
    assert.equal(response.statusCode, 422); assert.equal(response.json().code, 'VALIDATION_ERROR');
  }
  const response = await create(app, { ...payload, description: '  Описание. \n', proposedSolution: '\t Решение.  ' });
  assert.equal(response.statusCode, 201); assert.equal(response.json().description, 'Описание.');
  assert.equal(response.json().proposedSolution, 'Решение.');
  const comment = await app.inject({ method: 'POST', url: `/complaints/${response.json().id}/comments`, headers: { 'x-demo-user': 'manager-1' }, payload: { kind: 'comment', text: '  Уточнение. \n' } });
  assert.equal(comment.statusCode, 201); assert.equal(comment.json().comments.at(-1).text, 'Уточнение.');
});

test('#91 malformed JSON and unsupported content types keep safe contract errors', async t => {
  const app = setup(t); const before = app.store.list();
  for (const [body, type, status, code] of [['{broken', 'application/json', 400, 'BAD_REQUEST'], ['plain', 'text/plain', 415, 'UNSUPPORTED_MEDIA_TYPE']]) {
    const response = await app.inject({ method: 'POST', url: '/complaints', headers: { 'x-demo-user': 'employee-1', 'content-type': type }, payload: body });
    assert.equal(response.statusCode, status); assert.equal(response.json().code, code);
    assert.ok(validError(response.json()));
  }
  assert.deepEqual(app.store.list(), before);
});
