import * as issueRepo from '../repositories/issueRepo';
import * as projectRepo from '../repositories/projectRepo';
import type { IssueWithAssignee, SortOption } from 'sigmatodo2-common';
import { PRIORITY_ORDER } from 'sigmatodo2-common';

export async function getProjectIssues(
  projectCode: string,
  sort: SortOption,
  _myHandle: string,
): Promise<IssueWithAssignee[]> {
  const issues = await issueRepo.getProjectIssues(projectCode, sort);
  if (sort !== 'relevant') return issues;

  const statusDefs = await projectRepo.getProjectStatusDefs(projectCode);
  const importanceMap = Object.fromEntries(statusDefs.map(s => [s.code, s.importanceLevel]));
  const now = Date.now();

  function timeGroup(dueBy: string | null): number {
    if (!dueBy) return 9999;
    const hoursLeft = (new Date(dueBy).getTime() - now) / (1000 * 60 * 60);
    if (hoursLeft <= 0) return -1;
    return Math.floor(Math.log2(hoursLeft + 1));
  }

  return [...issues].sort((a, b) => {
    const impA = importanceMap[a.status] ?? 0;
    const impB = importanceMap[b.status] ?? 0;
    if (impB !== impA) return impB - impA;
    const tgA = timeGroup(a.dueBy);
    const tgB = timeGroup(b.dueBy);
    if (tgA !== tgB) return tgA - tgB;
    return (PRIORITY_ORDER[b.priority] ?? 0) - (PRIORITY_ORDER[a.priority] ?? 0);
  });
}
