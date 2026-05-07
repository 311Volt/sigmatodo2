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

  return [...issues].sort((a, b) => {
    return compareRelevant(a, b, issue => importanceMap[issue.status] ?? 0, now);
  });
}

export async function getVisibleAssignedIssues(
  assignedTo: string,
  myHandle: string,
  sort: SortOption,
): Promise<IssueWithAssignee[]> {
  const projectCodes = await projectRepo.getUserProjectCodes(myHandle);
  const issues = await issueRepo.getAssignedIssuesInProjects(assignedTo, projectCodes, sort);
  if (sort !== 'relevant') return issues;

  const defsByProject = await Promise.all(
    [...new Set(issues.map(issue => issue.projectCode))]
      .map(async projectCode => [projectCode, await projectRepo.getProjectStatusDefs(projectCode)] as const),
  );
  const importanceByProjectStatus = new Map<string, number>();
  defsByProject.forEach(([projectCode, defs]) => {
    defs.forEach(def => importanceByProjectStatus.set(`${projectCode}:${def.code}`, def.importanceLevel));
  });

  const now = Date.now();
  return [...issues].sort((a, b) => compareRelevant(
    a,
    b,
    issue => importanceByProjectStatus.get(`${issue.projectCode}:${issue.status}`) ?? 0,
    now,
  ));
}

function compareRelevant(
  a: IssueWithAssignee,
  b: IssueWithAssignee,
  importanceForIssue: (issue: IssueWithAssignee) => number,
  now: number,
): number {
  const impA = importanceForIssue(a);
  const impB = importanceForIssue(b);
  if (impB !== impA) return impB - impA;
  const tgA = timeGroup(a.dueBy, now);
  const tgB = timeGroup(b.dueBy, now);
  if (tgA !== tgB) return tgA - tgB;
  return (PRIORITY_ORDER[b.priority] ?? 0) - (PRIORITY_ORDER[a.priority] ?? 0);
}

function timeGroup(dueBy: string | null, now: number): number {
  if (!dueBy) return 9999;
  const hoursLeft = (new Date(dueBy).getTime() - now) / (1000 * 60 * 60);
  if (hoursLeft <= 0) return -1;
  return Math.floor(Math.log2(hoursLeft + 1));
}
