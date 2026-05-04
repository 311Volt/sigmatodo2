import type { FastifyInstance } from 'fastify';
import * as invitationRepo from '../repositories/invitationRepo';

export async function invitationRoutes(app: FastifyInstance) {
  app.get('/api/invitations/:code', async (req, reply) => {
    const { code } = req.params as { code: string };
    const details = await invitationRepo.getInvitationDetails(code);
    if (!details) return reply.status(404).send({ error: 'Invitation not found' });
    if (details.acceptedOn) return reply.status(410).send({ error: 'Invitation already used' });
    if (details.expiresAt && new Date(details.expiresAt) < new Date()) {
      return reply.status(410).send({ error: 'Invitation expired' });
    }
    return reply.send(details);
  });

  app.post('/api/invitations/:code/accept', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { code } = req.params as { code: string };
    const me = (req.user as { handle: string }).handle;

    const result = await invitationRepo.acceptInvitation(code, me);
    if (!result.ok) {
      const status = result.error === 'Invitation not found' ? 404
        : result.error === 'Invitation not for you' ? 403
        : 410;
      return reply.status(status).send({ error: result.error });
    }
    return reply.send({ ok: true });
  });
}
