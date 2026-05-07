import type { FastifyInstance, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';
import { getStorage } from '../storage/index';
import {
  isPublicFilePath,
  requireStoragePath,
  safeStorageFilename,
} from '../storage/paths';
import type { StoredFile } from '../storage/types';

function sendStoredFile(reply: FastifyReply, file: StoredFile) {
  return reply
    .header('Content-Type', file.contentType)
    .header('Content-Length', String(file.data.byteLength))
    .header('Cache-Control', 'public, max-age=300')
    .send(Buffer.from(file.data));
}

async function fetchPublicFile(rawPath: string, reply: FastifyReply) {
  let path: string;
  try {
    path = requireStoragePath(rawPath);
  } catch {
    return reply.status(400).send({ error: 'Invalid file path' });
  }

  if (!isPublicFilePath(path)) {
    return reply.status(403).send({ error: 'Access denied' });
  }

  const file = await getStorage().getFile(path);
  if (!file) return reply.status(404).send({ error: 'Not found' });
  return sendStoredFile(reply, file);
}

export async function fileRoutes(app: FastifyInstance) {
  app.post('/api/files', { onRequest: [app.authenticate] }, async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.status(400).send({ error: 'No file' });

    const me = (req.user as { handle: string }).handle;
    const id = randomUUID();
    const filename = safeStorageFilename(data.filename);
    const path = `files/${me}/${id}-${filename}`;
    const buf = await data.toBuffer();
    const storagePath = await getStorage().uploadFile(path, buf, data.mimetype);

    return reply.status(201).send({ path: storagePath });
  });

  app.get('/api/files/*', async (req, reply) => {
    const rawPath = (req.params as Record<string, string>)['*'] ?? '';
    return fetchPublicFile(rawPath, reply);
  });

}
