import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDB } from '../db/index';
import { getStorage } from '../storage/index';
import { IS_PROD } from '../config';

const UpdateProfileSchema = z.object({
  displayName: z.string().min(1).max(64).optional(),
  bio: z.string().max(500).nullable().optional(),
});

export async function userRoutes(app: FastifyInstance) {
  app.get('/api/users/:handle', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { handle } = req.params as { handle: string };
    const db = getDB();
    const user = await callDB(db, 'getUserByHandle', handle);
    if (!user) return reply.status(404).send({ error: 'User not found' });

    const me = (req.user as { handle: string }).handle;
    if (handle !== me) {
      // Don't expose email to other users
      const { email: _email, ...pub } = user as Record<string, unknown>;
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

    const db = getDB();
    const user = await callDB(db, 'updateUser', handle, body.data);
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

    const storage = getStorage();
    let avatarPath: string;
    if (IS_PROD) {
      avatarPath = await (storage as import('../storage/supabase').SupabaseStorage).saveAvatar(handle, buf, mimeType);
    } else {
      avatarPath = await (storage as import('../storage/filesystem').FilesystemStorage).saveAvatar(handle, buf, mimeType);
    }

    const db = getDB();
    const user = await callDB(db, 'updateUser', handle, { avatarPath });
    return reply.send(user);
  });

  // Handle picking a handle for new Google OAuth users (prod)
  app.post('/api/users/claim-handle', { onRequest: [app.authenticate] }, async (req, reply) => {
    const me = (req.user as { handle: string }).handle;
    const body = z.object({
      handle: z.string().min(2).max(32).regex(/^[a-z0-9_-]+$/, 'Only lowercase letters, numbers, _ and - allowed'),
      displayName: z.string().min(1).max(64).optional(),
    }).safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.issues[0]?.message });

    const db = getDB();
    if (body.data.handle !== me) {
      const exists = await callDB(db, 'handleExists', body.data.handle);
      if (exists) return reply.status(409).send({ error: 'Handle already taken' });
    }

    // Update user record - for prod this would involve renaming the handle
    // For simplicity, we just update displayName if handle matches
    const user = await callDB(db, 'updateUser', me, {
      displayName: body.data.displayName,
    });
    return reply.send(user);
  });
}

// Adapter to call both sync (SQLite) and async (Supabase) DB methods uniformly
async function callDB(db: ReturnType<typeof getDB>, method: string, ...args: unknown[]): Promise<unknown> {
  const fn = (db as Record<string, (...a: unknown[]) => unknown>)[method];
  return fn?.call(db, ...args);
}
