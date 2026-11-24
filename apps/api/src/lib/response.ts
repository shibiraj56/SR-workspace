import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { HonoEnv } from '../types/context';

export interface ApiResponseMeta {
  requestId?: string;
  timestamp: number;
  [key: string]: any;
}

export interface ApiSuccessResponse<T = any> {
  success: true;
  data: T;
  meta: ApiResponseMeta;
}

export interface ApiErrorDetail {
  field?: string;
  message: string;
  code?: string;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: ApiErrorDetail[] | null;
  };
  meta: ApiResponseMeta;
}

export function apiSuccess<T = any>(
  c: Context<HonoEnv>,
  data: T,
  status: ContentfulStatusCode = 200,
  extraMeta?: Record<string, any>
) {
  const requestId = c.get('requestId') || c.req.header('x-request-id') || 'unknown';
  const responsePayload: ApiSuccessResponse<T> = {
    success: true,
    data,
    meta: {
      requestId,
      timestamp: Date.now(),
      ...extraMeta,
    },
  };
  return c.json(responsePayload, status);
}

export function apiError(
  c: Context<HonoEnv>,
  code: string,
  message: string,
  status: ContentfulStatusCode = 400,
  details: ApiErrorDetail[] | null = null
) {
  const requestId = c.get('requestId') || c.req.header('x-request-id') || 'unknown';
  const responsePayload: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
      details,
    },
    meta: {
      requestId,
      timestamp: Date.now(),
    },
  };
  return c.json(responsePayload, status);
}
