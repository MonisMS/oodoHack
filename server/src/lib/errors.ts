import { DomainError } from './domain/errors.js';
import type { ErrorRequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
export class AppError extends Error {
  constructor(public status: number, public code: string, message: string, public fields?: Record<string, string[]>) { super(message); }
}
export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (error instanceof ZodError) {
    const fields: Record<string, string[]> = {};
    for (const issue of error.issues) (fields[issue.path.join('.') || '_form'] ??= []).push(issue.message);
    res.status(422).json({ error: { code: 'VALIDATION_ERROR', message: 'Check the submitted fields', fields } }); return;
  }
  if (error instanceof DomainError) {
    const status = ['INVALID_TRANSITION','BILLING_BACKLOG','SCHEDULE_RECONCILIATION_REQUIRED','DISCOUNT_RESERVATION_CONFLICT'].includes(error.code) ? 409 : 422;
    res.status(status).json({ error: { code: error.code, message: error.message } }); return;
  }
  if (error instanceof AppError) { res.status(error.status).json({ error: { code: error.code, message: error.message, ...(error.fields ? { fields: error.fields } : {}) } }); return; }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') { res.status(409).json({ error: { code: 'CONFLICT', message: 'A unique value already exists' } }); return; }
    if (error.code === 'P2025') { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Record not found' } }); return; }
    if (error.code === 'P2003') { res.status(409).json({ error: { code: 'RELATION_CONFLICT', message: 'A related record prevents this operation' } }); return; }
  }
  if (error instanceof SyntaxError && 'body' in error) { res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON' } }); return; }
  if (typeof error === 'object' && error && 'type' in error && error.type === 'entity.too.large') { res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' } }); return; }
  console.error(error);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
};
