import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../db/index';
import { invitations, projectUsers } from '../db/schema';
import type { Invitation, InvitationDetails, PermissionsMap } from 'sigmatodo2-common';

type InvitationRow = typeof invitations.$inferSelect;

function mapInvitation(row: InvitationRow): Invitation {
  return {
    id: row.id,
    projectCode: row.projectCode,
    invitationCode: row.invitationCode,
    invitedBy: row.invitedBy,
    invitationFor: row.invitationFor,
    createdOn: row.createdOn.toISOString(),
    acceptedOn: row.acceptedOn?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    permissions: row.permissions,
    singleUse: row.singleUse,
  };
}

export async function getInvitationByCode(invitationCode: string): Promise<Invitation | null> {
  const row = await db.query.invitations.findFirst({
    where: eq(invitations.invitationCode, invitationCode),
  });
  return row ? mapInvitation(row) : null;
}

export async function getInvitationDetails(invitationCode: string): Promise<InvitationDetails | null> {
  const row = await db.query.invitations.findFirst({
    where: eq(invitations.invitationCode, invitationCode),
    with: { project: true, inviter: true },
  });
  if (!row) return null;
  return {
    ...mapInvitation(row),
    project: {
      code: row.project.code,
      createdOn: row.project.createdOn.toISOString(),
      name: row.project.name,
      backgroundImgPath: row.project.backgroundImgPath,
      description: row.project.description,
      statusDefinitions: row.project.statusDefinitions.map(s => ({ ...s, isActive: s.isActive ?? false })),
    },
    inviter: {
      handle: row.inviter.handle,
      createdOn: row.inviter.createdOn.toISOString(),
      displayName: row.inviter.displayName,
      avatarPath: row.inviter.avatarPath,
      bio: row.inviter.bio,
    },
  };
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
  invitedBy: string;
  invitationFor: string | null;
  expiresAt: string | null;
  permissions: PermissionsMap;
  singleUse: boolean;
}): Promise<Invitation> {
  const expiresAtDate = params.expiresAt ? new Date(params.expiresAt) : null;

  // Dedup: return matching existing unaccepted invitation
  const existing = await db.query.invitations.findFirst({
    where: and(
      eq(invitations.projectCode, params.projectCode),
      eq(invitations.invitedBy, params.invitedBy),
      params.invitationFor
        ? eq(invitations.invitationFor, params.invitationFor)
        : isNull(invitations.invitationFor),
      isNull(invitations.acceptedOn),
      expiresAtDate
        ? eq(invitations.expiresAt, expiresAtDate)
        : isNull(invitations.expiresAt),
      eq(invitations.singleUse, params.singleUse),
    ),
  });
  if (existing) return mapInvitation(existing);

  const [row] = await db.insert(invitations).values({
    projectCode: params.projectCode,
    invitedBy: params.invitedBy,
    invitationFor: params.invitationFor,
    expiresAt: expiresAtDate,
    permissions: params.permissions,
    singleUse: params.singleUse,
  }).returning();
  return mapInvitation(row);
}

export async function acceptInvitation(
  invitationCode: string,
  userHandle: string,
): Promise<{ ok: boolean; error?: string }> {
  const inv = await getInvitationByCode(invitationCode);
  if (!inv) return { ok: false, error: 'Invitation not found' };
  if (inv.singleUse && inv.acceptedOn) return { ok: false, error: 'Invitation already used' };
  if (inv.expiresAt && new Date(inv.expiresAt) < new Date()) return { ok: false, error: 'Invitation expired' };
  if (inv.invitationFor && inv.invitationFor !== userHandle) return { ok: false, error: 'Invitation not for you' };

  await db.transaction(async (tx) => {
    if (inv.singleUse) {
      await tx.update(invitations)
        .set({ acceptedOn: new Date() })
        .where(eq(invitations.invitationCode, invitationCode));
    }
    await tx.insert(projectUsers).values({
      userHandle,
      projectCode: inv.projectCode,
      permissions: inv.permissions,
    }).onConflictDoNothing();
  });
  return { ok: true };
}
