import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyCors from '@fastify/cors';
import fastifyMultipart from '@fastify/multipart';
import { config, IS_PROD } from './src/config';
import { authRoutes } from './src/routes/auth';
import { userRoutes } from './src/routes/users';
import { projectRoutes } from './src/routes/projects';
import { issueRoutes } from './src/routes/issues';
import { attachmentRoutes } from './src/routes/attachments';
import { commentRoutes } from './src/routes/comments';

const app = Fastify({ logger: { level: IS_PROD ? 'warn' : 'info' } });

// ── Plugins ────────────────────────────────────────────────────────────────

await app.register(fastifyCors, {
  origin: config.frontendUrl,
  credentials: true,
});

await app.register(fastifyJwt, {
  secret: config.jwtSecret,
});

await app.register(fastifyMultipart, {
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// ── Auth decorator ─────────────────────────────────────────────────────────

app.decorate('authenticate', async function (this: typeof app, req: typeof app.request, reply: typeof app.reply) {
  try {
    await req.jwtVerify();
  } catch {
    reply.status(401).send({ error: 'Unauthorized' });
  }
});

// ── Routes ─────────────────────────────────────────────────────────────────

await app.register(authRoutes);
await app.register(userRoutes);
await app.register(projectRoutes);
await app.register(issueRoutes);
await app.register(attachmentRoutes);
await app.register(commentRoutes);

app.get('/api/health', async () => ({ ok: true }));

// ── Start ──────────────────────────────────────────────────────────────────

await app.listen({ port: config.port, host: '0.0.0.0' });
console.log(`sigmatodo2-srv running on port ${config.port} [${config.mode}]`);
