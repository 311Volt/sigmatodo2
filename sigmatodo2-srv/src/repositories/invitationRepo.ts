import { eq, isNull, desc } from 'drizzle-orm';
import { db } from '../db/index';
import { invitations, projectUsers } from '../db/schema';
import type { Invitation, PermissionsMap } from 'sigmatodo2-common';

type InvitationRow = typeof invitations.$inferSelect;

function mapInvitation(row: InvitationRow): Invitation {
  return {
    id: row.id,
    projectCode: row.projectCode,
    email: row.email,
    invitedBy: row.invitedBy,
    createdOn: row.createdOn.toISOString(),
    acceptedOn: row.acceptedOn?.toISOString() ?? null,
    permissions: row.permissions,
  };
}

export async function getInvitation(id: string): Promise<Invitation | null> {
  const row = await db.query.invitations.findFirst({ where: eq(invitations.id, id) });
  return row ? mapInvitation(row) : null;
}

export async function getPendingInvitationsByEmail(email: string): Promise<Invitation[]> {
  const rows = await db.query.invitations.findMany({
    where: (inv, { and, eq, isNull }) => and(eq(inv.email, email), isNull(inv.acceptedOn)),
  });
  return rows.map(mapInvitation);
}

export async function getProjectInvitations(projectCode: string): Promise<Invitation[]> {
  const rows = await db.query.invitations.findMany({
    where: eq(invitations.projectCode, projectCode),
    orderBy: (inv, { desc }) => [desc(inv.createdOn)],
  });
  return rows.map(mapInvitation);
}

export async function createInvitation(params: {
  projectCode: string;
  email: string;
  invitedBy: string;
  permissions: PermissionsMap;
}): Promise<Invitation> {
  const [row] = await db.insert(invitations).values({
    projectCode: params.projectCode,
    email: params.email,
    invitedBy: params.invitedBy,
    permissions: params.permissions,
  }).returning();
  return mapInvitation(row);
}

export async function acceptInvitation(id: string, userHandle: string): Promise<void> {
  const inv = await getInvitation(id);
  if (!inv || inv.acceptedOn) return;
  await db.transaction(async (tx) => {
    await tx.update(invitations)
      .set({ acceptedOn: new Date() })
      .where(eq(invitations.id, id));
    await tx.insert(projectUsers).values({
      userHandle,
      projectCode: inv.projectCode,
      permissions: inv.permissions,
    }).onConflictDoNothing();
  });
}
