import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { SortOption } from 'sigmatodo2-common';
import { saveUserAvatar } from '../services/avatarService';
import * as issueService from '../services/issueService';
import * as userRepo from '../repositories/userRepo';

const UpdateProfileSchema = z.object({
  displayName: z.string().min(1).max(64).optional(),
  bio: z.string().max(500).nullable().optional(),
});

export async function userRoutes(app: FastifyInstance) {
  app.get('/api/users/:handle/issues', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { handle } = req.params as { handle: string };
    const me = (req.user as { handle: string }).handle;
    const { sort = 'relevant' } = req.query as { sort?: string };

    const user = await userRepo.getUserByHandle(handle);
    if (!user) return reply.status(404).send({ error: 'User not found' });

    if (handle !== me && !(await userRepo.hasMutualProject(me, handle))) {
      return reply.status(403).send({ error: 'Access denied' });
    }

    const issues = await issueService.getVisibleAssignedIssues(handle, me, sort as SortOption);
    return reply.send(issues);
  });

  app.get('/api/users/:handle', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { handle } = req.params as { handle: string };
    const user = await userRepo.getUserByHandle(handle);
    if (!user) return reply.status(404).send({ error: 'User not found' });

    const me = (req.user as { handle: string }).handle;
    if (handle !== me) {
      if (!(await userRepo.hasMutualProject(me, handle))) {
        return reply.status(403).send({ error: 'Access denied' });
      }
      const { email: _email, ...pub } = user;
      return reply.send(pub);
    }
    return reply.send(user);
  });

  app.patch('/api/users/:handle', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { handle } = req.params as { handle: string };
    const me = (req.user as { handle: string }).handle;
    if (handle !== me) return reply.status(403).send({ error: 'Forbidden' });

    const body = UpdateProfileSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.issues[0]?.message });

    const user = await userRepo.updateUser(handle, body.data);
    return reply.send(user);
  });

  app.post('/api/users/:handle/avatar', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { handle } = req.params as { handle: string };
    const me = (req.user as { handle: string }).handle;
    if (handle !== me) return reply.status(403).send({ error: 'Forbidden' });

    const data = await req.file();
    if (!data) return reply.status(400).send({ error: 'No file' });

    const buf = await data.toBuffer();
    const mimeType = data.mimetype;
    if (!mimeType.startsWith('image/')) return reply.status(400).send({ error: 'Must be an image' });

    const user = await saveUserAvatar(handle, buf, mimeType);
    return reply.send(user);
  });

  app.post('/api/users/claim-handle', { onRequest: [app.authenticate] }, async (req, reply) => {
    const me = (req.user as { handle: string }).handle;
    const body = z.object({
      handle: z.string().min(2).max(32).regex(/^[a-z0-9_-]+$/, 'Only lowercase letters, numbers, _ and - allowed'),
      displayName: z.string().min(1).max(64).optional(),
    }).safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.issues[0]?.message });

    if (body.data.handle !== me) {
      if (await userRepo.handleExists(body.data.handle)) {
        return reply.status(409).send({ error: 'Handle already taken' });
      }
    }

    const user = await userRepo.updateUser(me, { displayName: body.data.displayName });
    return reply.send(user);
  });
}
