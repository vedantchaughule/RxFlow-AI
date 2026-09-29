import express, { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { asyncHandler } from '../../shared/async-handler.js';
import { findWebhookClinic, processWebhookPayload, verifyChallengeToken, verifySignature } from './webhook.service.js';

const router = Router();
router.use(rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }));
router.get('/:webhookKey', asyncHandler(async (req, res) => {
  const clinic = await findWebhookClinic(String(req.params.webhookKey)); const config = clinic?.whatsappConfig;
  const mode = String(req.query['hub.mode'] ?? ''); const token = String(req.query['hub.verify_token'] ?? ''); const challenge = String(req.query['hub.challenge'] ?? '');
  if (!clinic || !config?.encryptedVerifyToken || mode !== 'subscribe' || !challenge || !verifyChallengeToken(token, config.encryptedVerifyToken)) { res.status(403).send('Forbidden'); return; }
  res.status(200).type('text/plain').send(challenge);
}));
router.post('/:webhookKey', express.raw({ type: 'application/json', limit: '1mb' }), asyncHandler(async (req, res) => {
  const clinic = await findWebhookClinic(String(req.params.webhookKey)); const config = clinic?.whatsappConfig; const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!clinic || !config?.encryptedAppSecret || !verifySignature(raw, req.header('x-hub-signature-256'), config.encryptedAppSecret)) { res.status(401).json({ success: false, error: { code: 'INVALID_WEBHOOK_SIGNATURE', message: 'Invalid webhook signature' } }); return; }
  let payload: unknown; try { payload = JSON.parse(raw.toString('utf8')); } catch { res.status(400).json({ success: false, error: { code: 'MALFORMED_JSON', message: 'Request body contains malformed JSON' } }); return; }
  await processWebhookPayload(String(clinic._id), payload as never);
  res.status(200).json({ success: true });
}));
export default router;
