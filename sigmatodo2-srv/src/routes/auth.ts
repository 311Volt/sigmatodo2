import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDB } from '../db/index';
import { IS_PROD, config } from '../config';

const LoginSchema = z.object({
  handle: z.string().min(1),
  password: z.string().min(1),
});

const RegisterSchema = z.object({
  handle: z.string().min(2).max(32).regex(/^[a-z0-9_-]+$/, 'Only lowercase letters, numbers, _ and - allowed'),
  displayName: z.string().min(1).max(64),
  password: z.string().min(8),
});

export async function authRoutes(app: FastifyInstance) {
  if (!IS_PROD) {
    // ── Dev: password auth ───────────────────────────────────────────────────

    app.post('/api/auth/register', async (req, reply) => {
      const body = RegisterSchema.safeParse(req.body);
      if (!body.success) return reply.status(400).send({ error: body.error.issues[0]?.message });

      const db = getDB() as import('../db/sqlite').SQLiteDB;
      if (db.handleExists(body.data.handle)) {
        return reply.status(409).send({ error: 'Handle already taken' });
      }

      const passwordHash = await Bun.password.hash(body.data.password);
      const user = db.createUser({
        handle: body.data.handle,
        displayName: body.data.displayName,
        passwordHash,
      });

      const token = app.jwt.sign({ handle: user.handle }, { expiresIn: '30d' });
      return reply.send({ token, user });
    });

    app.post('/api/auth/login', async (req, reply) => {
      const body = LoginSchema.safeParse(req.body);
      if (!body.success) return reply.status(400).send({ error: 'Invalid request' });

      const db = getDB() as import('../db/sqlite').SQLiteDB;
      const user = db.getUserByHandle(body.data.handle);
      if (!user) return reply.status(401).send({ error: 'Invalid credentials' });

      const hash = db.getUserPasswordHash(body.data.handle);
      if (!hash) return reply.status(401).send({ error: 'Invalid credentials' });

      const valid = await Bun.password.verify(body.data.password, hash);
      if (!valid) return reply.status(401).send({ error: 'Invalid credentials' });

      const token = app.jwt.sign({ handle: user.handle }, { expiresIn: '30d' });
      return reply.send({ token, user });
    });
  }

  // ── Prod: Google OAuth ───────────────────────────────────────────────────

  if (IS_PROD) {
    app.get('/api/auth/google', async (_req, reply) => {
      const params = new URLSearchParams({
        client_id: config.googleClientId,
        redirect_uri: config.googleCallbackUrl,
        response_type: 'code',
        scope: 'openid email profile',
        access_type: 'offline',
      });
      return reply.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
    });

    app.get('/api/auth/google/callback', async (req, reply) => {
      const { code } = req.query as { code?: string };
      if (!code) return reply.status(400).send({ error: 'Missing code' });

      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: config.googleClientId,
          client_secret: config.googleClientSecret,
          redirect_uri: config.googleCallbackUrl,
          grant_type: 'authorization_code',
        }),
      });
      const tokenData = await tokenRes.json() as { access_token?: string; error?: string };
      if (!tokenData.access_token) return reply.status(400).send({ error: 'OAuth failed' });

      const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const profile = await profileRes.json() as {
        email: string; name: string; picture?: string; id: string;
      };

      const db = getDB() as import('../db/supabase').SupabaseDB;
      let user = await db.getUserByEmail(profile.email);
      const isNew = !user;

      if (!user) {
        // Placeholder handle; user must pick one on first visit
        const tempHandle = `user_${profile.id.slice(0, 8)}`;
        user = await db.createUser({
          handle: tempHandle,
          displayName: profile.name,
          email: profile.email,
          avatarPath: profile.picture,
        });

        // Accept any pending invitations
        const invitations = await db.getPendingInvitationsByEmail(profile.email);
        for (const inv of invitations) {
          await db.acceptInvitation(inv.id, user.handle);
        }
      }

      const token = app.jwt.sign({ handle: user.handle }, { expiresIn: '30d' });
      const redirectUrl = `${config.frontendUrl}/auth/callback?token=${token}&new=${isNew}`;
      return reply.redirect(redirectUrl);
    });
  }

  // ── Common ───────────────────────────────────────────────────────────────

  app.get('/api/auth/mode', async (_req, reply) => {
    return reply.send({ mode: IS_PROD ? 'prod' : 'dev' });
  });

  app.get('/api/auth/me', { onRequest: [app.authenticate] }, async (req, reply) => {
    const db = getDB();
    const user = await (db as unknown as { getUserByHandle: (h: string) => unknown }).getUserByHandle(
      (req.user as { handle: string }).handle
    );
    if (!user) return reply.status(401).send({ error: 'User not found' });
    return reply.send(user);
  });
}
