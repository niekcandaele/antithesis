import { z } from 'zod';
import { DTO } from '../../lib/DTO.js';

/**
 * Zod schema for creating a tenant
 *
 * Validates:
 * - name: Non-empty string
 * - slug: Lowercase alphanumeric with hyphens, no leading/trailing hyphens
 * - externalReferenceId: Optional string
 */
export const CreateTenantSchema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    slug: z
      .string()
      .min(1, 'Slug is required')
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens'),
    externalReferenceId: z.string().optional().nullable(),
  })
  .openapi('CreateTenant');

/**
 * DTO for creating a tenant
 */
export class CreateTenantDTO extends DTO<typeof CreateTenantSchema> {
  name!: string;
  slug!: string;
  externalReferenceId?: string | null;

  constructor(data?: z.input<typeof CreateTenantSchema>) {
    super(CreateTenantSchema, data);
  }
}

/**
 * Zod schema for updating a tenant
 *
 * All fields are optional for partial updates
 */
export const UpdateTenantSchema = z
  .object({
    name: z.string().min(1, 'Name cannot be empty').optional(),
    slug: z
      .string()
      .min(1, 'Slug cannot be empty')
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens')
      .optional(),
    externalReferenceId: z.string().optional().nullable(),
  })
  .openapi('UpdateTenant');

/**
 * DTO for updating a tenant
 */
export class UpdateTenantDTO extends DTO<typeof UpdateTenantSchema> {
  name?: string;
  slug?: string;
  externalReferenceId?: string | null;

  constructor(data?: z.input<typeof UpdateTenantSchema>) {
    super(UpdateTenantSchema, data);
  }
}

/**
 * Zod schema for tenant response
 */
export const TenantResponseSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
    externalReferenceId: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi('TenantResponse');

/**
 * DTO for tenant response
 */
export class TenantResponseDTO extends DTO<typeof TenantResponseSchema> {
  id!: string;
  name!: string;
  slug!: string;
  externalReferenceId!: string | null;
  createdAt!: string;
  updatedAt!: string;

  constructor(data?: z.input<typeof TenantResponseSchema>) {
    super(TenantResponseSchema, data);
  }
}

/**
 * Zod schema for list tenants query parameters
 */
export const ListTenantsQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
    sortBy: z.enum(['name', 'slug', 'createdAt', 'updatedAt']).optional(),
    sortDirection: z.enum(['asc', 'desc']).optional(),
    search: z.string().optional(),
  })
  .openapi('ListTenantsQuery');
