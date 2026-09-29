import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../shared/errors.js';

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (typeof error === 'object' && error !== null && 'type' in error) {
    if (error.type === 'entity.parse.failed') {
      res.status(400).json({ success: false, error: { code: 'MALFORMED_JSON', message: 'Request body contains malformed JSON' } });
      return;
    }
    if (error.type === 'entity.too.large') {
      res.status(413).json({ success: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds the allowed size' } });
      return;
    }
  }

  if (error instanceof ZodError) {
    const fields: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const key = issue.path.join('.') || 'request';
      fields[key] ??= [];
      fields[key].push(issue.message);
    }
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', fields } });
    return;
  }

  if (error instanceof AppError) {
    res.status(error.statusCode).json({ success: false, error: { code: error.code, message: error.message, ...(error.fields ? { fields: error.fields } : {}) } });
    return;
  }

  console.error('Unhandled request error:', error);
  res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
};
