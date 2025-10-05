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

/**
 * Extended album response with photos
 */
const AlbumWithPhotosSchema = AlbumResponseSchema.extend({
  photos: z.array(PhotoResponseSchema),
});

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
        z.object({
          query: ListAlbumsQuerySchema,
        }),
      )
      .response(zApiOutput(z.array(AlbumResponseSchema)))
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
        z.object({
          params: z.object({
            id: z.string().uuid('Invalid album ID'),
          }),
        }),
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
        z.object({
          body: CreateAlbumSchema,
        }),
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
        z.object({
          params: z.object({
            id: z.string().uuid('Invalid album ID'),
          }),
          body: UpdateAlbumSchema,
        }),
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
        z.object({
          params: z.object({
            id: z.string().uuid('Invalid album ID'),
          }),
        }),
      )
      .response(z.void())
      .handler(async (inputs) => {
        // TODO: Get actual user ID from auth context
        const userId = 'system';
        await albumsService.softDeleteAlbum(inputs.params.id, userId);
      }),

    /**
     * Restore a soft-deleted album by ID
     */
    post('/:id/restore', 'restoreAlbum')
      .description('Restore a soft-deleted album for the current tenant')
      .input(
        z.object({
          params: z.object({
            id: z.string().uuid('Invalid album ID'),
          }),
        }),
      )
      .response(zApiOutput(AlbumResponseSchema))
      .handler(async (inputs) => {
        const album = await albumsService.restoreAlbum(inputs.params.id);
        return apiResponse(album);
      }),
  ]);
