import { and, eq, desc, inArray, sql } from 'drizzle-orm';
import { db } from '../db/index';
import { issues, issueSequences } from '../db/schema';
import type { Issue, IssueWithAssignee, Priority, SortOption } from 'sigmatodo2-common';

type IssueRow = typeof issues.$inferSelect;
type UserBasicRow = { handle: string; createdOn: Date; displayName: string; avatarPath: string | null; bio: string | null };

function mapUser(row: UserBasicRow) {
  return {
    handle: row.handle,
    createdOn: row.createdOn.toISOString(),
    displayName: row.displayName,
    avatarPath: row.avatarPath,
    bio: row.bio,
  };
}

function mapIssue(row: IssueRow): Issue {
  return {
    code: row.code,
    projectCode: row.projectCode,
    assignedTo: row.assignedTo,
    createdBy: row.createdBy,
    priority: row.priority as Priority,
    createdOn: row.createdOn.toISOString(),
    updatedOn: row.updatedOn.toISOString(),
    dueBy: row.dueBy?.toISOString() ?? null,
    title: row.title,
    status: row.status,
    markdownDescription: row.markdownDescription,
    commentCount: row.commentCount,
  };
}

function mapIssueWithAssignee(row: IssueRow & { assignee: UserBasicRow | null; creator: UserBasicRow | null }): IssueWithAssignee {
  return {
    ...mapIssue(row),
    assignee: row.assignee ? mapUser(row.assignee) : null,
    creator: row.creator ? mapUser(row.creator) : null,
  };
}

async function nextIssueNumber(projectCode: string): Promise<number> {
  const [row] = await db
    .update(issueSequences)
    .set({ nextNumber: sql`${issueSequences.nextNumber} + 1` })
    .where(eq(issueSequences.projectCode, projectCode))
    .returning({ nextNumber: issueSequences.nextNumber });
  return (row?.nextNumber ?? 2) - 1;
}

export async function getIssue(code: string): Promise<Issue | null> {
  const row = await db.query.issues.findFirst({ where: eq(issues.code, code) });
  return row ? mapIssue(row) : null;
}

export async function getIssueWithAssignee(code: string): Promise<IssueWithAssignee | null> {
  const row = await db.query.issues.findFirst({
    where: eq(issues.code, code),
    with: { assignee: true, creator: true },
  });
  if (!row) return null;
  return mapIssueWithAssignee(row);
}

export async function getProjectIssues(projectCode: string, sort: SortOption): Promise<IssueWithAssignee[]> {
  const orderBy = sort === 'created' ? [desc(issues.createdOn)]
    : sort === 'comments' ? [desc(issues.commentCount)]
    : [desc(issues.createdOn)];

  const rows = await db.query.issues.findMany({
    where: eq(issues.projectCode, projectCode),
    orderBy: sort === 'relevant' || sort === 'due' ? undefined : orderBy,
    with: { assignee: true, creator: true },
  });

  const mapped = rows.map(mapIssueWithAssignee);

  if (sort === 'due') {
    return mapped.sort((a, b) => {
      if (!a.dueBy && !b.dueBy) return 0;
      if (!a.dueBy) return 1;
      if (!b.dueBy) return -1;
      return new Date(a.dueBy).getTime() - new Date(b.dueBy).getTime();
    });
  }

  return mapped;
}

export async function getAssignedIssuesInProjects(
  assignedTo: string,
  projectCodes: string[],
  sort: SortOption,
): Promise<IssueWithAssignee[]> {
  if (projectCodes.length === 0) return [];

  const orderBy = sort === 'created' ? [desc(issues.createdOn)]
    : sort === 'comments' ? [desc(issues.commentCount)]
    : [desc(issues.createdOn)];

  const rows = await db.query.issues.findMany({
    where: and(eq(issues.assignedTo, assignedTo), inArray(issues.projectCode, projectCodes)),
    orderBy: sort === 'relevant' || sort === 'due' ? undefined : orderBy,
    with: { assignee: true, creator: true },
  });

  const mapped = rows.map(mapIssueWithAssignee);

  if (sort === 'due') {
    return mapped.sort((a, b) => {
      if (!a.dueBy && !b.dueBy) return 0;
      if (!a.dueBy) return 1;
      if (!b.dueBy) return -1;
      return new Date(a.dueBy).getTime() - new Date(b.dueBy).getTime();
    });
  }

  return mapped;
}

export async function createIssue(params: {
  projectCode: string;
  title: string;
  status: string;
  priority?: Priority;
  assignedTo?: string | null;
  createdBy?: string | null;
  dueBy?: string | null;
  markdownDescription?: string | null;
}): Promise<Issue> {
  const n = await nextIssueNumber(params.projectCode);
  const code = `${params.projectCode}-${n}`;
  const [row] = await db.insert(issues).values({
    code,
    projectCode: params.projectCode,
    title: params.title,
    status: params.status,
    priority: params.priority ?? 'normal',
    assignedTo: params.assignedTo ?? null,
    createdBy: params.createdBy ?? null,
    dueBy: params.dueBy ? new Date(params.dueBy) : null,
    markdownDescription: params.markdownDescription ?? null,
  }).returning();
  return mapIssue(row);
}

export async function updateIssue(code: string, params: {
  title?: string;
  status?: string;
  priority?: Priority;
  assignedTo?: string | null;
  dueBy?: string | null;
  markdownDescription?: string | null;
}): Promise<Issue> {
  const update: Record<string, unknown> = { updatedOn: new Date() };
  if (params.title !== undefined) update.title = params.title;
  if (params.status !== undefined) update.status = params.status;
  if (params.priority !== undefined) update.priority = params.priority;
  if (params.assignedTo !== undefined) update.assignedTo = params.assignedTo;
  if (params.dueBy !== undefined) update.dueBy = params.dueBy ? new Date(params.dueBy) : null;
  if (params.markdownDescription !== undefined) update.markdownDescription = params.markdownDescription;
  const [row] = await db.update(issues).set(update).where(eq(issues.code, code)).returning();
  return mapIssue(row);
}

export async function deleteIssue(code: string): Promise<void> {
  await db.delete(issues).where(eq(issues.code, code));
}
