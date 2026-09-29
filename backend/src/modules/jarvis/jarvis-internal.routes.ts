import express, { Router } from 'express';
import { validateBody } from '../../middleware/validation.js';
import { asyncHandler } from '../../shared/async-handler.js';
import { requireJarvisInternal } from './jarvis-internal-auth.js';
import { internalToolBodySchema } from './jarvis.schemas.js';
import * as service from './jarvis.service.js';

const router = Router();
router.use(express.json({ limit: '32kb', verify: (req, _res, buffer) => { (req as express.Request).rawBody = Buffer.from(buffer); } }));
router.post('/tools/execute', requireJarvisInternal, validateBody(internalToolBodySchema), asyncHandler(async (req, res) => {
  const data = await service.executeTool(req.body);
  res.json({ success: true, data });
}));
export default router;
