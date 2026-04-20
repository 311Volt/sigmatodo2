import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDB } from '../db/index';
import { getStorage } from '../storage/index';
import { IS_PROD } from '../config';
import { MEMBER_PERMISSIONS, VIEWER_PERMISSIONS } from 'sigmatodo2-common';

const CreateProjectSchema = z.object({
  code: z.string().min(2).max(8).regex(/^[A-Z0-9]+$/, 'Project code must be uppercase letters/numbers'),
  name: z.string().min(1).max(100),
  description: z.string().max(2000).optional(),
});

const UpdateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(2000).nullable().optional(),
  statusDefinitions: z.array(z.object({
    code: z.string().min(1),
    name: z.string().min(1),
    bgColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    importanceLevel: z.number().int().min(0),
  })).optional().refine(defs => {
    if (!defs) return true;
    const codes = defs.map(d => d.code);
    return codes.includes('TODO') && codes.includes('DONE');
  }, 'TODO and DONE status codes are required'),
});

const InviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['editor', 'viewer']).default('editor'),
});

const UpdateMemberSchema = z.object({
  role: z.enum(['editor', 'viewer']),
});

async function callDB(db: ReturnType<typeof getDB>, method: string, ...args: unknown[]): Promise<unknown> {
  const fn = (db as Record<string, (...a: unknown[]) => unknown>)[method];
  return fn?.call(db, ...args);
}

