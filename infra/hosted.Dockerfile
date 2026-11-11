# Один сервис для хостинга (Render и т.п.): Fastify отдаёт и API, и собранный фронтенд.
# Фронтенд собирается с базовым адресом /api (тот же домен), данные — в Postgres по DATABASE_URL.
FROM node:22-alpine AS web
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM node:22-alpine AS api
WORKDIR /app/api
COPY api/package.json api/package-lock.json ./
RUN npm ci
COPY api/tsconfig.json ./
COPY api/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 SEED_RELATIVE_DATES=1
WORKDIR /app
COPY contracts/api.yaml contracts/api.yaml
COPY api/data api/data
COPY --from=web /app/web/dist web/dist
COPY --from=api /app/api/package.json api/package.json
COPY --from=api /app/api/node_modules api/node_modules
COPY --from=api /app/api/dist api/dist
WORKDIR /app/api
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
