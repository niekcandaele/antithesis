import { z } from 'zod';
import { controller, get, post, put, del, apiResponse, zApiOutput } from '../../lib/http/index.js';
import { photosService } from '../../services/photos.service.js';
import {
  CreatePhotoSchema,
  UpdatePhotoSchema,
  PhotoResponseSchema,
  ListPhotosQuerySchema,
} from './photos.dto.js';

/**
 * Photos controller
 *
 * Provides REST API endpoints for photo management.
 * All operations are automatically scoped to the current tenant via TenantAwareRepository.
 */
export const photosController = controller('photos')
  .description('Photo management endpoints')
  .endpoints([
    /**
     * List all photos for current tenant with pagination and filtering
     */
    get('/', 'listPhotos')
      .description('List all photos for the current tenant with pagination and filtering')
      .input(
        z
          .object({
            query: ListPhotosQuerySchema,
          })
          .openapi('ListPhotosInput'),
      )
      .response(zApiOutput(z.array(PhotoResponseSchema).openapi('PhotoList')))
      .handler(async (inputs) => {
        const { page, limit, sortBy, sortDirection, search, albumId, status, includeDeleted } =
          inputs.query;

        const photos = await photosService.getAllPhotos({
          page: page ?? 1,
          limit: limit ?? 50,
          sortBy: sortBy ?? 'createdAt',
          sortDirection: sortDirection ?? 'desc',
          search: search ? { title: search } : undefined,
          filters: {
            ...(albumId && { albumId }),
            ...(status && { status }),
            ...(!includeDeleted && { isDeleted: false }),
          },
        });

        return apiResponse(photos);
      }),

    /**
     * Get a single photo by ID
     */
    get('/:id', 'getPhoto')
      .description('Get a single photo for the current tenant')
      .input(
        z
          .object({
            params: z
              .object({
                id: z.string().uuid('Invalid photo ID'),
              })
              .openapi('GetPhotoParams'),
          })
          .openapi('GetPhotoInput'),
      )
      .response(zApiOutput(PhotoResponseSchema))
      .handler(async (inputs) => {
        const photo = await photosService.getPhotoById(inputs.params.id);
        return apiResponse(photo);
      }),

    /**
     * Create a new photo
     */
    post('/', 'createPhoto')
      .description('Create a new photo for the current tenant')
      .input(
        z
          .object({
            body: CreatePhotoSchema,
          })
          .openapi('CreatePhotoInput'),
      )
      .response(zApiOutput(PhotoResponseSchema))
      .handler(async (inputs, req) => {
        // Get createdByUserId from session
        const createdByUserId = req.session.userId ?? 'system';
        const photo = await photosService.createPhoto({
          ...inputs.body,
          createdByUserId,
        });
        return apiResponse(photo);
      }),

    /**
     * Update a photo by ID
     */
    put('/:id', 'updatePhoto')
      .description('Update a photo for the current tenant')
      .input(
        z
          .object({
            params: z
              .object({
                id: z.string().uuid('Invalid photo ID'),
              })
              .openapi('UpdatePhotoParams'),
            body: UpdatePhotoSchema,
          })
          .openapi('UpdatePhotoInput'),
      )
      .response(zApiOutput(PhotoResponseSchema))
      .handler(async (inputs) => {
        const photo = await photosService.updatePhoto(inputs.params.id, inputs.body);
        return apiResponse(photo);
      }),

    /**
     * Soft delete a photo by ID
     */
    del('/:id', 'deletePhoto')
      .description('Soft delete a photo for the current tenant')
      .input(
        z
          .object({
            params: z
              .object({
                id: z.string().uuid('Invalid photo ID'),
              })
              .openapi('DeletePhotoParams'),
          })
          .openapi('DeletePhotoInput'),
      )
      .response(zApiOutput(z.object({}).openapi('DeletePhotoData')))
      .handler(async (inputs) => {
        // TODO: Get actual user ID from auth context
        const userId = 'system';
        await photosService.softDeletePhoto(inputs.params.id, userId);
        return apiResponse({});
      }),

    /**
     * Restore a soft-deleted photo by ID
     */
    post('/:id/restore', 'restorePhoto')
      .description('Restore a soft-deleted photo for the current tenant')
      .input(
        z
          .object({
            params: z
              .object({
                id: z.string().uuid('Invalid photo ID'),
              })
              .openapi('RestorePhotoParams'),
          })
          .openapi('RestorePhotoInput'),
      )
      .response(zApiOutput(PhotoResponseSchema))
      .handler(async (inputs) => {
        const photo = await photosService.restorePhoto(inputs.params.id);
        return apiResponse(photo);
      }),
  ]);

/**
 * Nested controller for photos under albums
 * Routes: /albums/:albumId/photos
 */
export const albumPhotosController = controller('albums/:albumId/photos')
  .description('Album photos management endpoints')
  .endpoints([
    /**
     * List photos for a specific album
     */
    get('/', 'listAlbumPhotos')
      .description('Get all photos in a specific album for the current tenant')
      .input(
        z
          .object({
            params: z
              .object({
                albumId: z.string().uuid('Invalid album ID'),
              })
              .openapi('ListAlbumPhotosParams'),
            query: ListPhotosQuerySchema,
          })
          .openapi('ListAlbumPhotosInput'),
      )
      .response(zApiOutput(z.array(PhotoResponseSchema).openapi('AlbumPhotoList')))
      .handler(async (inputs) => {
        const { page, limit, sortBy, sortDirection, search, status, includeDeleted } = inputs.query;

        const photos = await photosService.getPhotosByAlbumId(inputs.params.albumId, {
          page: page ?? 1,
          limit: limit ?? 50,
          sortBy: sortBy ?? 'createdAt',
          sortDirection: sortDirection ?? 'desc',
          search: search ? { title: search } : undefined,
          filters: {
            ...(status && { status }),
            ...(!includeDeleted && { isDeleted: false }),
          },
        });

        return apiResponse(photos);
      }),

    /**
     * Create a new photo in a specific album
     */
    post('/', 'createAlbumPhoto')
      .description('Create a new photo in a specific album for the current tenant')
      .input(
        z
          .object({
            params: z
              .object({
                albumId: z.string().uuid('Invalid album ID'),
              })
              .openapi('CreateAlbumPhotoParams'),
            body: CreatePhotoSchema,
          })
          .openapi('CreateAlbumPhotoInput'),
      )
      .response(zApiOutput(PhotoResponseSchema))
      .handler(async (inputs, req) => {
        // Get createdByUserId from session
        const createdByUserId = req.session.userId ?? 'system';
        // Merge albumId from route params with body
        const photo = await photosService.createPhoto({
          ...inputs.body,
          albumId: inputs.params.albumId,
          createdByUserId,
        });
        return apiResponse(photo);
      }),
  ]);
