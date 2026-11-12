// Фоновые боты в процессе хостинга: DEMO_BOT_ENABLED=true сами подают и ведут обращения, без внешнего запуска.
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../dist/app.js';
import { startDemoBot } from '../dist/demo-bot.js';

test('бот выключен по умолчанию и ничего не создаёт', async t => {
  delete process.env.DEMO_BOT_ENABLED;
  const app = buildApp();
  t.after(() => app.close());
  await app.listen({ port: 0, host: '127.0.0.1' });
  startDemoBot(app, app.server.address().port);
  await new Promise(resolve => setTimeout(resolve, 200));
  const response = await app.inject({ method: 'GET', url: '/complaints?simulated=true', headers: { 'x-demo-user': 'admin-1' } });
  assert.equal(response.json().total, 0);
});

test('бот подаёт обращения с пометкой «имитация» и уважает потолок', async t => {
  Object.assign(process.env, { DEMO_BOT_ENABLED: 'true', DEMO_BOT_INTERVAL_S: '0', DEMO_BOT_MAX_SIMULATED: '5', RATE_LIMIT_MAX: '0' });
  t.after(() => { for (const key of ['DEMO_BOT_ENABLED', 'DEMO_BOT_INTERVAL_S', 'DEMO_BOT_MAX_SIMULATED', 'DEMO_SIMULATION_ENABLED', 'RATE_LIMIT_MAX']) delete process.env[key]; });
  const app = buildApp();
  t.after(() => app.close());
  await app.listen({ port: 0, host: '127.0.0.1' });
  startDemoBot(app, app.server.address().port);
  let body;
  for (let i = 0; i < 50; i++) {
    await new Promise(resolve => setTimeout(resolve, 100));
    body = (await app.inject({ method: 'GET', url: '/complaints?simulated=true&limit=100', headers: { 'x-demo-user': 'admin-1' } })).json();
    if (body.total >= 5) break;
  }
  assert.equal(body.total, 5, 'потолок DEMO_BOT_MAX_SIMULATED: ровно 5 имитированных');
  assert.ok(body.items.every(item => item.simulated === true));
  const seed = (await app.inject({ method: 'GET', url: '/complaints?simulated=false&limit=100', headers: { 'x-demo-user': 'admin-1' } })).json();
  assert.equal(seed.total, 20, 'seed-обращения бот не добавляет и не удаляет');
});
