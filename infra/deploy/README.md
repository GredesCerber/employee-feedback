# Render API + Vercel web без Docker

**Деплой наружу делает только человек** (AGENTS.md). Здесь только файлы и
инструкция: аккаунты, ресурсы и публикация агентом не создаются. Это демо с
синтетическими данными и переключателем роли, а не защищённый рабочий сервис.

## 1. Подготовка

- Возьмите прошедшую проверки версию `main` и запишите SHA для отката.
- Для локальных проверок нужен Node >=22.12, на обеих платформах выберите Node 22.
- Выполните `node --test tests/acceptance/104-hosting-config.test.mjs`.
- Для браузера на отдельном домене нужен CORS из задачи #94. До её принятия
  API `/health` доступен, но веб на Vercel не сможет читать API. Не считайте
  такую публикацию готовым демо. После принятия задайте точный origin веба
  в `CORS_ORIGINS` API, например `https://employee-feedback.vercel.app`.
  Несколько origins перечислите через запятую, без пути и завершающего `/`,
  включая нужный preview URL. Не используйте `*`.
- Все настройки перечислены в [ENV.md](../ENV.md). Данные API по умолчанию
  живут в памяти и сбрасываются при перезапуске; этот Blueprint не создаёт диск.

## 2. Render

1. В своём аккаунте создайте Blueprint из репозитория. Выберите `main` и путь
   Blueprint `infra/deploy/render.yaml`. Проверьте условия выбранного тарифа
   перед созданием ресурсов. Подтверждение создания выполняет человек.
2. Корень сервиса — корень репозитория, поле Root Directory оставьте пустым.
   API загружает `contracts/` рядом с `api/`, поэтому корень `api/` не подходит.
3. Blueprint задаёт сборку `npm --prefix api ci --include=dev && npm --prefix api run build`,
   запуск `npm --prefix api start`, health check `/health`, `HOST=0.0.0.0`,
   `NODE_ENV=production`, Node и лимиты из ENV.md. `PORT` назначает Render.
   `--include=dev` устанавливает TypeScript из devDependencies для сборки,
   даже когда npm по умолчанию исключает их при `NODE_ENV=production`.
   Рабочий API продолжает запускаться в production; флаг не меняет NODE_ENV.
4. Автовыкладка выключена (`autoDeployTrigger: off`). Выполните ручной deploy
   выбранного SHA, дождитесь успешной сборки и health check. Сохраните выданный
   HTTPS URL API — далее обозначен `API_URL`; это обозначение, не env приложения.

## 3. Vercel

1. Создайте проект вручную через Vercel CLI из **корня репозитория**, например
   с помощью `vercel link`. Настройте Node 22, корень `.`. В этом варианте
   выкладка выполняется CLI: файл вложен в `infra/`, автоматический импорт
   Git сам этот `vercel.json` не найдёт. Не включайте Git-автовыкладку без
   отдельной настройки тех же команд и правил маршрутизации.
2. В настройках проекта добавьте `VITE_API_BASE_URL` для Preview и Production:
   HTTPS URL API из Render без `/api` и завершающего `/`. После смены адреса
   требуется новая сборка. API-ключей и паролей здесь нет.
3. Человек выполняет предварительную публикацию из корня:

   ```sh
   vercel --local-config infra/deploy/vercel.json
   ```

   Конфиг устанавливает зависимости командой `npm --prefix web ci --include=dev`,
   чтобы Vite и TypeScript из devDependencies были доступны также в production.
   Затем выполняет `npm --prefix web run build`, отдаёт
   `web/dist` и направляет SPA-маршруты на `/index.html`.
4. Настройте CORS API на точный полученный origin и проверьте preview по пункту 4.
   После проверки человек публикует Production:

   ```sh
   vercel --prod --local-config infra/deploy/vercel.json
   ```

   Добавьте также Production origin в CORS и перепроверьте приложение. Команды
   выше публикуют сайт и требуют явного запуска человеком, тесты их не выполняют.

## 4. Проверка

Откройте `API_URL/health`: ожидается HTTP 200 и JSON с `status: "ok"` и `version`.
Откройте URL веба: список/форма загружаются, выбор роли работает. Подайте
синтетическое обращение, переключитесь на руководителя и откройте его карточку.
Обновите страницу на вложенном маршруте: SPA должна остаться рабочей.
В Network проверьте успешный OPTIONS с `X-Demo-User` и последующие запросы API,
а также отсутствие ошибок CORS. Если данные не грузятся, сначала проверьте
`VITE_API_BASE_URL`, затем точный origin и разрешённые заголовки на API.
Сценарий показа и демо-роли — в [основной инструкции](../README.md).

## 5. Откат

Сохраните SHA, адрес и время предыдущей успешной версии **обоих** сервисов.
На Render откройте Deploys нужного сервиса и выполните Rollback к предыдущей
успешной сборке. На Vercel откройте Deployments и выполните Instant Rollback
на предыдущую Production-версию. Если функция недоступна выбранному тарифу,
выложите сохранённый SHA вручную теми же командами из отдельного checkout.
Переменные окружения сверяйте отдельно: откат кода не гарантирует откат env.
Снова проверьте `/health`, форму и карточку. Состояние в памяти после рестарта
сбросится; восстановления пользовательских данных эта схема не обещает.

Документация платформ: [Render Blueprint](https://render.com/docs/blueprint-spec),
[Vercel local config](https://vercel.com/docs/cli/global-options#local-config),
[Vercel rewrites](https://vercel.com/docs/routing/rewrites),
[Render Node](https://render.com/docs/node-version),
[Render rollback](https://render.com/docs/rollbacks),
[Vercel rollback](https://vercel.com/docs/instant-rollback).
