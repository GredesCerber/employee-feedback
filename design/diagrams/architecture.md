# Архитектура решения

> Задача #108, сверено с main на 13.11.2026: `docker-compose.yml`, `infra/nginx.conf`, `infra/web.Dockerfile`, `infra/api.Dockerfile`, `infra/hosted.Dockerfile`, `infra/render.yaml`, `api/src` (`app.ts`, `server.ts`, `store.ts`, `persistence.ts`, `pg-persistence.ts`, `complaints.ts`, `lifecycle.ts`, `analytics.ts`, `ai/provider.ts`, `ai/openai-compatible.ts`, `ai/anthropic.ts`, `seed.ts`). Полное описание — в [docs/architecture.md](../../docs/architecture.md).

**Подпись:** Архитектура прототипа: веб-интерфейс, API и хранилище с тремя режимами (память, файл, PostgreSQL); ИИ-провайдеры вызываются по ключам; 1С и Битрикс24 показаны как план.

```mermaid
flowchart LR
  user(["Сотрудник, руководитель, администратор<br/>браузер"])

  subgraph local["Локально: docker compose up или infra/run-demo.mjs"]
    direction LR
    nginx["nginx или serve-demo<br/>раздаёт собранный интерфейс<br/>React + Vite, прокси /api/"]
    api["API на Fastify, TypeScript<br/>обращения, статусы, комментарии,<br/>решения, сводка"]
    nginx -->|"прокси /api/"| api
  end

  subgraph hosted["Render: один сервис (infra/hosted.Dockerfile)"]
    direction TB
    hapi["API на Fastify<br/>сам отдаёт сборку веба (WEB_ROOT)"]
  end

  store[("Хранилище: кэш в памяти процесса<br/>чтение всегда из памяти<br/>запись: DATABASE_URL, иначе PERSIST_FILE, иначе только память")]
  seed[/"Синтетический набор<br/>api/data/seed.json, 20 обращений A-001..A-020"/]
  pg[("PostgreSQL, Neon<br/>таблица complaints, одна JSONB-строка на обращение")]
  file[("JSON-файл<br/>PERSIST_FILE, один писатель")]

  user -->|"порт 8080 или Render"| nginx
  user -->|"Render"| hapi
  api --> store
  hapi --> store
  seed -->|"загрузка при старте"| store
  store -->|"DATABASE_URL"| pg
  store -->|"PERSIST_FILE"| file

  subgraph ai["ИИ-провайдеры: только по ключам из окружения"]
    direction LR
    gem["Gemini"] --> xai["xAI или Groq"] --> anth["Anthropic<br/>если задан ANTHROPIC_API_KEY"] --> rules["правила слов"]
  end
  api -.->|"подсказка, дайджест, перевод"| ai
  hapi -.->|"подсказка, дайджест, перевод"| ai

  subgraph ext["Внешние системы: в прототипе не подключены"]
    direction TB
    bitrix["Битрикс24: оргструктура, уведомления, задачи, вход<br/>план, в интерфейсе имитация"]
    onec["1С УТ: справочники<br/>план, только описание"]
  end
  api -.->|"план"| bitrix
  api -.->|"план"| onec
```

**Что сказать на слайде:** Прототип работает в трёх режимах хранения: без базы данных (память процесса, по желанию с JSON-файлом), а на хостинге, в Render, с PostgreSQL в Neon; подсказка категории, дайджест и перевод идут по ИИ-цепочке Gemini, затем xAI или Groq, затем Anthropic, а без ключей работают по записанным примерам и правилам слов. Интеграции с 1С и Битрикс24 мы честно показываем как план: подключений в прототипе нет, обмен только описан.

## Что есть что

| Блок на схеме | Где в репозитории | Состояние |
|---|---|---|
| Интерфейс (React, Vite) за nginx или на Render | `web/`, `infra/web.Dockerfile`, `infra/nginx.conf`, `infra/hosted.Dockerfile` | реализовано |
| API (Fastify) | `api/src/app.ts`, `server.ts`, `complaints.ts`, `lifecycle.ts`, `analytics.ts` | реализовано |
| Хранилище в памяти | `api/src/store.ts`: чтение из памяти, без ключей и файла данные сбрасываются к seed при перезапуске | реализовано |
| Файл (`PERSIST_FILE`) | `api/src/persistence.ts`: JSON-снимок с атомарной записью | реализовано |
| PostgreSQL (`DATABASE_URL`) | `api/src/pg-persistence.ts`, Neon на Render; приоритет над файлом | реализовано, миграций схемы нет |
| Синтетические данные | `api/data/seed.json`, `api/src/seed.ts`; `SEED_RELATIVE_DATES=1` сдвигает даты | реализовано |
| ИИ-провайдеры | `api/src/ai/provider.ts`, `ai/openai-compatible.ts` (Gemini, xAI, Groq), `ai/anthropic.ts`, `ai/translate.ts`, `ai/rules.ts` | реализовано, по ключам |
| Вход | выбор демо-пользователя, заголовок `X-Demo-User` | имитация |
| Битрикс24, 1С УТ | [описание интеграций](../../docs/research/integrations.md) | план |
