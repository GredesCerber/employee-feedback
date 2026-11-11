import { readFileSync } from 'node:fs';
import type { Category, Complaint, ComplaintType, Priority, ReferenceData, Status, User } from './model.js';
import { terminalStatuses } from './model.js';

interface SeedRow {
  number: string; type: ComplaintType; categoryId: string; category: string;
  author: string; departmentId: string; priority: Priority; status: Status;
  description: string; assignee: string; nextAction: string;
}

const rows = JSON.parse(readFileSync(new URL('../data/seed.json', import.meta.url), 'utf8')) as SeedRow[];
const authorNames = [...new Set(rows.map((row) => row.author))];
const assigneeNames = [...new Set(rows.map((row) => row.assignee))];

export const seedUsers: User[] = [
  ...authorNames.map((name, index): User => ({
    id: name === 'Сотрудник закупок' ? 'employee-1' : name === 'Сотрудник бухгалтерии' ? 'employee-2' : `employee-${index + 3}`,
    name, role: 'employee', departmentId: rows.find((row) => row.author === name)!.departmentId,
  })),
  ...assigneeNames.map((name, index): User => ({
    id: `manager-${index + 1}`, name, role: 'manager',
    departmentId: rows.find((row) => row.assignee === name)!.departmentId,
  })),
  { id: 'admin-1', name: 'Администратор демо', role: 'admin', departmentId: 'administration' },
];

export const seedReferenceData: ReferenceData = {
  departments: [
    { id: 'procurement', name: 'Закупки' }, { id: 'accounting', name: 'Бухгалтерия' },
    { id: 'engineering', name: 'Проектирование' }, { id: 'sales', name: 'Продажи' },
    { id: 'projects', name: 'Проекты' }, { id: 'administration', name: 'Администрация' },
  ],
  categories: [...new Set(rows.map((row) => row.categoryId))].map((id): Category => {
    const row = rows.find((entry) => entry.categoryId === id)!;
    return { id, name: row.category, dueInDays: 7,
      assigneeId: seedUsers.find((user) => user.name === row.assignee && user.role === 'manager')!.id };
  }).concat([{ id: 'no_rule_demo', name: 'Категория без ответственного (демо)', dueInDays: 7, assigneeId: null }]),
  assignees: seedUsers.filter((user) => user.role === 'manager'),
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const DUE_DAYS = 7;
/** Hours until the first response in relative mode: varied on purpose, at most 12 so it never lands in the future. */
const relativeResponseHours = [1, 3, 6, 2, 12];

/**
 * Creation time of seed row `index`.
 * Default: fixed 2026-11-01 09:xx UTC, so existing tests and stored data stay stable.
 * SEED_RELATIVE_DATES=1 (demo launch and hosting): days are counted back from the start of the current UTC day.
 * Rows 1-5 are 8-9 days old, so their 7-day term has already passed; rows 6-20 are 1-6 days old and due in the future.
 * Nothing is created today, therefore no timestamp can be later than the moment of the call.
 */
function seedCreatedAt(index: number, relative: boolean, now: Date): number {
  if (!relative) return Date.UTC(2026, 10, 1, 9, index);
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const daysAgo = index < 2 ? 9 : index < 5 ? 8 : 6 - Math.floor(((index - 5) * 6) / 15);
  return dayStart - daysAgo * DAY + 9 * HOUR + index * 60_000;
}

/**
 * Synthetic demonstration timestamps, never real response metrics.
 * Called on every seeding (start, --seed-reset, demo reset), so relative dates follow the current day.
 */
export function seedComplaints(): Complaint[] {
  const relative = process.env.SEED_RELATIVE_DATES === '1';
  const now = new Date();
  return rows.map((row, index) => {
    const author = seedUsers.find((user) => user.name === row.author && user.role === 'employee')!;
    const assignee = seedUsers.find((user) => user.name === row.assignee && user.role === 'manager')!;
    const createdMs = seedCreatedAt(index, relative, now);
    const createdAt = new Date(createdMs).toISOString();
    const responseHours = relative ? relativeResponseHours[index % relativeResponseHours.length]! : 1;
    const firstResponseAt = row.status === 'new' ? null : new Date(createdMs + responseHours * HOUR).toISOString();
    const closedAt = terminalStatuses.includes(row.status) ? new Date(createdMs + DAY).toISOString() : null;
    const updatedAt = closedAt ?? firstResponseAt ?? createdAt;
    return {
      id: `complaint-${index + 1}`, number: row.number, type: row.type, categoryId: row.categoryId,
      departmentId: row.departmentId, author, description: row.description, proposedSolution: null,
      priority: row.priority, attachments: [], status: row.status, assignee,
      routing: { queue: 'assigned', reason: 'category_rule' }, createdAt, updatedAt,
      dueAt: new Date(createdMs + DUE_DAYS * DAY).toISOString(), firstResponseAt, closedAt,
      overdue: false,
      comments: ['A-005', 'A-013'].includes(row.number) ? [{
        id: `seed-clarification-${index + 1}`, author: assignee, kind: 'clarification_request',
        text: row.nextAction, createdAt: firstResponseAt!,
      }] : [],
      history: [{ id: `seed-event-${index + 1}`, kind: 'created', actor: author, createdAt,
        fromStatus: null, toStatus: row.status, text: 'Загружено из синтетического демонстрационного набора.' }],
      decision: closedAt ? { outcome: row.status as 'implemented' | 'rejected' | 'closed',
        explanation: row.nextAction, actions: null, author: assignee, createdAt: closedAt } : null,
      nextAction: row.nextAction,
    };
  });
}
