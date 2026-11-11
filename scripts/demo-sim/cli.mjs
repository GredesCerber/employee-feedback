// Разбор аргументов и запуск демо-симулятора (#146).
import { SimulatorError, runSimulation, summaryLine } from './simulator.mjs';

export const HELP = `Демо-симулятор «живого сервиса» (#146). Включается только вручную.

  DEMO_SIMULATION_ENABLED=true npm run demo:sim -- [опции]

Опции:
  --interval <сек>     пауза между шагами, по умолчанию 8
  --seed <N>           зерно генератора: прогон повторяется
  --max-events <N>     остановиться после N шагов
  --once               один шаг (то же, что --max-events 1)
  --api-url <адрес>    адрес API, по умолчанию http://127.0.0.1:3000
  --help               эта справка

API должен быть запущен с DEMO_SIMULATION_ENABLED=true, эту же переменную нужно задать и команде.
Остановка: Ctrl+C, в конце печатается итог.`;

/** Возвращает { options } либо { error } либо { help }. */
export function parseArgs(argv) {
  const options = { intervalMs: 8000, seed: undefined, maxEvents: Infinity, once: false, apiUrl: 'http://127.0.0.1:3000' };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = () => argv[++i];
    if (flag === '--help' || flag === '-h') return { help: true, options };
    if (flag === '--once') { options.once = true; options.maxEvents = 1; continue; }
    if (flag === '--interval') {
      const seconds = Number(value());
      if (!Number.isFinite(seconds) || seconds < 0) return { error: '--interval: неотрицательное число секунд', options };
      options.intervalMs = Math.round(seconds * 1000);
    } else if (flag === '--seed') {
      const raw = value();
      if (!/^\d+$/.test(raw ?? '')) return { error: '--seed: целое неотрицательное число', options };
      options.seed = Number(raw);
    } else if (flag === '--max-events') {
      const raw = value();
      if (!/^\d+$/.test(raw ?? '') || Number(raw) < 1) return { error: '--max-events: целое число от 1', options };
      options.maxEvents = Number(raw);
    } else if (flag === '--api-url') {
      const raw = value() ?? '';
      if (!/^https?:\/\/[^\s/]+(\/[^\s]*)?$/.test(raw)) return { error: '--api-url: адрес http(s)://хост:порт', options };
      options.apiUrl = raw.replace(/\/+$/, '');
    } else return { error: `Неизвестная опция ${flag}. См. --help`, options };
  }
  return { options };
}

const stamp = () => new Date().toTimeString().slice(0, 8);

/** Запуск. Возвращает код выхода: 0 успех, 1 ошибка API, 2 имитация выключена. */
export async function main(argv, { env = process.env, stdout = process.stdout, stderr = process.stderr, sleep, signal, fetch } = {}) {
  const parsed = parseArgs(argv);
  if (parsed.help) { stdout.write(`${HELP}\n`); return 0; }
  if (parsed.error) { stderr.write(`${parsed.error}\n`); return 2; }
  if (env.DEMO_SIMULATION_ENABLED !== 'true') {
    stderr.write('Имитация выключена: задайте DEMO_SIMULATION_ENABLED=true для API и для этой команды. Ничего не создано.\n');
    return 2;
  }
  const { options } = parsed;
  const seed = options.seed ?? Math.floor(Math.random() * 2 ** 31);
  const log = line => stdout.write(`[${stamp()}] ${line}\n`);
  log(`Симулятор запущен: API ${options.apiUrl}, seed ${seed}, интервал ${options.intervalMs / 1000} с. Остановка: Ctrl+C.`);
  try {
    const result = await runSimulation({ baseUrl: options.apiUrl, seed, maxEvents: options.maxEvents, intervalMs: options.intervalMs,
      sleep, signal, fetch, log });
    if (result.stopped) log('Симулятор остановлен.');
    stdout.write(`${summaryLine(result)}\n`);
    return result.errors > 0 ? 1 : 0;
  } catch (error) {
    if (!(error instanceof SimulatorError)) throw error;
    stderr.write(`${error.message}\n`);
    return error.exitCode;
  }
}
