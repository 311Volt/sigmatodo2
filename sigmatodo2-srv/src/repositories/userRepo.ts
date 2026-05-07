import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/index';
import { projectUsers, users } from '../db/schema';
import type { User } from 'sigmatodo2-common';

function mapUser(row: typeof users.$inferSelect): User {
  return {
    handle: row.handle,
    createdOn: row.createdOn.toISOString(),
    displayName: row.displayName,
    avatarPath: row.avatarPath,
    bio: row.bio,
    email: row.email ?? undefined,
  };
}

export async function getUserByHandle(handle: string): Promise<User | null> {
  const row = await db.query.users.findFirst({ where: eq(users.handle, handle) });
  return row ? mapUser(row) : null;
}

export async function hasMutualProject(handleA: string, handleB: string): Promise<boolean> {
  if (handleA === handleB) return true;

  const handleBProjects = await db.select({ projectCode: projectUsers.projectCode })
    .from(projectUsers)
    .where(eq(projectUsers.userHandle, handleB));

  if (handleBProjects.length === 0) return false;

  const rows = await db.select({ projectCode: projectUsers.projectCode })
    .from(projectUsers)
    .where(and(
      eq(projectUsers.userHandle, handleA),
      inArray(projectUsers.projectCode, handleBProjects.map(p => p.projectCode)),
    ))
    .limit(1);

  return rows.length > 0;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const row = await db.query.users.findFirst({ where: eq(users.email, email) });
  return row ? mapUser(row) : null;
}

export async function getUserPasswordHash(handle: string): Promise<string | null> {
  const rows = await db.select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.handle, handle))
    .limit(1);
  return rows[0]?.passwordHash ?? null;
}

export async function createUser(params: {
  handle: string;
  displayName: string;
  email?: string;
  passwordHash?: string;
  avatarPath?: string;
}): Promise<User> {
  const [row] = await db.insert(users).values({
    handle: params.handle,
    displayName: params.displayName,
    email: params.email ?? null,
    passwordHash: params.passwordHash ?? null,
    avatarPath: params.avatarPath ?? null,
  }).returning();
  return mapUser(row);
}

export async function updateUser(handle: string, params: {
  displayName?: string;
  avatarPath?: string | null;
  bio?: string | null;
}): Promise<User> {
  const update: { displayName?: string; avatarPath?: string | null; bio?: string | null } = {};
  if (params.displayName !== undefined) update.displayName = params.displayName;
  if (params.avatarPath !== undefined) update.avatarPath = params.avatarPath;
  if (params.bio !== undefined) update.bio = params.bio;
  const [row] = await db.update(users).set(update).where(eq(users.handle, handle)).returning();
  return mapUser(row);
}

export async function handleExists(handle: string): Promise<boolean> {
  const rows = await db.select({ handle: users.handle })
    .from(users).where(eq(users.handle, handle)).limit(1);
  return rows.length > 0;
}
