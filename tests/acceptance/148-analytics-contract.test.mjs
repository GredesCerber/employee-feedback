import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const api = JSON.parse(readFileSync(new URL('../../contracts/api.yaml', import.meta.url), 'utf8'));
const schemas = api.components.schemas;
const ref = name => `#/components/schemas/${name}`;
const resolve = value => value?.$ref ? value.$ref.slice(2).split('/').reduce((node, key) => node[key], api) : value;

test('#148 новые аналитические GET имеют явные права, схемы, ошибки и задачи реализации', () => {
  for (const [path, id, schema, issue] of [
    ['/summary/digest', 'getSummaryDigest', 'SummaryDigest', 150],
    ['/analytics/trends', 'getAnalyticsTrends', 'AnalyticsTrends', 151],
  ]) {
    const operation = api.paths[path]?.get;
    assert.ok(operation, path);
    assert.equal(operation.operationId, id);
    assert.deepEqual(operation['x-roles'], ['manager', 'admin']);
    assert.deepEqual(operation.security, [{ DemoIdentity: [] }]);
    assert.ok(operation.description.length > 30);
    if (operation['x-implementation-issue'] !== undefined) assert.equal(operation['x-implementation-issue'], issue);
    assert.equal(operation.responses['200'].content['application/json'].schema.$ref, ref(schema));
    for (const code of ['400', '401', '403', '422', '500']) {
      assert.equal(resolve(operation.responses[code])?.content?.['application/json']?.schema?.$ref, ref('Error'));
    }
  }
  // Manager widgets use the new route instead of widening the existing admin endpoint.
  assert.deepEqual(api.paths['/summary'].get['x-roles'], ['admin']);
});

test('#148 сводка и тренды определяют период, пустые данные и безопасные агрегаты', () => {
  const digest = schemas.SummaryDigest;
  for (const field of ['text', 'highlights', 'period', 'source']) assert.ok(digest?.required.includes(field), field);
  assert.deepEqual(digest.properties.source.enum, ['llm', 'template']);
  assert.equal(digest.properties.highlights.items.type, 'string');
  const period = resolve(digest.properties.period);
  for (const key of ['from', 'to']) assert.equal(period.properties[key].format, 'date-time');
  assert.match(api.paths['/summary/digest'].get.description, /aggregates only/i);
  assert.match(api.paths['/summary/digest'].get.description, /60 seconds/);
  const trends = schemas.AnalyticsTrends;
  for (const field of ['byDay', 'byWeek', 'byCategory', 'topThemes', 'overdue', 'byDepartment', 'totals']) {
    assert.ok(trends?.required.includes(field), field);
  }
  assert.equal(trends.properties.byDay.minItems, 14);
  assert.equal(trends.properties.byDay.maxItems, 14);
  assert.equal(trends.properties.topThemes.maxItems, 5);
  assert.ok(api.paths['/analytics/trends'].get.parameters.some(parameter => parameter.name === 'department'));
  assert.match(api.paths['/analytics/trends'].get.description, /every block/i);
  const overdue = resolve(trends.properties.overdue.items);
  for (const field of ['number', 'categoryName', 'overdueHours']) assert.ok(overdue.required.includes(field));
  assert.equal(overdue.properties.author, undefined);
  assert.equal(overdue.additionalProperties, false);
});

test('#148 источники категории расширены без потери старого формата', () => {
  const suggestion = schemas.CategorySuggestion;
  assert.deepEqual(suggestion.required, ['category', 'source']);
  for (const source of ['llm', 'demo-fixture', 'rules', 'none']) assert.ok(suggestion.properties.source.enum.includes(source));
  assert.ok(suggestion.properties.category.oneOf.some(option => option.type === 'null'));
  assert.ok(suggestion.properties.category.oneOf.some(option => option.$ref === ref('SuggestedCategory')));
  assert.equal(api.paths['/complaints/suggest-category'].get.responses['200'].content['application/json'].schema.$ref, ref('CategorySuggestion'));
  assert.deepEqual(schemas.Summary.required, ['total', 'byType', 'closedCount', 'closedShare', 'averageFirstResponseHours', 'respondedCount', 'recurringTopics', 'generatedAt']);
});

test('#148 примеры пустых и заполненных ответов соответствуют схеме и не содержат автора', () => {
  const require = createRequire(new URL('../../api/package.json', import.meta.url));
  const Ajv = require('ajv/dist/2020.js').default;
  const ajv = new Ajv({ strict: false, allErrors: true }); require('ajv-formats').default(ajv);
  ajv.addSchema(api, 'contract');
  for (const name of ['SummaryDigest', 'AnalyticsTrends']) {
    assert.ok(schemas[name]?.examples?.length >= 2, `${name}: нужны пустой и заполненный примеры`);
    const validate = ajv.compile({ $ref: `contract${ref(name)}` });
    for (const value of schemas[name].examples) {
      assert.ok(validate(value), `${name}: ${JSON.stringify(validate.errors)}`);
      assert.equal(validate({ ...value, author: { id: 'employee-1', name: 'Скрытый автор' } }), false);
    }
  }
  const validate = ajv.compile({ $ref: `contract${ref('CategorySuggestion')}` });
  for (const source of ['llm', 'demo-fixture', 'rules']) assert.ok(validate({ category: { id: 'cross_department', name: 'Межотдельное взаимодействие' }, source }));
  assert.ok(validate({ category: null, source: 'none' }));
});
