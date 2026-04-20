import type { FastifyInstance } from 'fastify';
import { join } from 'path';
import { getDB } from '../db/index';
import { getStorage } from '../storage/index';
import { IS_PROD } from '../config';
import { FilesystemStorage } from '../storage/filesystem';
import { SupabaseStorage } from '../storage/supabase';

async function callDB(db: ReturnType<typeof getDB>, method: string, ...args: unknown[]): Promise<unknown> {
  const fn = (db as Record<string, (...a: unknown[]) => unknown>)[method];
  return fn?.call(db, ...args);
}

export async function attachmentRoutes(app: FastifyInstance) {
  app.get('/api/issues/:code/attachments', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { code } = req.params as { code: string };
    const me = (req.user as { handle: string }).handle;
    const db = getDB();

    const issue = await callDB(db, 'getIssue', code) as { projectCode: string } | null;
    if (!issue) return reply.status(404).send({ error: 'Issue not found' });

    const member = await callDB(db, 'getProjectUser', me, issue.projectCode);
    if (!member) return reply.status(403).send({ error: 'Access denied' });

    const attachments = await callDB(db, 'getIssueAttachments', code);
    return reply.send(attachments);
  });

  app.post('/api/issues/:code/attachments', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { code } = req.params as { code: string };
    const me = (req.user as { handle: string }).handle;
    const db = getDB();

    const issue = await callDB(db, 'getIssue', code) as { projectCode: string } | null;
    if (!issue) return reply.status(404).send({ error: 'Issue not found' });

    const member = await callDB(db, 'getProjectUser', me, issue.projectCode) as { permissions: { editIssues: boolean } } | null;
    if (!member?.permissions.editIssues) return reply.status(403).send({ error: 'Insufficient permissions' });

    const data = await req.file();
    if (!data) return reply.status(400).send({ error: 'No file' });

    const buf = await data.toBuffer();
    const { randomUUID } = await import('crypto');
    const id = randomUUID();
    const filename = data.filename;

    const storage = getStorage();
    let storagePath: string;
    if (IS_PROD) {
      storagePath = await (storage as SupabaseStorage).saveAttachment(code, id, filename, buf, data.mimetype);
    } else {
      storagePath = await (storage as FilesystemStorage).saveAttachment(code, id, filename, buf);
    }

    const attachment = await callDB(db, 'createAttachment', { issueCode: code, filename, path: storagePath });
    return reply.status(201).send(attachment);
  });

  app.get('/api/attachments/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const me = (req.user as { handle: string }).handle;
    const db = getDB();

    const attachment = await callDB(db, 'getAttachment', id) as { issueCode: string; filename: string; path: string } | null;
    if (!attachment) return reply.status(404).send({ error: 'Not found' });

    const issue = await callDB(db, 'getIssue', attachment.issueCode) as { projectCode: string } | null;
    if (!issue) return reply.status(404).send({ error: 'Not found' });

    const member = await callDB(db, 'getProjectUser', me, issue.projectCode);
    if (!member) return reply.status(403).send({ error: 'Access denied' });

    if (IS_PROD) {
      const url = await (getStorage() as SupabaseStorage).getAttachmentUrl(attachment.path);
      return reply.redirect(url);
    } else {
      // attachment.path is relative to uploadsDir
      return reply.redirect(`/api/uploads/${attachment.path}`);
    }
  });

  app.delete('/api/attachments/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const me = (req.user as { handle: string }).handle;
    const db = getDB();

    const attachment = await callDB(db, 'getAttachment', id) as { issueCode: string; path: string } | null;
    if (!attachment) return reply.status(404).send({ error: 'Not found' });

    const issue = await callDB(db, 'getIssue', attachment.issueCode) as { projectCode: string } | null;
    if (!issue) return reply.status(404).send({ error: 'Not found' });

    const member = await callDB(db, 'getProjectUser', me, issue.projectCode) as { permissions: { editIssues: boolean } } | null;
    if (!member?.permissions.editIssues) return reply.status(403).send({ error: 'Insufficient permissions' });

    const path = await callDB(db, 'deleteAttachment', id) as string | null;
    if (path) {
      await getStorage().deleteFile(path);
    }

    return reply.status(204).send();
  });

  // Dev-only: serve uploaded files via Bun's native file API
  if (!IS_PROD) {
    app.get('/api/uploads/*', async (req, reply) => {
      const storage = getStorage() as FilesystemStorage;
      const relPath = (req.params as Record<string, string>)['*'] ?? '';
      const fullPath = storage.resolveFullPath(relPath);
      const file = Bun.file(fullPath);
      if (!await file.exists()) return reply.status(404).send({ error: 'Not found' });
      const buf = await file.arrayBuffer();
      return reply
        .header('Content-Type', file.type || 'application/octet-stream')
        .send(Buffer.from(buf));
    });
  }
}
