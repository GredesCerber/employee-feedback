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

/** Fixed UTC timestamps are synthetic demonstration data, never real response metrics. */
export function seedComplaints(): Complaint[] {
  return rows.map((row, index) => {
    const author = seedUsers.find((user) => user.name === row.author && user.role === 'employee')!;
    const assignee = seedUsers.find((user) => user.name === row.assignee && user.role === 'manager')!;
    const createdAt = new Date(Date.UTC(2026, 10, 1, 9, index)).toISOString();
    const firstResponseAt = row.status === 'new' ? null : new Date(Date.parse(createdAt) + 3600000).toISOString();
    const closedAt = terminalStatuses.includes(row.status) ? new Date(Date.parse(createdAt) + 86400000).toISOString() : null;
    const updatedAt = closedAt ?? firstResponseAt ?? createdAt;
    return {
      id: `complaint-${index + 1}`, number: row.number, type: row.type, categoryId: row.categoryId,
      departmentId: row.departmentId, author, description: row.description, proposedSolution: null,
      priority: row.priority, attachments: [], status: row.status, assignee,
      routing: { queue: 'assigned', reason: 'category_rule' }, createdAt, updatedAt,
      dueAt: new Date(Date.parse(createdAt) + 7 * 86400000).toISOString(), firstResponseAt, closedAt,
      overdue: false, comments: [],
      history: [{ id: `seed-event-${index + 1}`, kind: 'created', actor: author, createdAt,
        fromStatus: null, toStatus: row.status, text: 'Загружено из синтетического демонстрационного набора.' }],
      decision: closedAt ? { outcome: row.status as 'implemented' | 'rejected' | 'closed',
        explanation: row.nextAction, actions: null, author: assignee, createdAt: closedAt } : null,
      nextAction: row.nextAction,
    };
  });
}
