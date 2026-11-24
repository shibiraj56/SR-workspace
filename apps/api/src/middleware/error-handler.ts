import type { ErrorHandler, NotFoundHandler } from 'hono';
import { ZodError } from 'zod';
import { apiError, type ApiErrorDetail } from '../lib/response';
import type { HonoEnv } from '../types/context';

export const globalErrorHandler: ErrorHandler<HonoEnv> = (err, c) => {
  // Handle Zod Validation Errors
  if (err instanceof ZodError) {
    const details: ApiErrorDetail[] = err.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
      code: issue.code,
    }));
    return apiError(c, 'VALIDATION_ERROR', 'Request validation failed.', 400, details);
  }

  // Handle generic / unexpected exceptions
  const message = (err as any).message || String(err);
  const code = (err as any).code || 'INTERNAL_SERVER_ERROR';
  const status = (err as any).status || 500;

  console.error(`[ERROR_DETAIL] [${c.get('requestId') || 'unknown'}] code=${code} status=${status} msg=${message}`, err);

  return apiError(c, code, message, status);
};

export const notFoundHandler: NotFoundHandler<HonoEnv> = (c) => {
  return apiError(
    c,
    'ROUTE_NOT_FOUND',
    `The requested endpoint ${c.req.method} ${c.req.path} does not exist.`,
    404
  );
};
