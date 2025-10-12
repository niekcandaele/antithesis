/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { controller, get, post } from '../../lib/http/index.js';
import { requireAuth } from '../../lib/http/middleware/auth.middleware.js';
import { isHtmxRequest, htmxTrigger } from '../../lib/http/middleware/htmx.js';
import { albumsService } from '../../services/albums.service.js';
import { photosService } from '../../services/photos.service.js';
import { CreateAlbumDTO, UpdateAlbumDTO } from './albums.dto.js';
import { ZodError, type ZodIssue } from 'zod';
import type { Response } from 'express';
import { ValidationError } from '../../lib/http/errors.js';

/**
 * Format validation errors for user-friendly display
 */
function formatValidationErrors(error: unknown): string {
  // Handle ValidationError from DTO (wraps Zod errors)
  if (error instanceof ValidationError && error.details) {
    const issues = error.details as ZodIssue[];
    if (Array.isArray(issues)) {
      return issues.map((issue) => issue.message).join(', ');
    }
  }

  // Handle raw ZodError
  if (error instanceof ZodError) {
    return error.errors.map((err) => err.message).join(', ');
  }

  return error instanceof Error ? error.message : 'An error occurred';
}

/**
 * Render an EJS partial and send as response
 * Reduces Promise wrapper boilerplate
 */
async function renderPartial(res: Response, view: string, data: object): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    res.render(view, data, (err, html) => {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (err !== null && err !== undefined) {
        reject(err);
        return;
      }
      res.send(html);
      resolve();
    });
  });
}

/**
 * Web UI controller for Albums
 * Renders EJS pages for album management
 */
