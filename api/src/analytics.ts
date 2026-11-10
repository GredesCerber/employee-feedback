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
