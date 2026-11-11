import type { Category, Complaint, ReferenceData } from './model.js';
import { terminalStatuses } from './model.js';

/** One in-memory snapshot, using only synthetic timestamps and category counts. */
export function summarize(complaints: readonly Complaint[], categories: readonly Category[], now = new Date(),
  departments: Readonly<ReferenceData['departments']> = []) {
  const byType = (['problem', 'suggestion', 'praise'] as const)
    .map(type => ({ type, count: complaints.filter(item => item.type === type).length }));
  const closedCount = complaints.filter(item => terminalStatuses.includes(item.status)).length;
  const responded = complaints.filter(item => item.firstResponseAt !== null);
  const categoryCounts = new Map<string, number>();
  for (const item of complaints) categoryCounts.set(item.categoryId, (categoryCounts.get(item.categoryId) ?? 0) + 1);
  const recurringTopics = [...categoryCounts.entries()].filter(([, count]) => count >= 2)
    .map(([categoryId, count]) => ({ categoryId, categoryName: categories.find(category => category.id === categoryId)?.name ?? categoryId, count }))
    .sort((a, b) => b.count - a.count || (a.categoryId < b.categoryId ? -1 : a.categoryId > b.categoryId ? 1 : 0));
  const byDepartment = [...departments].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    .map(department => {
      const records = complaints.filter(item => item.departmentId === department.id);
      const closed = records.filter(item => terminalStatuses.includes(item.status)).length;
      return { departmentId: department.id, departmentName: department.name, count: records.length,
        closedCount: closed, closedShare: records.length ? closed / records.length : 0 };
    });
  const avgResolutionHoursByCategory = [...categories].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    .map(category => {
      // closedCount is the denominator: unfinished records and missing timestamps do not contribute.
      const completed = complaints.filter(item => item.categoryId === category.id
        && terminalStatuses.includes(item.status) && item.closedAt !== null);
      return { categoryId: category.id, categoryName: category.name, closedCount: completed.length,
        averageResolutionHours: completed.length
          ? completed.reduce((sum, item) => sum + (Date.parse(item.closedAt!) - Date.parse(item.createdAt)) / 3600000, 0) / completed.length
          : null };
    });
  const overdueCount = complaints.filter(item => !terminalStatuses.includes(item.status)
    && Date.parse(item.dueAt) < now.getTime()).length;
  return {
    total: complaints.length, byType, closedCount, closedShare: complaints.length ? closedCount / complaints.length : 0,
    averageFirstResponseHours: responded.length
      ? responded.reduce((sum, item) => sum + (Date.parse(item.firstResponseAt!) - Date.parse(item.createdAt)) / 3600000, 0) / responded.length : null,
    respondedCount: responded.length, recurringTopics, generatedAt: now.toISOString(),
    byDepartment, avgResolutionHoursByCategory, overdueCount,
  };
}

const stopWords = new Set(('и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по только ее мне было вот от меня еще нет о из ему теперь когда даже ну вдруг ли если уже или ни быть был него до вас нибудь опять уж вам ведь там потом себя ничего ей может они тут где есть надо ней для мы тебя их чем была сам чтоб без будто чего раз тоже себе под будет ж тогда кто этот того потому этого какой совсем ним здесь этом один почти мой тем чтобы нее сейчас были куда зачем всех никогда можно при наконец два об другой хоть после над больше тот через эти нас про всего них какая много разве три эту моя впрочем хорошо свою этой перед иногда лучше чуть том нельзя такой им более всегда конечно всю между это также который которые которая которых нужно очень либо иначе').split(' '));

function words(text: string): string[] {
  return text.toLowerCase().replaceAll('ё', 'е').match(/[\p{L}\p{N}]+/gu) ?? [];
}
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const dateOnly = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const DAY = 86400000;

/** Dashboard aggregates for one snapshot; never includes authors, texts or comments. */
export function trends(complaints: readonly Complaint[], categories: readonly Category[], now = new Date(),
  departments: Readonly<ReferenceData['departments']> = []) {
  const nowMs = now.getTime();
  const todayStart = Math.floor(nowMs / DAY) * DAY;
  const created = complaints.map(item => Date.parse(item.createdAt));
  const byDay = Array.from({ length: 14 }, (_, index) => {
    const start = todayStart - (13 - index) * DAY;
    return { date: dateOnly(start), count: created.filter(time => time >= start && time < start + DAY && time <= nowMs).length };
  });
  const weekStartNow = todayStart - ((new Date(todayStart).getUTCDay() + 6) % 7) * DAY;
  const byWeek = Array.from({ length: 8 }, (_, index) => {
    const start = weekStartNow - (7 - index) * 7 * DAY;
    return { weekStart: dateOnly(start), count: created.filter(time => time >= start && time < start + 7 * DAY && time <= nowMs).length };
  });
  const categoryCounts = new Map<string, number>();
  for (const item of complaints) categoryCounts.set(item.categoryId, (categoryCounts.get(item.categoryId) ?? 0) + 1);
  const byCategory = [...categoryCounts.entries()]
    .map(([categoryId, count]) => ({ categoryId, categoryName: categories.find(category => category.id === categoryId)?.name ?? categoryId, count }))
    .sort((a, b) => b.count - a.count || compare(a.categoryId, b.categoryId));
  const byDepartment = [...departments].sort((a, b) => compare(a.id, b.id)).flatMap(department => {
    const records = complaints.filter(item => item.departmentId === department.id);
    if (!records.length) return [];
    const closed = records.filter(item => terminalStatuses.includes(item.status)).length;
    return [{ departmentId: department.id, departmentName: department.name, count: records.length,
      closedCount: closed, closedShare: closed / records.length }];
  });
  const themeCounts = new Map<string, number>();
  for (const item of complaints) {
    for (const word of new Set(words(`${item.description}\n${item.proposedSolution ?? ''}`))) {
      if (!stopWords.has(word)) themeCounts.set(word, (themeCounts.get(word) ?? 0) + 1);
    }
  }
  const topThemes = [...themeCounts.entries()].filter(([, count]) => count >= 2)
    .map(([theme, count]) => ({ theme, count }))
    .sort((a, b) => b.count - a.count || compare(a.theme, b.theme)).slice(0, 5);
  const overdue = complaints.filter(item => !terminalStatuses.includes(item.status) && Date.parse(item.dueAt) < nowMs)
    .map(item => ({ id: item.id, number: item.number, categoryId: item.categoryId,
      categoryName: categories.find(category => category.id === item.categoryId)?.name ?? item.categoryId,
      dueAt: item.dueAt, overdueHours: (nowMs - Date.parse(item.dueAt)) / 3600000 }))
    .sort((a, b) => b.overdueHours - a.overdueHours || compare(a.id, b.id));
  const completed = complaints.filter(item => terminalStatuses.includes(item.status) && item.closedAt !== null);
  const closedCount = complaints.filter(item => terminalStatuses.includes(item.status)).length;
  return {
    generatedAt: now.toISOString(), byDay, byWeek, byCategory, byDepartment, topThemes, overdue,
    totals: { total: complaints.length, openCount: complaints.length - closedCount, closedCount, overdueCount: overdue.length,
      averageResolutionHours: completed.length
        ? completed.reduce((sum, item) => sum + (Date.parse(item.closedAt!) - Date.parse(item.createdAt)) / 3600000, 0) / completed.length
        : null },
  };
}
