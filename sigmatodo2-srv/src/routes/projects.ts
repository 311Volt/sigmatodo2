import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { IS_PROD } from '../config';
import { getStorage } from '../storage/index';
import { MEMBER_PERMISSIONS, VIEWER_PERMISSIONS } from 'sigmatodo2-common';
import * as projectRepo from '../repositories/projectRepo';
import * as invitationRepo from '../repositories/invitationRepo';
import * as projectService from '../services/projectService';

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
    isActive: z.boolean().default(false),
  })).optional().refine(defs => {
    if (!defs) return true;
    const codes = defs.map(d => d.code);
    return codes.includes('TODO') && codes.includes('DONE');
  }, 'TODO and DONE status codes are required'),
});

const InviteSchema = z.object({
  role: z.enum(['editor', 'viewer']).default('editor'),
  expiresAt: z.string().datetime().optional(),
});

const UpdateMemberSchema = z.object({
  role: z.enum(['editor', 'viewer']),
});

export async function projectRoutes(app: FastifyInstance) {
  app.get('/api/projects', { onRequest: [app.authenticate] }, async (req, reply) => {
    const me = (req.user as { handle: string }).handle;
    const projects = await projectRepo.getUserProjects(me, me);
    return reply.send(projects);
  });

  app.post('/api/projects', { onRequest: [app.authenticate] }, async (req, reply) => {
    const me = (req.user as { handle: string }).handle;
    const body = CreateProjectSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.issues[0]?.message });

    if (await projectRepo.projectCodeExists(body.data.code)) {
      return reply.status(409).send({ error: 'Project code already in use' });
    }

    const project = await projectService.createProject({ ...body.data, ownerHandle: me });
    return reply.status(201).send(project);
  });

  app.get('/api/projects/:code', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { code } = req.params as { code: string };
    const me = (req.user as { handle: string }).handle;

    const member = await projectRepo.getProjectUser(me, code);
    if (!member) return reply.status(403).send({ error: 'Access denied' });

    const project = await projectRepo.getProjectByCode(code);
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    return reply.send({ ...project, myPermissions: member.permissions });
  });

  app.patch('/api/projects/:code', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { code } = req.params as { code: string };
    const me = (req.user as { handle: string }).handle;

    const member = await projectRepo.getProjectUser(me, code);
    if (!member?.permissions.changeProjectSettings) {
      return reply.status(403).send({ error: 'Insufficient permissions' });
    }

    const body = UpdateProjectSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.issues[0]?.message });

    const project = await projectRepo.updateProject(code, body.data);
    return reply.send(project);
  });

  app.delete('/api/projects/:code', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { code } = req.params as { code: string };
    const me = (req.user as { handle: string }).handle;

    const member = await projectRepo.getProjectUser(me, code);
    if (!member?.permissions.changeProjectSettings) {
      return reply.status(403).send({ error: 'Insufficient permissions' });
    }

    await projectRepo.deleteProject(code);
    return reply.status(204).send();
  });

  // ── Background image ─────────────────────────────────────────────────────

  app.post('/api/projects/:code/background', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { code } = req.params as { code: string };
    const me = (req.user as { handle: string }).handle;

    const member = await projectRepo.getProjectUser(me, code);
    if (!member?.permissions.changeProjectSettings) {
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

    const project = await projectRepo.updateProject(code, { backgroundImgPath: bgPath });
    return reply.send(project);
  });

  // ── Members ───────────────────────────────────────────────────────────────

  app.get('/api/projects/:code/members', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { code } = req.params as { code: string };
    const me = (req.user as { handle: string }).handle;

    const member = await projectRepo.getProjectUser(me, code);
    if (!member) return reply.status(403).send({ error: 'Access denied' });

    const members = await projectRepo.getProjectMembers(code);
    return reply.send(members);
  });

  app.post('/api/projects/:code/members', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { code } = req.params as { code: string };
    const me = (req.user as { handle: string }).handle;

    const member = await projectRepo.getProjectUser(me, code);
    if (!member?.permissions.changeProjectSettings) {
      return reply.status(403).send({ error: 'Insufficient permissions' });
    }

    const body = InviteSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.issues[0]?.message });

    const permissions = body.data.role === 'viewer' ? VIEWER_PERMISSIONS : MEMBER_PERMISSIONS;

    const invitation = await invitationRepo.createInvitation({
      projectCode: code,
      invitedBy: me,
      invitationFor: null,
      expiresAt: body.data.expiresAt ?? null,
      permissions,
    });
    return reply.status(201).send(invitation);
  });

  app.patch('/api/projects/:code/members/:handle', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { code, handle } = req.params as { code: string; handle: string };
    const me = (req.user as { handle: string }).handle;

    const myMember = await projectRepo.getProjectUser(me, code);
    if (!myMember?.permissions.changeProjectSettings) {
      return reply.status(403).send({ error: 'Insufficient permissions' });
    }

    const body = UpdateMemberSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.issues[0]?.message });

    const permissions = body.data.role === 'viewer' ? VIEWER_PERMISSIONS : MEMBER_PERMISSIONS;
    await projectRepo.updateProjectUser(handle, code, permissions);
    return reply.send({ ok: true });
  });

  app.delete('/api/projects/:code/members/:handle', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { code, handle } = req.params as { code: string; handle: string };
    const me = (req.user as { handle: string }).handle;

    const myMember = await projectRepo.getProjectUser(me, code);
    if (!myMember?.permissions.changeProjectSettings) {
      if (handle !== me) return reply.status(403).send({ error: 'Insufficient permissions' });
    }

    await projectRepo.removeProjectUser(handle, code);
    return reply.status(204).send();
  });

  app.get('/api/projects/:code/invitations', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { code } = req.params as { code: string };
    const me = (req.user as { handle: string }).handle;

    const member = await projectRepo.getProjectUser(me, code);
    if (!member?.permissions.changeProjectSettings) {
      return reply.status(403).send({ error: 'Insufficient permissions' });
    }

    const invitations = await invitationRepo.getProjectInvitations(code);
    return reply.send(invitations);
  });
}