export const albumsWebController = controller('/albums').endpoints([
  /**
   * Albums list page - full page render
   */
  get('/', 'albumsListPage')
    .middleware(requireAuth)
    .renderView('pages/albums/list', async (_inputs, req) => {
      // Handle htmx requests separately - redirect to htmx endpoint
      if (isHtmxRequest(req)) {
        // This shouldn't happen as htmx requests should hit the fragments endpoint
        // But handle gracefully by returning empty data
        return { title: 'Albums', albums: [], filters: {} };
      }

      // Get query params for filtering, pagination, and search
      const status = req.query.status as string | undefined;
      const includeDeleted = req.query.includeDeleted === 'true';
      const page = parseInt(req.query.page as string) || 1;
      const searchQuery = (req.query.q as string) || '';
      const limit = 20; // Fixed limit for pagination

      const albums = await albumsService.getAllAlbums({
        page,
        limit,
        sortBy: 'createdAt',
        sortDirection: 'desc',
        filters: {
          ...(status && { status }),
          ...(!includeDeleted && { isDeleted: false }),
        },
        ...(searchQuery && { search: { name: searchQuery } }),
      });

      return {
        title: 'Albums',
        albums,
        currentTenantId: req.session.currentTenantId ?? null,
        filters: {
          status: status ?? null,
          includeDeleted,
        },
      };
    }),

  /**
   * Albums list fragments for htmx (pagination/search)
   */
  get('/fragments', 'albumsListFragments')
    .middleware(requireAuth)
    .handler(async (_inputs, req, res) => {
      // Get query params for filtering, pagination, and search
      const status = req.query.status as string | undefined;
      const includeDeleted = req.query.includeDeleted === 'true';
      const page = parseInt(req.query.page as string) || 1;
      const searchQuery = (req.query.q as string) || '';
      const limit = 20; // Fixed limit for pagination

      const albums = await albumsService.getAllAlbums({
        page,
        limit,
        sortBy: 'createdAt',
        sortDirection: 'desc',
        filters: {
          ...(status && { status }),
          ...(!includeDeleted && { isDeleted: false }),
        },
        ...(searchQuery && { search: { name: searchQuery } }),
      });

      // Render album items wrapped in columns for htmx requests
      const app = req.app;
      const fragmentsPromises = albums.map(async (album) => {
        return new Promise<string>((resolve, reject) => {
          app.render('partials/album-list-item', { album }, (err, html) => {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (err !== null && err !== undefined) {
              reject(err);
              return;
            }
            resolve(`<div class="column is-one-third">${html}</div>`);
          });
        });
      });

      const fragments = await Promise.all(fragmentsPromises);
      res.send(fragments.join(''));
      return;
    }),

  /**
   * Create album form page
   * IMPORTANT: This must come BEFORE /:id route to avoid matching /new as an ID
   */
  get('/new', 'createAlbumPage')
    .middleware(requireAuth)
    .renderView('pages/albums/form', (_inputs, req) => {
      return {
        title: 'Create Album',
        album: null,
        currentTenantId: req.session.currentTenantId ?? null,
      };
    }),

  /**
   * Edit album form page
   * IMPORTANT: This must come BEFORE /:id route to avoid matching /:id/edit incorrectly
   */
  get('/:id/edit', 'editAlbumPage')
    .middleware(requireAuth)
    .renderView('pages/albums/form', async (_inputs, req) => {
      const albumId = req.params.id;
      const album = await albumsService.getAlbumById(albumId);

      return {
        title: `Edit ${album.name}`,
        album,
        currentTenantId: req.session.currentTenantId ?? null,
      };
    }),

  /**
   * Album detail page with photos
   * IMPORTANT: This parameterized route must come AFTER specific routes like /new and /:id/edit
   */
  get('/:id', 'albumDetailPage')
    .middleware(requireAuth)
    .renderView('pages/albums/detail', async (_inputs, req) => {
      const albumId = req.params.id;

      const album = await albumsService.getAlbumByIdWithCreator(albumId);
      const photos = await photosService.getPhotosByAlbumId(albumId, {
        page: 1,
        limit: 100,
        sortBy: 'createdAt',
        sortDirection: 'desc',
        filters: {
          isDeleted: false,
        },
      });

      return {
        title: album.name,
        album,
        photos,
        currentTenantId: req.session.currentTenantId ?? null,
      };
    }),

  /**
   * Handle create album form submission
   * Supports htmx form submission with inline success/error messages
   */
  post('/', 'handleCreateAlbum')
    .middleware(requireAuth)
    .handler(async (_inputs, req, res) => {
      try {
        // Get user ID from session
        const createdByUserId = req.session.userId ?? 'system';

        const dto = new CreateAlbumDTO(req.body);

        const album = await albumsService.createAlbum({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...(dto.toJSON() as any),
          createdByUserId,
        });

        // Check if this is an htmx request
        if (isHtmxRequest(req)) {
          // Render success notification partial
          htmxTrigger(res, 'albumCreated');
          await renderPartial(res, 'partials/alert-success', {
            message: `Album "${album.name}" created successfully!`,
          });
          return;
        }

        res.redirect(`/albums/${album.id}`);
      } catch (error) {
        // Handle validation errors
        if (isHtmxRequest(req)) {
          // Return 422 status for validation errors (htmx configured to handle this)
          res.status(422);
          await renderPartial(res, 'partials/alert-error', {
            message: formatValidationErrors(error),
          });
          return;
        }
        throw error;
      }
    }),

  /**
   * Handle update album form submission
   * Supports htmx form submission with inline success/error messages
   */
  post('/:id', 'handleUpdateAlbum')
    .middleware(requireAuth)
    .handler(async (_inputs, req, res) => {
      try {
        const albumId = req.params.id;
        const dto = new UpdateAlbumDTO(req.body);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const album = await albumsService.updateAlbum(albumId, dto.toJSON() as any);

        // Check if this is an htmx request
        if (isHtmxRequest(req)) {
          // Render success notification partial
          htmxTrigger(res, 'albumUpdated');
          await renderPartial(res, 'partials/alert-success', {
            message: `Album "${album.name}" updated successfully!`,
          });
          return;
        }

        res.redirect(`/albums/${albumId}`);
      } catch (error) {
        // Handle validation errors
        if (isHtmxRequest(req)) {
          // Return 422 status for validation errors (htmx configured to handle this)
          res.status(422);
          await renderPartial(res, 'partials/alert-error', {
            message: formatValidationErrors(error),
          });
          return;
        }
        throw error;
      }
    }),

  /**
   * Handle delete album
   */
  post('/:id/delete', 'handleDeleteAlbum')
    .middleware(requireAuth)
    .handler(async (_inputs, req, res) => {
      const albumId = req.params.id;

      // TODO: Get actual user ID from session
      const userId = req.session.userId ?? 'system';

      await albumsService.softDeleteAlbum(albumId, userId);

      res.redirect('/albums');
    }),
]);
