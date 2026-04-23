import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDB } from '../db/index';
import type { SortOption } from 'sigmatodo2-common';

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

async function callDB(db: ReturnType<typeof getDB>, method: string, ...args: unknown[]): Promise<unknown> {
  const fn = (db as Record<string, (...a: unknown[]) => unknown>)[method];
  return fn?.call(db, ...args);
}

async function requireProjectAccess(
  db: ReturnType<typeof getDB>,
  projectCode: string,
  userHandle: string,
  requireEdit = false,
) {
  const member = await callDB(db, 'getProjectUser', userHandle, projectCode) as { permissions: { viewIssues: boolean; editIssues: boolean } } | null;
  if (!member) return null;
  if (requireEdit && !member.permissions.editIssues) return null;
  return member;
}

export async function issueRoutes(app: FastifyInstance) {
  app.get('/api/projects/:code/issues', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { code } = req.params as { code: string };
    const me = (req.user as { handle: string }).handle;
    const { sort = 'relevant' } = req.query as { sort?: string };
    const db = getDB();

    const member = await requireProjectAccess(db, code, me);
    if (!member) return reply.status(403).send({ error: 'Access denied' });

    const issues = await callDB(db, 'getProjectIssues', code, sort as SortOption, me);
    return reply.send(issues);
  });

  app.post('/api/projects/:code/issues', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { code } = req.params as { code: string };
    const me = (req.user as { handle: string }).handle;
    const db = getDB();

    const member = await requireProjectAccess(db, code, me, true);
    if (!member) return reply.status(403).send({ error: 'Insufficient permissions' });

    const body = CreateIssueSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.issues[0]?.message });

    const issue = await callDB(db, 'createIssue', { projectCode: code, createdBy: me, ...body.data });
    return reply.status(201).send(issue);
  });

  app.get('/api/issues/:code', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { code } = req.params as { code: string };
    const me = (req.user as { handle: string }).handle;
    const db = getDB();

    const issue = await callDB(db, 'getIssueWithAssignee', code) as { projectCode: string } | null;
    if (!issue) return reply.status(404).send({ error: 'Issue not found' });

    const member = await requireProjectAccess(db, issue.projectCode, me);
    if (!member) return reply.status(403).send({ error: 'Access denied' });

    return reply.send(issue);
  });

  app.patch('/api/issues/:code', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { code } = req.params as { code: string };
    const me = (req.user as { handle: string }).handle;
    const db = getDB();

    const existing = await callDB(db, 'getIssue', code) as { projectCode: string } | null;
    if (!existing) return reply.status(404).send({ error: 'Issue not found' });

    const member = await requireProjectAccess(db, existing.projectCode, me, true);
    if (!member) return reply.status(403).send({ error: 'Insufficient permissions' });

    const body = UpdateIssueSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.issues[0]?.message });

    const issue = await callDB(db, 'updateIssue', code, body.data);
    return reply.send(issue);
  });

  app.delete('/api/issues/:code', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { code } = req.params as { code: string };
    const me = (req.user as { handle: string }).handle;
    const db = getDB();

    const existing = await callDB(db, 'getIssue', code) as { projectCode: string } | null;
    if (!existing) return reply.status(404).send({ error: 'Issue not found' });

    const member = await requireProjectAccess(db, existing.projectCode, me, true);
    if (!member) return reply.status(403).send({ error: 'Insufficient permissions' });

    await callDB(db, 'deleteIssue', code);
    return reply.status(204).send();
  });
}
