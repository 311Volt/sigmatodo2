import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as issueRepo from '../repositories/issueRepo';
import * as commentRepo from '../repositories/commentRepo';
import * as projectRepo from '../repositories/projectRepo';

const CommentSchema = z.object({
  content: z.string().min(1).max(10000),
});

export async function commentRoutes(app: FastifyInstance) {
  app.get('/api/issues/:code/comments', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { code } = req.params as { code: string };
    const me = (req.user as { handle: string }).handle;

    const issue = await issueRepo.getIssue(code);
    if (!issue) return reply.status(404).send({ error: 'Issue not found' });

    const member = await projectRepo.getProjectUser(me, issue.projectCode);
    if (!member) return reply.status(403).send({ error: 'Access denied' });

    const comments = await commentRepo.getIssueComments(code);
    return reply.send(comments);
  });

  app.post('/api/issues/:code/comments', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { code } = req.params as { code: string };
    const me = (req.user as { handle: string }).handle;

    const issue = await issueRepo.getIssue(code);
    if (!issue) return reply.status(404).send({ error: 'Issue not found' });

    const member = await projectRepo.getProjectUser(me, issue.projectCode);
    if (!member?.permissions.viewIssues) return reply.status(403).send({ error: 'Access denied' });

    const body = CommentSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.issues[0]?.message });

    const comment = await commentRepo.createComment({ issueCode: code, postedBy: me, content: body.data.content });
    return reply.status(201).send(comment);
  });

  app.patch('/api/comments/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const me = (req.user as { handle: string }).handle;

    const comment = await commentRepo.getComment(id);
    if (!comment) return reply.status(404).send({ error: 'Comment not found' });
    if (comment.postedBy !== me) return reply.status(403).send({ error: 'Forbidden' });

    const body = CommentSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.issues[0]?.message });

    const updated = await commentRepo.updateComment(id, body.data.content);
    return reply.send(updated);
  });

  app.delete('/api/comments/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const me = (req.user as { handle: string }).handle;

    const comment = await commentRepo.getComment(id);
    if (!comment) return reply.status(404).send({ error: 'Comment not found' });

    if (comment.postedBy !== me) {
      const issue = await issueRepo.getIssue(comment.issueCode);
      if (!issue) return reply.status(404).send({ error: 'Not found' });
      const member = await projectRepo.getProjectUser(me, issue.projectCode);
      if (!member?.permissions.changeProjectSettings) return reply.status(403).send({ error: 'Forbidden' });
    }

    await commentRepo.deleteComment(id);
    return reply.status(204).send();
  });
}
