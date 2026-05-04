import { eq, asc, sql } from 'drizzle-orm';
import { db } from '../db/index';
import { comments, issues } from '../db/schema';
import type { Comment } from 'sigmatodo2-common';

type CommentRow = typeof comments.$inferSelect;
type UserBasicRow = { handle: string; createdOn: Date; displayName: string; avatarPath: string | null; bio: string | null };
type CommentWithAuthor = CommentRow & { author: UserBasicRow | null };

function mapComment(row: CommentWithAuthor): Comment {
  return {
    id: row.id,
    issueCode: row.issueCode,
    postedBy: row.postedBy,
    postedOn: row.postedOn.toISOString(),
    editedOn: row.editedOn?.toISOString() ?? null,
    content: row.content,
    author: row.author ? {
      handle: row.author.handle,
      createdOn: row.author.createdOn.toISOString(),
      displayName: row.author.displayName,
      avatarPath: row.author.avatarPath,
      bio: row.author.bio,
    } : undefined,
  };
}

export async function getComment(id: string): Promise<Comment | null> {
  const row = await db.query.comments.findFirst({
    where: eq(comments.id, id),
    with: { author: true },
  });
  return row ? mapComment(row) : null;
}

export async function getIssueComments(issueCode: string): Promise<Comment[]> {
  const rows = await db.query.comments.findMany({
    where: eq(comments.issueCode, issueCode),
    orderBy: [asc(comments.postedOn)],
    with: { author: true },
  });
  return rows.map(mapComment);
}

export async function createComment(params: { issueCode: string; postedBy: string; content: string }): Promise<Comment> {
  let commentId: string;
  await db.transaction(async (tx) => {
    const [row] = await tx.insert(comments).values({
      issueCode: params.issueCode,
      postedBy: params.postedBy,
      content: params.content,
    }).returning({ id: comments.id });
    commentId = row.id;
    await tx.update(issues)
      .set({ commentCount: sql`${issues.commentCount} + 1` })
      .where(eq(issues.code, params.issueCode));
  });
  return getComment(commentId!)as Promise<Comment>;
}

export async function updateComment(id: string, content: string): Promise<Comment> {
  await db.update(comments)
    .set({ content, editedOn: new Date() })
    .where(eq(comments.id, id));
  return getComment(id) as Promise<Comment>;
}

export async function deleteComment(id: string): Promise<void> {
  const row = await db.query.comments.findFirst({
    where: eq(comments.id, id),
    columns: { issueCode: true },
  });
  if (!row) return;
  await db.transaction(async (tx) => {
    await tx.delete(comments).where(eq(comments.id, id));
    await tx.update(issues)
      .set({ commentCount: sql`GREATEST(0, ${issues.commentCount} - 1)` })
      .where(eq(issues.code, row.issueCode));
  });
}