export async function projectRoutes(app: FastifyInstance) {
  app.get('/api/projects', { onRequest: [app.authenticate] }, async (req, reply) => {
    const me = (req.user as { handle: string }).handle;
    const db = getDB();
    const projects = await callDB(db, 'getUserProjects', me, me);
    return reply.send(projects);
  });

  app.post('/api/projects', { onRequest: [app.authenticate] }, async (req, reply) => {
    const me = (req.user as { handle: string }).handle;
    const body = CreateProjectSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.issues[0]?.message });

    const db = getDB();
    const exists = await callDB(db, 'projectCodeExists', body.data.code);
    if (exists) return reply.status(409).send({ error: 'Project code already in use' });

    const project = await callDB(db, 'createProject', {
      ...body.data,
      ownerHandle: me,
    });
    return reply.status(201).send(project);
  });

  app.get('/api/projects/:code', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { code } = req.params as { code: string };
    const me = (req.user as { handle: string }).handle;
    const db = getDB();

    const member = await callDB(db, 'getProjectUser', me, code);
    if (!member) return reply.status(403).send({ error: 'Access denied' });

    const project = await callDB(db, 'getProjectByCode', code);
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    return reply.send({ ...project, myPermissions: (member as { permissions: unknown }).permissions });
  });

  app.patch('/api/projects/:code', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { code } = req.params as { code: string };
    const me = (req.user as { handle: string }).handle;
    const db = getDB();

    const member = await callDB(db, 'getProjectUser', me, code);
    if (!member || !(member as { permissions: { changeProjectSettings: boolean } }).permissions.changeProjectSettings) {
      return reply.status(403).send({ error: 'Insufficient permissions' });
    }

    const body = UpdateProjectSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.issues[0]?.message });

    const project = await callDB(db, 'updateProject', code, body.data);
    return reply.send(project);
  });

  app.delete('/api/projects/:code', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { code } = req.params as { code: string };
    const me = (req.user as { handle: string }).handle;
    const db = getDB();

    const member = await callDB(db, 'getProjectUser', me, code);
    if (!member || !(member as { permissions: { changeProjectSettings: boolean } }).permissions.changeProjectSettings) {
      return reply.status(403).send({ error: 'Insufficient permissions' });
    }

    await callDB(db, 'deleteProject', code);
    return reply.status(204).send();
  });

  // ── Background image ─────────────────────────────────────────────────────

  app.post('/api/projects/:code/background', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { code } = req.params as { code: string };
    const me = (req.user as { handle: string }).handle;
    const db = getDB();

    const member = await callDB(db, 'getProjectUser', me, code);
    if (!member || !(member as { permissions: { changeProjectSettings: boolean } }).permissions.changeProjectSettings) {
      return reply.status(403).send({ error: 'Insufficient permissions' });
    }

    const data = await req.file();
    if (!data) return reply.status(400).send({ error: 'No file' });
    const buf = await data.toBuffer();
    const mimeType = data.mimetype;
    if (!mimeType.startsWith('image/')) return reply.status(400).send({ error: 'Must be an image' });

    const storage = getStorage();
    let bgPath: string;
    if (IS_PROD) {
      bgPath = await (storage as import('../storage/supabase').SupabaseStorage).saveProjectBackground(code, buf, mimeType);
    } else {
      bgPath = await (storage as import('../storage/filesystem').FilesystemStorage).saveProjectBackground(code, buf, mimeType);
    }

    const project = await callDB(db, 'updateProject', code, { backgroundImgPath: bgPath });
    return reply.send(project);
  });

  // ── Members ───────────────────────────────────────────────────────────────

  app.get('/api/projects/:code/members', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { code } = req.params as { code: string };
    const me = (req.user as { handle: string }).handle;
    const db = getDB();

    const member = await callDB(db, 'getProjectUser', me, code);
    if (!member) return reply.status(403).send({ error: 'Access denied' });

    const members = await callDB(db, 'getProjectMembers', code);
    return reply.send(members);
  });

  app.post('/api/projects/:code/members', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { code } = req.params as { code: string };
    const me = (req.user as { handle: string }).handle;
    const db = getDB();

    const member = await callDB(db, 'getProjectUser', me, code);
    if (!member || !(member as { permissions: { changeProjectSettings: boolean } }).permissions.changeProjectSettings) {
      return reply.status(403).send({ error: 'Insufficient permissions' });
    }

    const body = InviteSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.issues[0]?.message });

    const permissions = body.data.role === 'viewer' ? VIEWER_PERMISSIONS : MEMBER_PERMISSIONS;

    // Check if user with this email already exists
    const existingUser = await callDB(db, 'getUserByEmail', body.data.email);
    if (existingUser) {
      const handle = (existingUser as { handle: string }).handle;
      const alreadyMember = await callDB(db, 'getProjectUser', handle, code);
      if (alreadyMember) return reply.status(409).send({ error: 'User is already a member' });
      await callDB(db, 'addProjectUser', { userHandle: handle, projectCode: code, permissions });
      return reply.status(201).send({ added: true });
    }

    // Create invitation for non-registered email
    const invitation = await callDB(db, 'createInvitation', {
      projectCode: code,
      email: body.data.email,
      invitedBy: me,
      permissions,
    });
    return reply.status(201).send({ invited: true, invitation });
  });

  app.patch('/api/projects/:code/members/:handle', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { code, handle } = req.params as { code: string; handle: string };
    const me = (req.user as { handle: string }).handle;
    const db = getDB();

    const myMember = await callDB(db, 'getProjectUser', me, code);
    if (!myMember || !(myMember as { permissions: { changeProjectSettings: boolean } }).permissions.changeProjectSettings) {
      return reply.status(403).send({ error: 'Insufficient permissions' });
    }

    const body = UpdateMemberSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.issues[0]?.message });

    const permissions = body.data.role === 'viewer' ? VIEWER_PERMISSIONS : MEMBER_PERMISSIONS;
    await callDB(db, 'updateProjectUser', handle, code, permissions);
    return reply.send({ ok: true });
  });

  app.delete('/api/projects/:code/members/:handle', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { code, handle } = req.params as { code: string; handle: string };
    const me = (req.user as { handle: string }).handle;
    const db = getDB();

    const myMember = await callDB(db, 'getProjectUser', me, code);
    if (!myMember || !(myMember as { permissions: { changeProjectSettings: boolean } }).permissions.changeProjectSettings) {
      if (handle !== me) return reply.status(403).send({ error: 'Insufficient permissions' });
    }

    await callDB(db, 'removeProjectUser', handle, code);
    return reply.status(204).send();
  });

  app.get('/api/projects/:code/invitations', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { code } = req.params as { code: string };
    const me = (req.user as { handle: string }).handle;
    const db = getDB();

    const member = await callDB(db, 'getProjectUser', me, code);
    if (!member || !(member as { permissions: { changeProjectSettings: boolean } }).permissions.changeProjectSettings) {
      return reply.status(403).send({ error: 'Insufficient permissions' });
    }

    const invitations = await callDB(db, 'getProjectInvitations', code);
    return reply.send(invitations);
  });
}
