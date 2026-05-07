import { eq, desc, inArray, and } from 'drizzle-orm';
import { db } from '../db/index';
import { projects, projectUsers, issues } from '../db/schema';
import type { Project, ProjectUser, ProjectWithStats, PermissionsMap, StatusDefinition } from 'sigmatodo2-common';

function mapProject(row: typeof projects.$inferSelect): Project {
  return {
    code: row.code,
    createdOn: row.createdOn.toISOString(),
    name: row.name,
    backgroundImgPath: row.backgroundImgPath,
    description: row.description,
    statusDefinitions: row.statusDefinitions.map(s => ({ ...s, isActive: s.isActive ?? false })),
  };
}

function mapUserBasic(row: { handle: string; createdOn: Date; displayName: string; avatarPath: string | null; bio: string | null }) {
  return {
    handle: row.handle,
    createdOn: row.createdOn.toISOString(),
    displayName: row.displayName,
    avatarPath: row.avatarPath,
    bio: row.bio,
  };
}

export async function getProjectByCode(code: string): Promise<Project | null> {
  const row = await db.query.projects.findFirst({ where: eq(projects.code, code) });
  return row ? mapProject(row) : null;
}

export async function getUserProjects(handle: string, myHandle: string): Promise<ProjectWithStats[]> {
  const puRows = await db.select({
    project: projects,
    permissions: projectUsers.permissions,
  })
    .from(projectUsers)
    .innerJoin(projects, eq(projectUsers.projectCode, projects.code))
    .where(eq(projectUsers.userHandle, handle))
    .orderBy(desc(projects.createdOn));

  if (puRows.length === 0) return [];

  const projectCodes = puRows.map(r => r.project.code);

  const allIssues = await db.select({
    projectCode: issues.projectCode,
    status: issues.status,
    assignedTo: issues.assignedTo,
  })
    .from(issues)
    .where(inArray(issues.projectCode, projectCodes));

  return puRows.map(({ project, permissions }) => {
    const statusDefs = project.statusDefinitions;
    const activeStatuses = new Set(statusDefs.filter(s => s.isActive).map(s => s.code));
    const projectIssues = allIssues.filter(i => i.projectCode === project.code);
    const activeIssues = projectIssues.filter(i => activeStatuses.has(i.status));

    return {
      ...mapProject(project),
      activeIssueCount: activeIssues.length,
      myActiveIssueCount: activeIssues.filter(i => i.assignedTo === myHandle).length,
      myPermissions: permissions,
    };
  });
}

export async function updateProject(code: string, params: {
  name?: string;
  description?: string | null;
  backgroundImgPath?: string | null;
  statusDefinitions?: StatusDefinition[];
}): Promise<Project> {
  const update: Record<string, unknown> = {};
  if (params.name !== undefined) update.name = params.name;
  if (params.description !== undefined) update.description = params.description;
  if (params.backgroundImgPath !== undefined) update.backgroundImgPath = params.backgroundImgPath;
  if (params.statusDefinitions !== undefined) update.statusDefinitions = params.statusDefinitions;
  const [row] = await db.update(projects).set(update).where(eq(projects.code, code)).returning();
  return mapProject(row);
}

export async function deleteProject(code: string): Promise<void> {
  await db.delete(projects).where(eq(projects.code, code));
}

export async function projectCodeExists(code: string): Promise<boolean> {
  const rows = await db.select({ code: projects.code })
    .from(projects).where(eq(projects.code, code)).limit(1);
  return rows.length > 0;
}

export async function getProjectStatusDefs(code: string): Promise<StatusDefinition[]> {
  const rows = await db.select({ statusDefinitions: projects.statusDefinitions })
    .from(projects).where(eq(projects.code, code)).limit(1);
  return rows[0]?.statusDefinitions ?? [];
}

export async function getUserProjectCodes(handle: string): Promise<string[]> {
  const rows = await db.select({ projectCode: projectUsers.projectCode })
    .from(projectUsers)
    .where(eq(projectUsers.userHandle, handle));
  return rows.map(row => row.projectCode);
}

// ── Project users ────────────────────────────────────────────────────────────

export async function getProjectUser(userHandle: string, projectCode: string): Promise<ProjectUser | null> {
  const row = await db.query.projectUsers.findFirst({
    where: and(eq(projectUsers.userHandle, userHandle), eq(projectUsers.projectCode, projectCode)),
  });
  if (!row) return null;
  return { userHandle: row.userHandle, projectCode: row.projectCode, permissions: row.permissions };
}

export async function getProjectMembers(projectCode: string): Promise<ProjectUser[]> {
  const rows = await db.query.projectUsers.findMany({
    where: eq(projectUsers.projectCode, projectCode),
    with: { user: true },
  });
  return rows.map(row => ({
    userHandle: row.userHandle,
    projectCode: row.projectCode,
    permissions: row.permissions,
    user: row.user ? mapUserBasic(row.user) : undefined,
  }));
}

export async function addProjectUser(params: { userHandle: string; projectCode: string; permissions: PermissionsMap }): Promise<void> {
  await db.insert(projectUsers).values({
    userHandle: params.userHandle,
    projectCode: params.projectCode,
    permissions: params.permissions,
  }).onConflictDoUpdate({
    target: [projectUsers.userHandle, projectUsers.projectCode],
    set: { permissions: params.permissions },
  });
}

export async function updateProjectUser(userHandle: string, projectCode: string, permissions: PermissionsMap): Promise<void> {
  await db.update(projectUsers)
    .set({ permissions })
    .where(and(eq(projectUsers.userHandle, userHandle), eq(projectUsers.projectCode, projectCode)));
}

export async function removeProjectUser(userHandle: string, projectCode: string): Promise<void> {
  await db.delete(projectUsers)
    .where(and(eq(projectUsers.userHandle, userHandle), eq(projectUsers.projectCode, projectCode)));
}
