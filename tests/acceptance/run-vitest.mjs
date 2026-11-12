import { spawnSync } from 'node:child_process';
import { mkdirSync, rmdirSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const slots = availableParallelism() <= 4 ? 1 : 2;

// Node's acceptance runner executes test files in separate sibling processes.
// Bound their combined jsdom load without changing the tests or their execution timeouts.
export async function runVitest(args, options) {
  const deadline = performance.now() + 300_000;
  while (performance.now() < deadline) {
    for (let index = 0; index < slots; index++) {
      const slot = join(tmpdir(), `employee-feedback-vitest-${process.ppid}-${index}.lock`);
      try {
        mkdirSync(slot);
      } catch (error) {
        if (error.code === 'EEXIST') continue;
        throw error;
      }

      try {
        return spawnSync(process.execPath, [...args, '--maxWorkers=1'], options);
      } finally {
        rmdirSync(slot);
      }
    }
    await delay(100);
  }
  throw new Error('No Vitest slot became available within five minutes');
}
