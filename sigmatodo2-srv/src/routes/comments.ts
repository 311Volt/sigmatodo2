import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDB } from '../db/index';

const CommentSchema = z.object({
  content: z.string().min(1).max(10000),
});

async function callDB(db: ReturnType<typeof getDB>, method: string, ...args: unknown[]): Promise<unknown> {
  const fn = (db as Record<string, (...a: unknown[]) => unknown>)[method];
  return fn?.call(db, ...args);
}

export async function commentRoutes(app: FastifyInstance) {
  app.get('/api/issues/:code/comments', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { code } = req.params as { code: string };
    const me = (req.user as { handle: string }).handle;
    const db = getDB();

    const issue = await callDB(db, 'getIssue', code) as { projectCode: string } | null;
    if (!issue) return reply.status(404).send({ error: 'Issue not found' });

    const member = await callDB(db, 'getProjectUser', me, issue.projectCode);
    if (!member) return reply.status(403).send({ error: 'Access denied' });

    const comments = await callDB(db, 'getIssueComments', code);
    return reply.send(comments);
  });

  app.post('/api/issues/:code/comments', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { code } = req.params as { code: string };
    const me = (req.user as { handle: string }).handle;
    const db = getDB();

    const issue = await callDB(db, 'getIssue', code) as { projectCode: string } | null;
    if (!issue) return reply.status(404).send({ error: 'Issue not found' });

    const member = await callDB(db, 'getProjectUser', me, issue.projectCode) as { permissions: { viewIssues: boolean } } | null;
    if (!member?.permissions.viewIssues) return reply.status(403).send({ error: 'Access denied' });

    const body = CommentSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.issues[0]?.message });

    const comment = await callDB(db, 'createComment', {
      issueCode: code,
      postedBy: me,
      content: body.data.content,
    });
    return reply.status(201).send(comment);
  });

  app.patch('/api/comments/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const me = (req.user as { handle: string }).handle;
    const db = getDB();

    const comment = await callDB(db, 'getComment', id) as { postedBy: string; issueCode: string } | null;
    if (!comment) return reply.status(404).send({ error: 'Comment not found' });
    if (comment.postedBy !== me) return reply.status(403).send({ error: 'Forbidden' });

    const body = CommentSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.issues[0]?.message });

    const updated = await callDB(db, 'updateComment', id, body.data.content);
    return reply.send(updated);
  });

  app.delete('/api/comments/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const me = (req.user as { handle: string }).handle;
    const db = getDB();

    const comment = await callDB(db, 'getComment', id) as { postedBy: string; issueCode: string } | null;
    if (!comment) return reply.status(404).send({ error: 'Comment not found' });

    // Allow comment author or project settings manager to delete
    if (comment.postedBy !== me) {
      const issue = await callDB(db, 'getIssue', comment.issueCode) as { projectCode: string } | null;
      if (!issue) return reply.status(404).send({ error: 'Not found' });
      const member = await callDB(db, 'getProjectUser', me, issue.projectCode) as { permissions: { changeProjectSettings: boolean } } | null;
      if (!member?.permissions.changeProjectSettings) return reply.status(403).send({ error: 'Forbidden' });
    }

    await callDB(db, 'deleteComment', id);
    return reply.status(204).send();
  });
}
