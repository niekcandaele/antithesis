import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

import * as errors from './errors.js';

// Extend Zod with OpenAPI support
extendZodWithOpenApi(z);

interface IApiResponseOptions {
  error?: Error | errors.HttpError;
  meta?: Record<string, string | number>;
}

export function apiResponse<DataType = unknown>(data: DataType, opts?: IApiResponseOptions) {
  if (opts?.error != null) {
    const errorDetails = {
      code: opts.error.name,
      message: opts.error.message,
      details: 'details' in opts.error && opts.error.details != null ? opts.error.details : {},
    };

    return {
      meta: {
        serverTime: new Date().toISOString(),
        error: errorDetails,
        ...opts.meta,
      },
      data,
    };
  }

  return {
    meta: {
      serverTime: new Date().toISOString(),
      ...opts?.meta,
    },
    data,
  };
}

const zErrorOutput = z
  .object({
    code: z.string(),
    details: z.any(),
  })
  .openapi('ApiError');

const zMetaDataOutput = z
  .object({
    serverTime: z.string().datetime(),
    error: zErrorOutput.optional(),
  })
  .openapi('ApiMeta');

/**
 * Schema wrapper for a default api output schema
 *
 * @example
 * ```ts
 * zApiOutput(
 *   z.object({
 *     greeting: z.string()
 *   })
 * )
 * ```
 * @returns
 * ```ts
 * z.object({
 *   meta: z.object({
 *     serverTime: z.string().datetime(),
 *     ...
 *   }),
 *   data: z.object({
 *     greeting: z.string()
 *   })
 * })
 * ```
 */
export const zApiOutput = <OutputSchema extends z.ZodSchema>(dataSchema: OutputSchema) =>
  z
    .object({
      meta: zMetaDataOutput,
      data: dataSchema,
    })
    .openapi('ApiResponse');

// @ts-expect-error - keep for reference but not actively used
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _zGenericApiOutput = zApiOutput(z.any());
