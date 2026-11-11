// Адаптивная вёрстка (#112, R10): экраны демо на 360, 768 и 1280 px без горизонтального скролла.
// Роль хранится в памяти SPA, поэтому после первого открытия ходим по ссылкам и переключателю роли.
import { test, expect } from '@playwright/test';

const widths = [360, 768, 1280];
const narrow = 360;

async function switchRole(page, role) {
  await page.getByLabel('Демонстрационная роль').selectOption(role);
}

function menuLink(page, name) {
  return page.getByRole('navigation', { name: 'Основное меню' }).getByRole('link', { name });
}

async function expectNoHorizontalScroll(page, screen) {
  const size = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  expect(size.scroll, `${screen}: scrollWidth ${size.scroll} > innerWidth ${size.inner}`).toBeLessThanOrEqual(size.inner);
}

/** Кнопки и поля на узком экране: область нажатия не меньше 40 px по высоте. */
async function expectTapTargets(page, screen) {
  const small = await page.evaluate(() => {
    const controls = [...document.querySelectorAll('button, select, textarea, input, .primary-link, nav a')];
    return controls.flatMap(element => {
      const target = element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio')
        ? element.closest('label') ?? element
        : element;
      const box = target.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) return [];
      return box.height < 40 ? [`${element.tagName.toLowerCase()} «${(target.textContent || element.getAttribute('aria-label') || '').trim().slice(0, 30)}» ${box.height}px`] : [];
    });
  });
  expect(small, `${screen}: мелкие элементы`).toEqual([]);
}

async function checkScreen(page, width, screen, heading) {
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  await expectNoHorizontalScroll(page, `${width}px ${screen}`);
  if (width === narrow) await expectTapTargets(page, `${width}px ${screen}`);
}

for (const width of widths) {
  test(`экраны демо без горизонтального скролла на ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    await switchRole(page, 'employee');

    await menuLink(page, 'Новое обращение').click();
    await checkScreen(page, width, 'подача', 'Новое обращение');

    await menuLink(page, 'Мои обращения').click();
    await checkScreen(page, width, 'мои обращения', 'Мои обращения');
    await page.locator('.complaint-list .complaint-number').first().click();
    await checkScreen(page, width, 'карточка автора', /^Обращение /);

    // После #203 смена роли на карточке ведёт на парную карточку /queue/:id, поэтому в очередь идём через меню.
    await switchRole(page, 'manager');
    await menuLink(page, 'Очередь обращений').click();
    await checkScreen(page, width, 'очередь', 'Очередь обращений');
    if (width === narrow) {
      const toggle = page.getByRole('button', { name: 'Фильтры', exact: true });
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(page.locator('form.filter-form')).toBeHidden();
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator('form.filter-form')).toBeVisible();
      await expectNoHorizontalScroll(page, `${width}px очередь с фильтрами`);
      await expectTapTargets(page, `${width}px очередь с фильтрами`);
    } else {
      await expect(page.locator('form.filter-form')).toBeVisible();
    }
    await page.locator('.complaint-list .complaint-number').first().click();
    await checkScreen(page, width, 'карточка руководителя', /^Обращение /);

    await switchRole(page, 'admin');
    await checkScreen(page, width, 'сводка', 'Сводка');
  });
}

test('на узком экране шапка: навигация и переключатель роли не перекрываются', async ({ page }) => {
  await page.setViewportSize({ width: narrow, height: 800 });
  await page.goto('/');
  await switchRole(page, 'employee');
  const select = page.getByLabel('Демонстрационная роль');
  const links = page.getByRole('navigation', { name: 'Основное меню' }).getByRole('link');
  await expect(select).toBeVisible();
  await expect(links).toHaveCount(2);
  const boxes = [await select.boundingBox()];
  for (const link of await links.all()) {
    await expect(link).toBeVisible();
    boxes.push(await link.boundingBox());
  }
  for (const box of boxes) {
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(narrow);
  }
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const [a, b] = [boxes[i], boxes[j]];
      const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      expect(overlap, `элементы шапки ${i} и ${j} перекрываются`).toBe(false);
    }
  }
  await menuLink(page, 'Новое обращение').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Новое обращение' })).toBeVisible();
});
