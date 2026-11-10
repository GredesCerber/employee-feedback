// Окружение дочерних процессов демо-запуска (#186).
// --seed-reset должен запускать API на исходном seed в памяти: ключ PERSIST_FILE не передаётся вовсе
// (пустая строка API отклоняет), а сам файл данных не открывается и не меняется.

/** Ключи окружения, которые нужно убрать у дочернего API. */
export function seedResetUnset(seedReset) {
  return seedReset ? ['PERSIST_FILE'] : [];
}

/** Окружение потомка: родительское + явные значения, без перечисленных ключей. */
export function childEnv(parent, env = {}, unset = []) {
  const result = { ...parent, ...env };
  for (const key of unset) delete result[key];
  return result;
}
