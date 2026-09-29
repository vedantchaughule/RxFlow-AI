import { Types } from 'mongoose';
import { PrescriptionTemplate } from './template.model.js';
import type { z } from 'zod';
import type { createTemplateSchema, updateTemplateSchema } from './template.schemas.js';

export async function listTemplates(clinicId: string, doctorId: string) {
  return PrescriptionTemplate.find({
    clinicId: new Types.ObjectId(clinicId),
    doctorId: new Types.ObjectId(doctorId),
  }).sort({ title: 1 }).lean();
}

export async function createTemplate(
  clinicId: string,
  doctorId: string,
  payload: z.infer<typeof createTemplateSchema>
) {
  const existing = await PrescriptionTemplate.findOne({
    clinicId: new Types.ObjectId(clinicId),
    doctorId: new Types.ObjectId(doctorId),
    title: payload.title,
  });

  if (existing) {
    const error = new Error('Template with this title already exists') as any;
    error.statusCode = 409;
    error.code = 'CONFLICT';
    throw error;
  }

  const template = new PrescriptionTemplate({
    clinicId: new Types.ObjectId(clinicId),
    doctorId: new Types.ObjectId(doctorId),
    ...payload,
  });

  return template.save();
}

export async function updateTemplate(
  clinicId: string,
  doctorId: string,
  templateId: string,
  payload: z.infer<typeof updateTemplateSchema>
) {
  const template = await PrescriptionTemplate.findOne({
    _id: new Types.ObjectId(templateId),
    clinicId: new Types.ObjectId(clinicId),
    doctorId: new Types.ObjectId(doctorId),
  });

  if (!template) {
    const error = new Error('Prescription template not found') as any;
    error.statusCode = 404;
    error.code = 'NOT_FOUND';
    throw error;
  }

  if (payload.title && payload.title !== template.title) {
    const conflict = await PrescriptionTemplate.findOne({
      clinicId: new Types.ObjectId(clinicId),
      doctorId: new Types.ObjectId(doctorId),
      title: payload.title,
      _id: { $ne: template._id },
    });
    if (conflict) {
      const error = new Error('Template with this title already exists') as any;
      error.statusCode = 409;
      error.code = 'CONFLICT';
      throw error;
    }
  }

  Object.assign(template, payload);
  return template.save();
}

export async function deleteTemplate(clinicId: string, doctorId: string, templateId: string) {
  const result = await PrescriptionTemplate.deleteOne({
    _id: new Types.ObjectId(templateId),
    clinicId: new Types.ObjectId(clinicId),
    doctorId: new Types.ObjectId(doctorId),
  });

  if (result.deletedCount === 0) {
    const error = new Error('Prescription template not found') as any;
    error.statusCode = 404;
    error.code = 'NOT_FOUND';
    throw error;
  }

  return { success: true };
}
