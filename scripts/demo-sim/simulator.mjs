// Демо-симулятор (#146): ведёт себя как люди, ходит только в публичное API по HTTP. Без зависимостей, без сети кроме адреса API, без LLM.
import { readFileSync } from 'node:fs';

export const SOURCE_HEADER = 'X-Demo-Source';
const ADMIN = 'admin-1';
const MAX_RETRIES = 10;
const PAGE = 100;
const OPEN_QUEUE_SOFT_CAP = 30;

const contract = JSON.parse(readFileSync(new URL('../../contracts/api.yaml', import.meta.url), 'utf8'));
const seedRows = JSON.parse(readFileSync(new URL('../../api/data/seed.json', import.meta.url), 'utf8'));
const TRANSITIONS = contract['x-status-transitions'];
const TERMINAL = Object.keys(TRANSITIONS).filter(status => TRANSITIONS[status].length === 0);

const COMMENTS = ['Принято, изучаю детали.', 'Согласовал с коллегами, двигаемся дальше.', 'Нужно время на проверку, вернусь с ответом.',
  'Передал вопрос профильным специалистам.', 'Проверили, подтверждаем описанную ситуацию.'];
const CLARIFICATIONS = ['Уточните, пожалуйста, пример: в каком случае это произошло?', 'Опишите, какого результата вы ожидаете?',
  'Подскажите, как часто это повторяется?'];
const ANSWERS = ['Добавляю: это случается примерно раз в неделю.', 'Пример: последняя заявка прошлой недели.', 'Ожидаю, что процесс станет короче.'];
const SOLVED = ['Изменение внесено, процесс обновлён.', 'Вопрос решён, участники уведомлены.', 'Предложение внедрено в рабочую практику.'];
const REFUSED = ['Сейчас нет ресурсов для изменения, вернёмся к вопросу позже.', 'Предложение противоречит действующему регламенту.',
  'Вопрос находится вне зоны ответственности подразделения.'];
const PRIORITIES = ['low', 'medium', 'high'];

/** Детерминированный генератор (mulberry32). */
export function createRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class SimulatorError extends Error {
  constructor(message, code = 1) { super(message); this.exitCode = code; }
}

