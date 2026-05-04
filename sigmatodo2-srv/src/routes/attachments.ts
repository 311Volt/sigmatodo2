import type { FastifyInstance } from 'fastify';
import { IS_PROD } from '../config';
import { getStorage } from '../storage/index';
import { FilesystemStorage } from '../storage/filesystem';
import { SupabaseStorage } from '../storage/supabase';
import * as issueRepo from '../repositories/issueRepo';
import * as attachmentRepo from '../repositories/attachmentRepo';
import * as projectRepo from '../repositories/projectRepo';

export async function attachmentRoutes(app: FastifyInstance) {
  app.get('/api/issues/:code/attachments', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { code } = req.params as { code: string };
    const me = (req.user as { handle: string }).handle;

    const issue = await issueRepo.getIssue(code);
    if (!issue) return reply.status(404).send({ error: 'Issue not found' });

    const member = await projectRepo.getProjectUser(me, issue.projectCode);
    if (!member) return reply.status(403).send({ error: 'Access denied' });

    const attachments = await attachmentRepo.getIssueAttachments(code);
    return reply.send(attachments);
  });

  app.post('/api/issues/:code/attachments', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { code } = req.params as { code: string };
    const me = (req.user as { handle: string }).handle;

    const issue = await issueRepo.getIssue(code);
    if (!issue) return reply.status(404).send({ error: 'Issue not found' });

    const member = await projectRepo.getProjectUser(me, issue.projectCode);
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

    const attachment = await attachmentRepo.createAttachment({ issueCode: code, filename, path: storagePath });
    return reply.status(201).send(attachment);
  });

  app.get('/api/attachments/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const me = (req.user as { handle: string }).handle;

    const attachment = await attachmentRepo.getAttachment(id);
    if (!attachment) return reply.status(404).send({ error: 'Not found' });

    const issue = await issueRepo.getIssue(attachment.issueCode);
    if (!issue) return reply.status(404).send({ error: 'Not found' });

    const member = await projectRepo.getProjectUser(me, issue.projectCode);
    if (!member) return reply.status(403).send({ error: 'Access denied' });

    if (IS_PROD) {
      const url = await (getStorage() as SupabaseStorage).getAttachmentUrl(attachment.path);
      return reply.redirect(url);
    } else {
      return reply.redirect(`/api/uploads/${attachment.path}`);
    }
  });

  app.delete('/api/attachments/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const me = (req.user as { handle: string }).handle;

    const attachment = await attachmentRepo.getAttachment(id);
    if (!attachment) return reply.status(404).send({ error: 'Not found' });

    const issue = await issueRepo.getIssue(attachment.issueCode);
    if (!issue) return reply.status(404).send({ error: 'Not found' });

    const member = await projectRepo.getProjectUser(me, issue.projectCode);
    if (!member?.permissions.editIssues) return reply.status(403).send({ error: 'Insufficient permissions' });

    const path = await attachmentRepo.deleteAttachment(id);
    if (path) {
      await getStorage().deleteFile(path);
    }

    return reply.status(204).send();
  });

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
