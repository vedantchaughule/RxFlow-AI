import type { Request, Response } from 'express';
import * as templateService from './template.service.js';

export async function handleListTemplates(req: Request, res: Response) {
  const templates = await templateService.listTemplates(req.auth!.clinicId, req.auth!.userId);
  res.json({ success: true, data: { templates } });
}

export async function handleCreateTemplate(req: Request, res: Response) {
  const template = await templateService.createTemplate(req.auth!.clinicId, req.auth!.userId, req.body);
  res.status(201).json({ success: true, data: { template } });
}

export async function handleUpdateTemplate(req: Request, res: Response) {
  const template = await templateService.updateTemplate(
    req.auth!.clinicId,
    req.auth!.userId,
    req.params.id as string,
    req.body
  );
  res.json({ success: true, data: { template } });
}

export async function handleDeleteTemplate(req: Request, res: Response) {
  await templateService.deleteTemplate(req.auth!.clinicId, req.auth!.userId, req.params.id as string);
  res.json({ success: true, data: { message: 'Template deleted' } });
}