/** Ожидание, которое прерывается сигналом остановки. */
export function abortableSleep(ms, signal) {
  return new Promise(resolve => {
    if (ms <= 0 || signal?.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() { clearTimeout(timer); signal?.removeEventListener('abort', done); resolve(); }
    signal?.addEventListener('abort', done, { once: true });
  });
}

function createClient({ baseUrl, fetchImpl, sleep, signal, onRetry }) {
  return async function request(method, path, user, body) {
    for (let attempt = 0; ; attempt++) {
      let response;
      try {
        response = await fetchImpl(baseUrl + path, { method, signal: undefined,
          headers: { 'X-Demo-User': user, [SOURCE_HEADER]: 'simulator', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
          body: body === undefined ? undefined : JSON.stringify(body) });
      } catch (error) {
        throw new SimulatorError(`API недоступен по адресу ${baseUrl}: ${error.cause?.code ?? error.message}`);
      }
      if (response.status === 429 && attempt < MAX_RETRIES) {
        const seconds = Number(response.headers.get('retry-after'));
        const waitMs = (Number.isFinite(seconds) && seconds > 0 ? seconds : 1) * 1000;
        onRetry?.(waitMs);
        await sleep(waitMs, signal);
        if (signal?.aborted) return { status: 429, body: null, aborted: true };
        continue;
      }
      let parsed = null;
      try { parsed = await response.json(); } catch { /* пустое тело */ }
      return { status: response.status, body: parsed };
    }
  };
}

const pick = (rng, list) => list[Math.floor(rng() * list.length)];

/**
 * Прогон симуляции. Параметры: baseUrl, seed, maxEvents, intervalMs, sleep, log, signal, fetch.
 * Возвращает { events, actions, counters, errors, stopped }.
 */
export async function runSimulation(options) {
  const { baseUrl, maxEvents = Infinity, intervalMs = 8000, log = () => {}, signal } = options;
  const sleep = options.sleep ?? abortableSleep;
  const seed = options.seed ?? Math.floor(Math.random() * 2 ** 31);
  const rng = createRng(seed);
  const counters = { submitted: 0, taken: 0, progressed: 0, commented: 0, clarified: 0, answered: 0, resolved: 0, rejected: 0, undone: 0, skipped: 0 };
  const result = { events: 0, actions: [], counters, errors: 0, stopped: false, seed };
  const request = createClient({ baseUrl: baseUrl.replace(/\/$/, ''), fetchImpl: options.fetch ?? globalThis.fetch, sleep, signal,
    onRetry: ms => log(`лимит запросов API (429): жду ${ms / 1000} с и повторяю`) });

  const health = await request('GET', '/health', ADMIN);
  if (health.status !== 200) throw new SimulatorError(`API не отвечает на /health (статус ${health.status}).`);
  const reference = await request('GET', '/reference-data', ADMIN);
  if (reference.status !== 200) throw new SimulatorError(`Не удалось прочитать справочники (статус ${reference.status}).`);
  const managers = reference.body.assignees;
  const categories = new Set(reference.body.categories.map(category => category.id));
  const templates = seedRows.filter(row => categories.has(row.categoryId));
  const employees = new Map();
  for (let offset = 0, total = 1; offset < total; offset += PAGE) {
    const page = await request('GET', `/complaints?limit=${PAGE}&offset=${offset}`, ADMIN);
    if (page.status !== 200) throw new SimulatorError(`Не удалось прочитать список обращений (статус ${page.status}).`);
    total = page.body.total;
    for (const item of page.body.items) if (item.author?.id && item.author.role === 'employee') employees.set(item.author.id, item.author);
  }
  if (managers.length === 0 || templates.length === 0) throw new SimulatorError('В API нет руководителей или нет шаблонов обращений.');
  if (employees.size === 0) employees.set('employee-1', { id: 'employee-1', name: 'Сотрудник закупок' });
  const employeeList = [...employees.values()];
  const managerById = new Map(managers.map(manager => [manager.id, manager]));
  const nameOf = id => (managerById.get(id) ?? employees.get(id))?.name ?? id;
  let last = null; // последнее действие руководителя над статусом: кандидат на откат

  async function simulatedOpen() {
    const items = [];
    for (let offset = 0, total = 1; offset < total; offset += PAGE) {
      const page = await request('GET', `/complaints?simulated=true&limit=${PAGE}&offset=${offset}`, ADMIN);
      if (page.status !== 200) throw new SimulatorError(`Не удалось прочитать список обращений (статус ${page.status}).`);
      total = page.body.total;
      items.push(...page.body.items);
    }
    return items.filter(item => !TERMINAL.includes(item.status));
  }
  const can = (item, target) => TRANSITIONS[item.status].includes(target);
  const managerFor = item => item.assignee?.id ?? pick(rng, managers).id;

  async function act(type, item) {
    const done = (response, text, counter) => {
      if (response.status >= 500 || (response.status >= 400 && ![404, 409].includes(response.status))) {
        result.errors++; log(`ошибка API ${response.status}: ${text}`); return false;
      }
      if (response.status >= 400) { counters.skipped++; log(`пропуск (${response.status}): ${text}`); return false; }
      counters[counter]++; log(text); return true;
    };
    switch (type) {
      case 'submit': {
        const employee = pick(rng, employeeList), row = pick(rng, templates);
        const response = await request('POST', '/complaints', employee.id,
          { type: row.type, categoryId: row.categoryId, description: row.description, priority: pick(rng, PRIORITIES) });
        if (response.status === 201 && response.body.simulated !== true) {
          throw new SimulatorError('Имитация выключена: API не пометил обращение как simulated. Запустите API с DEMO_SIMULATION_ENABLED=true.', 2);
        }
        return done(response, `сотрудник ${employee.name} подал обращение ${response.body?.number ?? ''}`.trim(), 'submitted');
      }
      case 'take': {
        let managerId = item.assignee?.id;
        if (!managerId) {
          managerId = pick(rng, managers).id;
          const assigned = await request('PATCH', `/complaints/${item.id}/assignment`, managerId, { assigneeId: managerId });
          if (assigned.status >= 400) return done(assigned, `не удалось назначить ${item.number}`, 'taken');
        }
        const response = await request('PATCH', `/complaints/${item.id}/status`, managerId, { status: 'in_review' });
        if (response.status === 200) last = { id: item.id, managerId };
        return done(response, `руководитель ${nameOf(managerId)} взял в работу обращение ${item.number}`, 'taken');
      }
      case 'progress': {
        const managerId = managerFor(item);
        const response = await request('PATCH', `/complaints/${item.id}/status`, managerId, { status: 'in_progress' });
        if (response.status === 200) last = { id: item.id, managerId };
        return done(response, `руководитель ${nameOf(managerId)} начал выполнение по обращению ${item.number}`, 'progressed');
      }
      case 'comment': {
        const managerId = managerFor(item);
        const response = await request('POST', `/complaints/${item.id}/comments`, managerId, { kind: 'comment', text: pick(rng, COMMENTS) });
        return done(response, `руководитель ${nameOf(managerId)} ответил по обращению ${item.number}`, 'commented');
      }
      case 'clarify': {
        const managerId = managerFor(item);
        const response = await request('POST', `/complaints/${item.id}/comments`, managerId, { kind: 'clarification_request', text: pick(rng, CLARIFICATIONS) });
        return done(response, `руководитель ${nameOf(managerId)} запросил уточнение по обращению ${item.number}`, 'clarified');
      }
      case 'answer': {
        const response = await request('POST', `/complaints/${item.id}/comments`, item.author.id, { kind: 'clarification_response', text: pick(rng, ANSWERS) });
        return done(response, `сотрудник ${nameOf(item.author.id)} уточнил обращение ${item.number}`, 'answered');
      }
      case 'resolve': {
        const managerId = managerFor(item);
        const response = await request('POST', `/complaints/${item.id}/decision`, managerId, { outcome: 'implemented', explanation: pick(rng, SOLVED) });
        return done(response, `руководитель ${nameOf(managerId)} закрыл обращение ${item.number} как решённое`, 'resolved');
      }
      case 'reject': {
        const managerId = managerFor(item);
        const response = await request('POST', `/complaints/${item.id}/decision`, managerId, { outcome: 'rejected', explanation: pick(rng, REFUSED) });
        return done(response, `руководитель ${nameOf(managerId)} отклонил обращение ${item.number}`, 'rejected');
      }
      case 'undo': {
        const response = await request('POST', `/complaints/${item.id}/undo`, last.managerId);
        last = null;
        return done(response, `руководитель ${nameOf(item.undoManager)} откатил последнее действие по обращению ${item.number}`, 'undone');
      }
      default: throw new Error(`неизвестное действие ${type}`);
    }
  }

  async function tick() {
    const open = await simulatedOpen();
    const by = predicate => open.filter(predicate);
    const groups = {
      take: by(item => item.status === 'new' && can(item, 'in_review')),
      progress: by(item => item.status === 'in_review' && can(item, 'in_progress')),
      comment: by(item => ['in_review', 'in_progress'].includes(item.status)),
      clarify: by(item => ['in_review', 'in_progress'].includes(item.status) && can(item, 'awaiting_clarification')),
      answer: by(item => item.status === 'awaiting_clarification'),
      resolve: by(item => can(item, 'implemented') && item.status !== 'new'),
      reject: by(item => can(item, 'rejected')),
      undo: [],
    };
    if (last) {
      const target = open.find(item => item.id === last.id);
      if (target) {
        const view = await request('GET', `/complaints/${target.id}`, last.managerId);
        if (view.status === 200 && view.body.canUndo === true) groups.undo = [{ ...target, undoManager: last.managerId }];
      }
    }
    const weights = { submit: open.length >= OPEN_QUEUE_SOFT_CAP ? 1 : 4, take: 3, progress: 2, comment: 2, clarify: 1, answer: 3, resolve: 2, reject: 1, undo: 1 };
    const choices = Object.entries(weights).filter(([type]) => type === 'submit' || groups[type].length > 0);
    let roll = rng() * choices.reduce((sum, [, weight]) => sum + weight, 0);
    const [type] = choices.find(([, weight]) => (roll -= weight) < 0) ?? choices.at(-1);
    const item = type === 'submit' ? null : pick(rng, groups[type]);
    const ok = await act(type, item);
    result.actions.push({ type, ok, complaint: item?.number ?? null });
  }

  while (!signal?.aborted && result.events < maxEvents) {
    await tick();
    result.events++;
    if (result.events < maxEvents) await sleep(intervalMs, signal);
  }
  result.stopped = Boolean(signal?.aborted);
  return result;
}

export function summaryLine(result) {
  const c = result.counters;
  return `Итог: подано ${c.submitted}, взято в работу ${c.taken}, отклонено ${c.rejected}, решено ${c.resolved}, `
    + `в процессе ${c.progressed}, ответов ${c.commented}, уточнений ${c.clarified}, откатов ${c.undone}, пропущено ${c.skipped}, ошибок ${result.errors}.`;
}
