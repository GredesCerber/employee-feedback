import type { FastifyInstance } from 'fastify';

/**
 * Фоновая имитация «живого сервиса» внутри процесса хостинга (DEMO_BOT_ENABLED=true).
 * Тот же симулятор, что `npm run demo:sim`, но он ходит в этот же API по loopback:
 * сотрудники подают обращения, руководители берут в работу, отвечают и закрывают.
 * Всё помечено simulated=true («Имитация» в интерфейсе); seed-обращения бот не трогает.
 */
export function startDemoBot(app: FastifyInstance, port: number): void {
  if (process.env.DEMO_BOT_ENABLED !== 'true') return;
  // Заголовок X-Demo-Source учитывается только при этом флаге.
  process.env.DEMO_SIMULATION_ENABLED = 'true';
  const intervalS = Number(process.env.DEMO_BOT_INTERVAL_S ?? 25);
  const maxSimulated = Number(process.env.DEMO_BOT_MAX_SIMULATED ?? 60);
  const controller = new AbortController();
  app.server.once('close', () => controller.abort());
  const path = '../../scripts/demo-sim/simulator.mjs';
  void (async () => {
    try {
      const { runSimulation } = await import(new URL(path, import.meta.url).href) as {
        runSimulation: (options: Record<string, unknown>) => Promise<unknown>;
      };
      app.log.info({ event: 'demo_bot_start', intervalS, maxSimulated }, 'demo bot started');
      // Ошибки сети/API не должны валить сервис: перезапуск цикла с паузой.
      while (!controller.signal.aborted) {
        try {
          await runSimulation({ baseUrl: `http://127.0.0.1:${port}`, intervalMs: intervalS * 1000, maxSimulated,
            signal: controller.signal, log: (line: string) => app.log.debug({ event: 'demo_bot' }, line) });
        } catch (error) {
          app.log.warn({ event: 'demo_bot_error', message: (error as Error).message }, 'demo bot restarting');
        }
        await new Promise(resolve => setTimeout(resolve, 30_000).unref());
      }
    } catch (error) {
      app.log.error({ event: 'demo_bot_failed', message: (error as Error).message }, 'demo bot failed to start');
    }
  })();
}
