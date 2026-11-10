import { readFile, writeFile } from 'node:fs/promises';
import openapiTS, { astToString } from 'openapi-typescript';

const source = new URL('../../contracts/api.yaml', import.meta.url);
const target = new URL('../src/api/schema.d.ts', import.meta.url);
// Request defaults do not make optional contract fields mandatory for callers.
const generated = astToString(await openapiTS(source, { defaultNonNullable: false }));
const contract = JSON.parse(await readFile(source, 'utf8'));
const policy = `// Generated from contracts/api.yaml; do not edit.\nexport const statusTransitions = ${JSON.stringify(contract['x-status-transitions'], null, 2)} as const;\n`;
for (const [file, content] of [[target, generated], [new URL('../src/api/policy.ts', import.meta.url), policy]]) {
  if (process.argv.includes('--write')) {
    await writeFile(file, content);
  } else if ((await readFile(file, 'utf8')).replaceAll('\r\n', '\n') !== content.replaceAll('\r\n', '\n')) {
    throw new Error('API types or policy differ from contracts/api.yaml. Run npm --prefix web run api:generate.');
  }
}
