import { z } from 'zod';
import { controller, get, post, put, del, apiResponse, zApiOutput } from '../../lib/http/index.js';
import { albumsService } from '../../services/albums.service.js';
import { photosService } from '../../services/photos.service.js';
import {
  CreateAlbumSchema,
  UpdateAlbumSchema,
  AlbumResponseSchema,
  ListAlbumsQuerySchema,
} from './albums.dto.js';
import { PhotoResponseSchema } from '../photos/photos.dto.js';

// System user ID for operations without authenticated user context
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Extended album response with photos
 */
const AlbumWithPhotosSchema = z
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
    photos: z.array(PhotoResponseSchema).openapi('AlbumPhotoArray'),
  })
  .openapi('AlbumWithPhotos');

/**
 * Albums controller
 *
 * Provides REST API endpoints for album management.
 * All operations are automatically scoped to the current tenant via TenantAwareRepository.
 */
export const albumsController = controller('albums')
  .description('Album management endpoints')
  .endpoints([
    /**
     * List all albums for current tenant with pagination and filtering
     */
    get('/', 'listAlbums')
      .description('List all albums for the current tenant with pagination and filtering')
      .input(
        z
          .object({
            query: ListAlbumsQuerySchema,
          })
          .openapi('ListAlbumsInput'),
      )
      .response(zApiOutput(z.array(AlbumResponseSchema).openapi('AlbumList')))
      .handler(async (inputs) => {
        const { page, limit, sortBy, sortDirection, search, status, includeDeleted } = inputs.query;

        const albums = await albumsService.getAllAlbums({
          page: page ?? 1,
          limit: limit ?? 20,
          sortBy: sortBy ?? 'createdAt',
          sortDirection: sortDirection ?? 'desc',
          search: search ? { name: search } : undefined,
          filters: {
            ...(status && { status }),
            ...(!includeDeleted && { isDeleted: false }),
          },
        });

        return apiResponse(albums);
      }),

    /**
     * Get a single album by ID with photos
     */
    get('/:id', 'getAlbum')
      .description('Get a single album for the current tenant with photos')
      .input(
        z
          .object({
            params: z
              .object({
                id: z.string().uuid('Invalid album ID'),
              })
              .openapi('GetAlbumParams'),
          })
          .openapi('GetAlbumInput'),
      )
      .response(zApiOutput(AlbumWithPhotosSchema))
      .handler(async (inputs) => {
        const album = await albumsService.getAlbumById(inputs.params.id);
        const photos = await photosService.getPhotosByAlbumId(inputs.params.id);

        return apiResponse({
          ...album,
          photos,
        });
      }),

    /**
     * Create a new album
     */
    post('/', 'createAlbum')
      .description('Create a new album for the current tenant')
      .input(
        z
          .object({
            body: CreateAlbumSchema,
          })
          .openapi('CreateAlbumInput'),
      )
      .response(zApiOutput(AlbumResponseSchema))
      .handler(async (inputs, req) => {
        // Get createdByUserId from session
        const createdByUserId = req.session.userId ?? 'system';
        const album = await albumsService.createAlbum({
          ...inputs.body,
          createdByUserId,
        });
        return apiResponse(album);
      }),

    /**
     * Update an album by ID
     */
    put('/:id', 'updateAlbum')
      .description('Update an album for the current tenant')
      .input(
        z
          .object({
            params: z
              .object({
                id: z.string().uuid('Invalid album ID'),
              })
              .openapi('UpdateAlbumParams'),
            body: UpdateAlbumSchema,
          })
          .openapi('UpdateAlbumInput'),
      )
      .response(zApiOutput(AlbumResponseSchema))
      .handler(async (inputs) => {
        const album = await albumsService.updateAlbum(inputs.params.id, inputs.body);
        return apiResponse(album);
      }),

    /**
     * Soft delete an album by ID
     */
    del('/:id', 'deleteAlbum')
      .description('Soft delete an album for the current tenant')
      .input(
        z
          .object({
            params: z
              .object({
                id: z.string().uuid('Invalid album ID'),
              })
              .openapi('DeleteAlbumParams'),
          })
          .openapi('DeleteAlbumInput'),
      )
      .response(zApiOutput(z.object({}).openapi('DeleteAlbumData')))
      .handler(async (inputs) => {
        // TODO: Extract userId from JWT token or session when auth is fully implemented
        // For now, use SYSTEM_USER_ID - RLS still enforces tenant isolation on the DELETE
        const userId = SYSTEM_USER_ID;
        await albumsService.softDeleteAlbum(inputs.params.id, userId);
        return apiResponse({});
      }),

    /**
     * Restore a soft-deleted album by ID
     */
    post('/:id/restore', 'restoreAlbum')
      .description('Restore a soft-deleted album for the current tenant')
      .input(
        z
          .object({
            params: z
              .object({
                id: z.string().uuid('Invalid album ID'),
              })
              .openapi('RestoreAlbumParams'),
          })
          .openapi('RestoreAlbumInput'),
      )
      .response(zApiOutput(AlbumResponseSchema))
      .handler(async (inputs) => {
        const album = await albumsService.restoreAlbum(inputs.params.id);
        return apiResponse(album);
      }),
  ]);
