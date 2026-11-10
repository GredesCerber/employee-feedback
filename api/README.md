# API

Каркас Fastify + TypeScript, Node.js 22+. Пока реализован только `GET /health`.

Из корня репозитория:

```sh
npm --prefix api ci
npm --prefix api run test
npm --prefix api run build
npm --prefix api start
```

По умолчанию сервер слушает `http://127.0.0.1:3000`. `HOST` и `PORT` можно
задать переменными окружения. Для разработки: `npm --prefix api run dev`.

`GET /health` возвращает HTTP 200 и JSON
`{"status":"ok","version":"0.1.0"}`. Версия читается из `api/package.json`.
`buildApp()` создаёт независимый экземпляр без открытия порта; приёмочные тесты
проверяют и Fastify injection, и настоящий HTTP-запрос на свободный локальный порт.

Бизнес-логика, хранилище, авторизация и интеграции появятся в следующих задачах.
