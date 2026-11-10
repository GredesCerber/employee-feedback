import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { fullFormats } from 'ajv-formats/dist/formats.js';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Complaint, Role, User } from './model.js';
import { terminalStatuses } from './model.js';

export const contract = JSON.parse(readFileSync(new URL('../../contracts/api.yaml', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ strict: false, allErrors: true, formats: fullFormats });
ajv.addSchema(contract, 'contract');
const validators = new Map<string, ReturnType<typeof ajv.compile>>();

export class ApiError extends Error {
  constructor(public statusCode: number, public code: string, message: string) { super(message); }
}
export function invalid(message = 'Некорректные поля запроса.'): never {
  throw new ApiError(422, 'VALIDATION_ERROR', message);
}
export function validateBody<T>(name: string, value: unknown): T {
  let validate = validators.get(name);
  if (!validate) {
    validate = ajv.compile({ $ref: `contract#/components/schemas/${name}` });
    validators.set(name, validate);
  }
  if (!validate(value)) invalid();
  return value as T;
}
export function identity(app: FastifyInstance, request: FastifyRequest, roles?: Role[]): User {
  const id = request.headers['x-demo-user'];
  const user = typeof id === 'string' ? app.store.users.find(user => user.id === id) : undefined;
  if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'Выберите известного демо-пользователя.');
  if (roles && !roles.includes(user.role)) throw new ApiError(403, 'FORBIDDEN', 'Роль не разрешает это действие.');
  return user;
}
export function visibleComplaint(app: FastifyInstance, id: string, user: User): Complaint {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) invalid('Некорректный идентификатор обращения.');
  const item = app.store.get(id);
  if (!item || (user.role === 'employee' && item.author.id !== user.id)) {
    throw new ApiError(404, 'NOT_FOUND', 'Обращение не найдено.');
  }
  return item;
}
export function present(item: Complaint, now = Date.now()): Complaint {
  return { ...item, overdue: !terminalStatuses.includes(item.status) && Date.parse(item.dueAt) < now };
}
export function queryParameters(request: FastifyRequest, allowed: string[]): URLSearchParams {
  const params = new URL(request.url, 'http://localhost').searchParams;
  for (const key of params.keys()) {
    if (!allowed.includes(key) || params.getAll(key).length !== 1) invalid('Неизвестный или повторяющийся параметр.');
  }
  return params;
}
export function configureErrors(app: FastifyInstance) {
  app.addHook('onRequest', async (request) => {
    const contentType = request.headers['content-type'];
    if (['POST', 'PATCH'].includes(request.method) && contentType
      && contentType.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
      throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Требуется application/json.');
    }
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) return reply.code(error.statusCode).send({ code: error.code, message: error.message });
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 400) return reply.code(400).send({ code: 'BAD_REQUEST', message: 'Некорректный JSON или запрос.' });
    if (status === 413) return reply.code(413).send({ code: 'PAYLOAD_TOO_LARGE', message: 'Запрос слишком большой.' });
    if (status === 415) return reply.code(415).send({ code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Требуется application/json.' });
    request.log.error(error);
    return reply.code(500).send({ code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера.' });
  });
}
