# API (Fastify). Контекст сборки — корень репозитория, в образ попадает только то,
# что разрешено в infra/api.Dockerfile.dockerignore.
FROM node:22-alpine AS build
WORKDIR /app/api
COPY api/package.json api/package-lock.json ./
RUN npm ci
COPY api/tsconfig.json ./
COPY api/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
# API читает контракт (../../contracts/api.yaml от dist) и seed (../data/seed.json).
COPY contracts/api.yaml contracts/api.yaml
COPY api/data api/data
COPY --from=build /app/api/package.json api/package.json
COPY --from=build /app/api/node_modules api/node_modules
COPY --from=build /app/api/dist api/dist
WORKDIR /app/api
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
