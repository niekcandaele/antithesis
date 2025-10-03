export { HTTP } from './app.js';
export {
  endpoint,
  type Method,
  get,
  put,
  post,
  del,
  methods,
  type InputValidationSchema,
  type ResponseValidationSchema,
} from './endpoint.js';

export { controller } from './controller.js';

export * from './middleware.js';

export { apiResponse, zApiOutput } from './apiResponse.js';
export { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

export type { Request, Response, NextFunction } from 'express';

export * from './serverContext.js';
export * from './errors.js';

// Core infrastructure exports

/**
 * Data Transfer Object base class with Zod validation
 *
 * @see {@link ../DTO.ts} for implementation
 */
export { DTO } from '../DTO.js';

/**
 * Base class for tenant-scoped services with automatic logging metadata
 *
 * @see {@link ../TenantScoped.ts} for implementation
 */
export { TenantScoped } from '../TenantScoped.js';

/**
 * TenantId branded type and type guard for type-safe tenant identification
 *
 * @see {@link ../types.ts} for implementation
 */
export { type TenantId, isTenantId } from '../types.js';

/**
 * Health check singleton for liveness and readiness probes
 *
 * @see {@link ../health.ts} for implementation
 */
export { health } from '../health.js';
