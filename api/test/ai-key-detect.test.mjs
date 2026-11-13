import assert from 'node:assert/strict';
import test from 'node:test';
import { compatConfigsFromEnv } from '../dist/ai/openai-compatible.js';

test('ключ Groq в переменной xAI всё равно уходит к Groq', () => {
  const [config] = compatConfigsFromEnv({ XAI_API_KEY: 'gsk_abc123' });
  assert.equal(config.kind, 'groq');
});
test('Groq-ключ в GROQ_API_KEY и Gemini-ключ в GEMINI_API_KEY образуют цепочку gemini → groq', () => {
  const kinds = compatConfigsFromEnv({ GEMINI_API_KEY: 'AIzaX', GROQ_API_KEY: 'gsk_x' }).map(config => config.kind);
  assert.deepEqual(kinds, ['gemini', 'groq']);
});
test('Gemini-ключ в чужой переменной распознаётся по префиксу, без ключей цепочка пуста', () => {
  assert.equal(compatConfigsFromEnv({ GROQ_API_KEY: 'AIzaSomething' })[0].kind, 'gemini');
  assert.deepEqual(compatConfigsFromEnv({}), []);
});
