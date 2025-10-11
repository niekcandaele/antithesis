import { z } from 'zod';
import { DTO } from '../../lib/DTO.js';

/**
 * Zod schema for creating an album
 *
 * Validates form data only (createdByUserId is added from session):
 * - name: Non-empty string
 * - description: Optional string
 * - coverPhotoUrl: Optional URL string (empty strings converted to null)
 * - status: Enum (draft, published, archived)
 */
export const CreateAlbumSchema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    description: z.preprocess(
      (val) => (val === '' || !val ? null : val),
      z.string().nullable().optional(),
    ),
    coverPhotoUrl: z.preprocess(
      (val) => (val === '' || !val ? null : val),
      z.string().url().nullable().optional(),
    ),
    status: z.enum(['draft', 'published', 'archived']).optional().default('draft'),
  })
  .openapi('CreateAlbum');

/**
 * DTO for creating an album
 */
export class CreateAlbumDTO extends DTO<typeof CreateAlbumSchema> {
  constructor(data?: z.input<typeof CreateAlbumSchema>) {
    super(CreateAlbumSchema, data);
  }
}

/**
 * Zod schema for updating an album
 *
 * All fields are optional for partial updates (empty strings converted to null)
 */
export const UpdateAlbumSchema = z
  .object({
    name: z.string().min(1, 'Name cannot be empty').optional(),
    description: z.preprocess(
      (val) => (val === '' || !val ? null : val),
      z.string().nullable().optional(),
    ),
    coverPhotoUrl: z.preprocess(
      (val) => (val === '' || !val ? null : val),
      z.string().url().nullable().optional(),
    ),
    status: z.enum(['draft', 'published', 'archived']).optional(),
  })
  .openapi('UpdateAlbum');

/**
 * DTO for updating an album
 */
export class UpdateAlbumDTO extends DTO<typeof UpdateAlbumSchema> {
  constructor(data?: z.input<typeof UpdateAlbumSchema>) {
    super(UpdateAlbumSchema, data);
  }
}

/**
 * Zod schema for album response
 */
export const AlbumResponseSchema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().uuid(),
    name: z.string(),
    description: z.string().nullable(),
    coverPhotoUrl: z.string().nullable(),
    status: z.string(),
    createdByUserId: z.string().uuid(),
    isDeleted: z.boolean(),
    deletedAt: z.string().datetime().nullable(),
    deletedByUserId: z.string().uuid().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi('AlbumResponse');

/**
 * DTO for album response
 */
export class AlbumResponseDTO extends DTO<typeof AlbumResponseSchema> {
  constructor(data?: z.input<typeof AlbumResponseSchema>) {
    super(AlbumResponseSchema, data);
  }
}

/**
 * Zod schema for list albums query parameters
 */
export const ListAlbumsQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
    sortBy: z.enum(['name', 'createdAt', 'updatedAt', 'status']).optional(),
    sortDirection: z.enum(['asc', 'desc']).optional(),
    search: z.string().optional(),
    status: z.enum(['draft', 'published', 'archived']).optional(),
    includeDeleted: z.coerce.boolean().optional().default(false),
  })
  .openapi('ListAlbumsQuery');

/**
 * DTO for list albums query parameters
 */
export class ListAlbumsQueryDTO extends DTO<typeof ListAlbumsQuerySchema> {
  constructor(data?: z.input<typeof ListAlbumsQuerySchema>) {
    super(ListAlbumsQuerySchema, data);
  }
}
