import { eq, desc } from 'drizzle-orm';
import { db } from '../db/index';
import { attachments } from '../db/schema';
import type { Attachment } from 'sigmatodo2-common';

type AttachmentRow = typeof attachments.$inferSelect;

function mapAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    issueCode: row.issueCode,
    filename: row.filename,
    uploadedOn: row.uploadedOn.toISOString(),
  };
}

export async function getAttachment(id: string): Promise<(Attachment & { path: string }) | null> {
  const row = await db.query.attachments.findFirst({ where: eq(attachments.id, id) });
  if (!row) return null;
  return { ...mapAttachment(row), path: row.path };
}

export async function getIssueAttachments(issueCode: string): Promise<Attachment[]> {
  const rows = await db.query.attachments.findMany({
    where: eq(attachments.issueCode, issueCode),
    orderBy: [desc(attachments.uploadedOn)],
  });
  return rows.map(mapAttachment);
}

export async function createAttachment(params: { issueCode: string; filename: string; path: string }): Promise<Attachment> {
  const [row] = await db.insert(attachments).values({
    issueCode: params.issueCode,
    filename: params.filename,
    path: params.path,
  }).returning();
  return mapAttachment(row);
}

export async function deleteAttachment(id: string): Promise<string | null> {
  const rows = await db.select({ path: attachments.path })
    .from(attachments).where(eq(attachments.id, id)).limit(1);
  if (rows.length === 0) return null;
  await db.delete(attachments).where(eq(attachments.id, id));
  return rows[0].path;
}
