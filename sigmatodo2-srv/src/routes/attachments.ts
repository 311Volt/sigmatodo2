import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'crypto';
import { getStorage } from '../storage/index';
import * as issueRepo from '../repositories/issueRepo';
import * as attachmentRepo from '../repositories/attachmentRepo';
import * as projectRepo from '../repositories/projectRepo';

async function getAttachmentDownloadHandle(
  app: FastifyInstance,
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<string | null> {
  try {
    const token = (req.query as { token?: string }).token;
    if (!req.headers.authorization && token) {
      const decoded = app.jwt.verify<{ handle: string }>(token);
      return decoded.handle;
    }

    await req.jwtVerify();
    return (req.user as { handle: string }).handle;
  } catch {
    reply.status(401).send({ error: 'Unauthorized' });
    return null;
  }
}

export async function attachmentRoutes(app: FastifyInstance) {
  app.get('/api/issues/:code/attachments', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { code } = req.params as { code: string };
    const me = (req.user as { handle: string }).handle;

    const issue = await issueRepo.getIssue(code);
    if (!issue) return reply.status(404).send({ error: 'Issue not found' });

    const member = await projectRepo.getProjectUser(me, issue.projectCode);
    if (!member?.permissions.viewIssues) return reply.status(403).send({ error: 'Access denied' });

    const attachments = await attachmentRepo.getIssueAttachments(code);
    return reply.send(attachments);
  });

  app.post('/api/issues/:code/attachments', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { code } = req.params as { code: string };
    const me = (req.user as { handle: string }).handle;

    const issue = await issueRepo.getIssue(code);
    if (!issue) return reply.status(404).send({ error: 'Issue not found' });

    const member = await projectRepo.getProjectUser(me, issue.projectCode);
    if (!member?.permissions.viewIssues) return reply.status(403).send({ error: 'Access denied' });

    const data = await req.file();
    if (!data) return reply.status(400).send({ error: 'No file' });

    const buf = await data.toBuffer();
    const id = randomUUID();
    const filename = data.filename;
    const mimeType = data.mimetype || 'application/octet-stream';

    const storagePath = await getStorage().saveAttachment(code, id, filename, buf, mimeType);

    const attachment = await attachmentRepo.createAttachment({
      projectCode: issue.projectCode,
      issueCode: code,
      filename,
      mimeType,
      path: storagePath,
    });
    return reply.status(201).send(attachment);
  });

  app.get('/api/attachments/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const me = await getAttachmentDownloadHandle(app, req, reply);
    if (!me) return;

    const attachment = await attachmentRepo.getAttachment(id);
    if (!attachment) return reply.status(404).send({ error: 'Not found' });

    const member = await projectRepo.getProjectUser(me, attachment.projectCode);
    if (!member?.permissions.viewIssues) return reply.status(403).send({ error: 'Access denied' });

    const file = await getStorage().getFile(attachment.path);
    if (!file) return reply.status(404).send({ error: 'Not found' });

    return reply
      .header('Content-Type', attachment.mimeType || file.contentType)
      .header('Content-Length', String(file.data.byteLength))
      .header('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`)
      .send(Buffer.from(file.data));
  });

  app.delete('/api/attachments/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const me = (req.user as { handle: string }).handle;

    const attachment = await attachmentRepo.getAttachment(id);
    if (!attachment) return reply.status(404).send({ error: 'Not found' });

    const member = await projectRepo.getProjectUser(me, attachment.projectCode);
    if (!member?.permissions.editIssues) return reply.status(403).send({ error: 'Insufficient permissions' });

    const path = await attachmentRepo.deleteAttachment(id);
    if (path) {
      await getStorage().deleteFile(path);
    }

    return reply.status(204).send();
  });
}
