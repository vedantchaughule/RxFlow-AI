import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validation.js';
import { createTemplateSchema, updateTemplateSchema } from './template.schemas.js';
import * as templateController from './template.controller.js';

const router = Router();

router.use(requireAuth);
router.use(requireRole('doctor'));

router.get('/', templateController.handleListTemplates);
router.post('/', validateBody(createTemplateSchema), templateController.handleCreateTemplate);
router.patch('/:id', validateBody(updateTemplateSchema), templateController.handleUpdateTemplate);
router.delete('/:id', templateController.handleDeleteTemplate);

export default router;
