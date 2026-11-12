// Local evidence for the design mockup, not product/API acceptance tests.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../../', import.meta.url));
const e2eRequire = createRequire(join(root, 'tests/e2e/package.json'));
const qaRequire = createRequire(join(root, '.hk/qa-tools/package.json'));
const { chromium } = e2eRequire('@playwright/test');
const axe = qaRequire.resolve('axe-core/axe.min.js');
const folder = fileURLToPath(new URL('evidence/', import.meta.url));
const url = process.env.ADMIN_MOCKUP_URL || 'http://127.0.0.1:5195/mockup.html';
const checks = [];
const screenshots = [];
const browser = await chromium.launch({ headless: true });
await mkdir(folder, { recursive: true });
async function check(name, fn) {
  try { const detail = await fn(); checks.push({ name, status: 'pass', detail }); }
  catch (error) { checks.push({ name, status: 'fail', detail: String(error) }); }
}

try {
  for (const width of [360, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: width === 360 ? 800 : 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    const requests = [];
    const confirmations = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('request', request => requests.push(request.url()));
    page.on('dialog', async dialog => {
      confirmations.push({ type: dialog.type(), message: dialog.message() });
      if (dialog.type() === 'confirm') await dialog.accept(); else await dialog.dismiss();
    });
    await page.goto(url);
    const capture = async name => {
      const artifact = `${name}-${width}.png`;
      await page.screenshot({ path: join(folder, artifact), fullPage: true });
      screenshots.push({ viewport: width === 360 ? '360x800' : '1280x900', artifact, observation: name });
    };
    const nav = async name => {
      if (width === 360) await page.getByRole('button', { name: 'Меню', exact: true }).click();
      await page.locator('#nav').getByRole('button', { name, exact: true }).click();
    };

    await check(`${width}: initial layout`, async () => {
      assert.equal(await page.locator('#title').textContent(), 'Пользователи');
      assert.equal(await page.locator('#nav').isVisible(), width !== 360);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await capture('users');
      return 'Users active; mobile menu closed; document fits viewport';
    });
    if (width === 360) await check('360: mobile menu keyboard', async () => {
      await page.getByRole('button', { name: 'Меню', exact: true }).click();
      assert.equal(await page.locator('#menu').getAttribute('aria-expanded'), 'true');
      assert.equal(await page.locator('#nav').evaluate(nav => nav.contains(document.activeElement)), true);
      await capture('menu-open');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#nav').isVisible(), false);
      assert.equal(await page.locator('#menu').evaluate(el => el === document.activeElement), true);
      return 'Open focuses navigation; Escape closes and restores trigger';
    });
    await check(`${width}: keyboard focus`, async () => {
      await page.locator('#state').focus();
      await page.keyboard.press('Tab');
      const focus = await page.evaluate(() => {
        const el = document.activeElement;
        const css = getComputedStyle(el);
        return { tag: el.tagName, outline: css.outlineStyle, width: css.outlineWidth };
      });
      assert.notEqual(focus.tag, 'BODY');
      assert.notEqual(focus.outline, 'none');
      return focus;
    });
    for (const state of ['Загрузка', 'Пусто', 'Ошибка', 'Частичные данные', 'Нет доступа', 'Успех']) {
      await check(`${width}: state ${state}`, async () => {
        await page.locator('#state').selectOption({ label: state });
        const notice = (await page.locator('#stateMessage').innerText()).trim();
        assert.ok(notice.length > 0);
        if (['Загрузка', 'Пусто', 'Ошибка', 'Нет доступа'].includes(state)) {
          assert.equal((await page.locator('#content').innerText()).trim(), '');
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await capture(`state-${['Загрузка','Пусто','Ошибка','Частичные данные','Нет доступа','Успех'].indexOf(state)}`);
        await page.locator('#recover').click();
        assert.equal(await page.locator('#state').inputValue(), 'Готово');
        return notice;
      });
    }
    await check(`${width}: user card and read-only preview`, async () => {
      await page.getByRole('button', { name: 'Анна Соколова', exact: true }).click();
      assert.equal(await page.locator('#dialog').isVisible(), true);
      assert.equal(await page.locator('input[type=password]').count(), 0);
      await capture('user-card');
      await page.getByRole('button', { name: 'Глазами пользователя', exact: true }).click();
      assert.equal(await page.locator('#banner').isVisible(), true);
      assert.ok((await page.locator('#banner').innerText()).includes('anna.s'));
      assert.equal(await page.locator('#nav').isVisible(), false);
      assert.equal(await page.locator('#banner').evaluate(el => el === document.activeElement), true);
      assert.equal(await page.locator('#content button:enabled').count(), 0);
      assert.ok((await page.locator('main').boundingBox()).width >= width * 0.9, 'Preview uses the full workspace after hiding admin navigation');
      await capture('preview');
      await page.getByRole('button', { name: 'Вернуться к администратору', exact: true }).click();
      assert.equal(await page.locator('#banner').isVisible(), false);
      assert.equal(await page.locator('#title').innerText(), 'Пользователи');
      return 'Target identity shown; admin navigation hidden; mutation controls disabled; return works';
    });
    await check(`${width}: last administrator guard`, async () => {
      await page.getByRole('button', { name: 'Павел Лебедев', exact: true }).click();
      await page.locator('#form input[name=active]').uncheck();
      await page.getByRole('button', { name: 'Сохранить в макете', exact: true }).click();
      assert.equal(await page.locator('#dialog').isVisible(), true);
      assert.match(await page.locator('#dialogStatus').innerText(), /Последнего активного администратора/);
      await page.locator('#close').click();
      return 'Local example blocks disabling last administrator; not evidence of API protection';
    });
    await check(`${width}: long display name`, async () => {
      const longName = 'Александра'.repeat(9);
      await page.getByRole('button', { name: 'Анна Соколова', exact: true }).click();
      await page.locator('#form input[name=name]').fill(longName);
      await page.getByRole('button', { name: 'Сохранить в макете', exact: true }).click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await capture('long-name');
      await page.getByRole('button', { name: longName, exact: true }).click();
      await page.locator('#form input[name=name]').fill('Анна Соколова');
      await page.getByRole('button', { name: 'Сохранить в макете', exact: true }).click();
      await page.locator('#state').selectOption({ label: 'Готово' });
      return '81-character unbroken synthetic display name wraps without document overflow';
    });
    await check(`${width}: roles and overview`, async () => {
      await nav('Роли и права');
      await page.locator('#role').selectOption('admin');
      await capture('roles');
      await page.locator('#createRole').click();
      await page.locator('#roleForm input[name=roleName]').fill('Координатор');
      await page.locator('#roleForm [name=description]').fill('Синтетическая роль для проверки');
      await page.locator('#roleForm button[type=submit]').click();
      assert.equal(await page.locator('#role option:checked').textContent(), 'Координатор');
      const newRoleId = await page.locator('#role').inputValue();
      await page.locator('#renameRole').click();
      await page.locator('#roleForm input[name=roleName]').fill('Координатор обращений');
      await page.locator('#roleForm button[type=submit]').click();
      assert.equal(await page.locator('#role').inputValue(), newRoleId);
      assert.equal(await page.locator('#role option:checked').textContent(), 'Координатор обращений');
      await capture('role-renamed');
      await page.locator('[data-cap="0"]').check();
      await page.locator('#saveRole').click();
      assert.ok(confirmations.some(d => d.message.includes('пользовател')));
      await page.locator('#cloneRole').click();
      await page.locator('#roleForm input[name=roleName]').fill('Резервный координатор');
      await page.locator('#roleForm button[type=submit]').click();
      const cloneId = await page.locator('#role').inputValue();
      assert.notEqual(cloneId, newRoleId);
      await page.locator('#deleteRole').click();
      assert.equal(await page.locator(`#role option[value="${cloneId}"]`).count(), 0);
      await page.locator('#role').selectOption(newRoleId);
      await page.locator('#archiveRole').click();
      assert.equal(await page.locator('#archiveRole').innerText(), 'Восстановить роль');
      await page.locator('#archiveRole').click();
      assert.equal(await page.locator('#archiveRole').innerText(), 'Архивировать роль');
      await nav('Пользователи');
      await page.getByRole('button', { name: 'Анна Соколова', exact: true }).click();
      await page.locator('#form select[name=role]').selectOption(newRoleId);
      await page.getByRole('button', { name: 'Сохранить в макете', exact: true }).click();
      await nav('Роли и права');
      await page.locator('#role').selectOption(newRoleId);
      await page.locator('#deleteRole').click();
      assert.equal(await page.locator(`#role option[value="${newRoleId}"]`).count(), 1);
      assert.match(await page.locator('#roleStatus').innerText(), /переназначьте/);
      await capture('role-assigned');
      await page.locator('#role').selectOption('admin');
      await page.locator('#renameRole').click();
      await page.locator('#roleForm input[name=roleName]').fill('Системный администратор');
      await page.locator('#roleForm button[type=submit]').click();
      assert.equal(await page.locator('#role').inputValue(), 'admin');
      await nav('Пользователи');
      await page.getByRole('button', { name: 'Павел Лебедев', exact: true }).click();
      await page.locator('#form input[name=active]').uncheck();
      await page.getByRole('button', { name: 'Сохранить в макете', exact: true }).click();
      assert.match(await page.locator('#dialogStatus').innerText(), /Последнего активного администратора/);
      await page.locator('#close').click();
      await nav('Обзор');
      await page.getByRole('button', { name: 'Динамика', exact: true }).click();
      assert.equal(await page.getByRole('button', { name: 'Динамика', exact: true }).getAttribute('aria-pressed'), 'true');
      await capture('overview');
      await nav('Пользователи');
      return { observation: 'Create, rename with stable ID, permissions confirmation, clone, archive/restore, assign and blocked deletion; system rename preserves last-admin guard; overview switch works', confirmations };
    });
    await check(`${width}: accessibility sample`, async () => {
      await page.addScriptTag({ path: axe });
      const result = await page.evaluate(async () => {
        const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
        return { violations: r.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })), incomplete: r.incomplete.map(v => ({ id: v.id, nodes: v.nodes.length })) };
      });
      assert.equal(result.violations.length, 0, JSON.stringify(result));
      assert.equal(result.incomplete.length, 0, `Needs manual review: ${JSON.stringify(result.incomplete)}`);
      return result;
    });
    await check(`${width}: isolated mockup`, async () => {
      assert.equal(errors.length, 0, errors.join('\n'));
      const external = requests.filter(value => !value.startsWith(new URL(url).origin));
      assert.equal(external.length, 0, external.join('\n'));
      assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
      return { runtimeErrors: errors.length, externalRequests: external.length, reducedMotion: true };
    });
    await context.close();
  }
} finally {
  await browser.close();
  await writeFile(join(folder, 'checks.json'), JSON.stringify({ generatedAt: new Date().toISOString(), url, scope: 'Mockup only; no production auth or API exercised', checks, screenshots }, null, 2));
}
console.log(JSON.stringify({ passed: checks.filter(c => c.status === 'pass').length, failed: checks.filter(c => c.status === 'fail') }, null, 2));
if (checks.some(c => c.status === 'fail')) process.exitCode = 1;
