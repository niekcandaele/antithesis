import { z } from 'zod';
import { DTO } from '../../lib/DTO.js';

/**
 * Zod schema for creating a photo
 *
 * Validates form data only (createdByUserId is added from session):
 * - albumId: UUID string (from hidden input or explicit selection)
 * - title: Non-empty string
 * - description: Optional string (empty strings converted to null)
 * - url: Valid URL string
 * - thumbnailUrl: Optional URL string (empty strings converted to null)
 * - status: Enum (draft, published, archived)
 */
export const CreatePhotoSchema = z.object({
  albumId: z.string().uuid('Album ID must be a valid UUID'),
  title: z.string().min(1, 'Title is required'),
  description: z.preprocess(
    (val) => (val === '' || !val ? null : val),
    z.string().nullable().optional(),
  ),
  url: z.string().url('Must be a valid URL'),
  thumbnailUrl: z.preprocess(
    (val) => (val === '' || !val ? null : val),
    z.string().url().nullable().optional(),
  ),
  status: z.enum(['draft', 'published', 'archived']).optional().default('draft'),
});

/**
 * DTO for creating a photo
 */
export class CreatePhotoDTO extends DTO<typeof CreatePhotoSchema> {
  constructor(data?: z.input<typeof CreatePhotoSchema>) {
    super(CreatePhotoSchema, data);
  }
}

/**
 * Zod schema for updating a photo
 *
 * All fields are optional for partial updates (empty strings converted to null)
 * Note: albumId is intentionally excluded - photos shouldn't move between albums
 */
export const UpdatePhotoSchema = z.object({
  title: z.string().min(1, 'Title cannot be empty').optional(),
  description: z.preprocess(
    (val) => (val === '' || !val ? null : val),
    z.string().nullable().optional(),
  ),
  url: z.string().url('Must be a valid URL').optional(),
  thumbnailUrl: z.preprocess(
    (val) => (val === '' || !val ? null : val),
    z.string().url().nullable().optional(),
  ),
  status: z.enum(['draft', 'published', 'archived']).optional(),
});

/**
 * DTO for updating a photo
 */
export class UpdatePhotoDTO extends DTO<typeof UpdatePhotoSchema> {
  constructor(data?: z.input<typeof UpdatePhotoSchema>) {
    super(UpdatePhotoSchema, data);
  }
}

/**
 * Zod schema for photo response
 */
export const PhotoResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  albumId: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  url: z.string(),
  thumbnailUrl: z.string().nullable(),
  status: z.string(),
  createdByUserId: z.string().uuid(),
  isDeleted: z.boolean(),
  deletedAt: z.string().datetime().nullable(),
  deletedByUserId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

/**
 * DTO for photo response
 */
export class PhotoResponseDTO extends DTO<typeof PhotoResponseSchema> {
  constructor(data?: z.input<typeof PhotoResponseSchema>) {
    super(PhotoResponseSchema, data);
  }
}

/**
 * Zod schema for list photos query parameters
 */
export const ListPhotosQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  sortBy: z.enum(['title', 'createdAt', 'updatedAt', 'status']).optional(),
  sortDirection: z.enum(['asc', 'desc']).optional(),
  search: z.string().optional(),
  albumId: z.string().uuid('Album ID must be a valid UUID').optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  includeDeleted: z.coerce.boolean().optional().default(false),
});

/**
 * DTO for list photos query parameters
 */
export class ListPhotosQueryDTO extends DTO<typeof ListPhotosQuerySchema> {
  constructor(data?: z.input<typeof ListPhotosQuerySchema>) {
    super(ListPhotosQuerySchema, data);
  }
}
