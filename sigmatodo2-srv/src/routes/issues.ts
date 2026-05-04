import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { SortOption } from 'sigmatodo2-common';
import * as projectRepo from '../repositories/projectRepo';
import * as issueRepo from '../repositories/issueRepo';
import * as issueService from '../services/issueService';

const CreateIssueSchema = z.object({
  title: z.string().min(1).max(500),
  status: z.string().min(1),
  priority: z.enum(['low', 'normal', 'high', 'highest']).default('normal'),
  assignedTo: z.string().nullable().optional(),
  dueBy: z.string().datetime({ offset: true }).nullable().optional(),
  markdownDescription: z.string().nullable().optional(),
});

const UpdateIssueSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  status: z.string().min(1).optional(),
  priority: z.enum(['low', 'normal', 'high', 'highest']).optional(),
  assignedTo: z.string().nullable().optional(),
  dueBy: z.string().datetime({ offset: true }).nullable().optional(),
  markdownDescription: z.string().nullable().optional(),
});

async function requireProjectAccess(projectCode: string, userHandle: string, requireEdit = false) {
  const member = await projectRepo.getProjectUser(userHandle, projectCode);
  if (!member) return null;
  if (requireEdit && !member.permissions.editIssues) return null;
  return member;
}

export async function issueRoutes(app: FastifyInstance) {
  app.get('/api/projects/:code/issues', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { code } = req.params as { code: string };
    const me = (req.user as { handle: string }).handle;
    const { sort = 'relevant' } = req.query as { sort?: string };

    const member = await requireProjectAccess(code, me);
    if (!member) return reply.status(403).send({ error: 'Access denied' });

    const issues = await issueService.getProjectIssues(code, sort as SortOption, me);
    return reply.send(issues);
  });

  app.post('/api/projects/:code/issues', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { code } = req.params as { code: string };
    const me = (req.user as { handle: string }).handle;

    const member = await requireProjectAccess(code, me, true);
    if (!member) return reply.status(403).send({ error: 'Insufficient permissions' });

    const body = CreateIssueSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.issues[0]?.message });

    const issue = await issueRepo.createIssue({ projectCode: code, createdBy: me, ...body.data });
    return reply.status(201).send(issue);
  });

  app.get('/api/issues/:code', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { code } = req.params as { code: string };
    const me = (req.user as { handle: string }).handle;

    const issue = await issueRepo.getIssueWithAssignee(code);
    if (!issue) return reply.status(404).send({ error: 'Issue not found' });

    const member = await requireProjectAccess(issue.projectCode, me);
    if (!member) return reply.status(403).send({ error: 'Access denied' });

    return reply.send(issue);
  });

  app.patch('/api/issues/:code', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { code } = req.params as { code: string };
    const me = (req.user as { handle: string }).handle;

    const existing = await issueRepo.getIssue(code);
    if (!existing) return reply.status(404).send({ error: 'Issue not found' });

    const member = await requireProjectAccess(existing.projectCode, me, true);
    if (!member) return reply.status(403).send({ error: 'Insufficient permissions' });

    const body = UpdateIssueSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.issues[0]?.message });

    const issue = await issueRepo.updateIssue(code, body.data);
    return reply.send(issue);
  });

  app.delete('/api/issues/:code', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { code } = req.params as { code: string };
    const me = (req.user as { handle: string }).handle;

    const existing = await issueRepo.getIssue(code);
    if (!existing) return reply.status(404).send({ error: 'Issue not found' });

    const member = await requireProjectAccess(existing.projectCode, me, true);
    if (!member) return reply.status(403).send({ error: 'Insufficient permissions' });

    await issueRepo.deleteIssue(code);
    return reply.status(204).send();
  });
}
