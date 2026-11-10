import { readFile, writeFile } from 'node:fs/promises';
import openapiTS, { astToString } from 'openapi-typescript';

const source = new URL('../../contracts/api.yaml', import.meta.url);
const target = new URL('../src/api/schema.d.ts', import.meta.url);
// Request defaults do not make optional contract fields mandatory for callers.
const generated = astToString(await openapiTS(source, { defaultNonNullable: false }));
if (process.argv.includes('--write')) {
  await writeFile(target, generated);
} else if ((await readFile(target, 'utf8')).replaceAll('\r\n', '\n') !== generated.replaceAll('\r\n', '\n')) {
  throw new Error('API types differ from contracts/api.yaml. Run npm --prefix web run api:generate.');
}
