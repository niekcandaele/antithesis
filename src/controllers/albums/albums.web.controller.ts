/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { controller, get, post } from '../../lib/http/index.js';
import { requireAuth } from '../../lib/http/middleware/auth.middleware.js';
import { albumsService } from '../../services/albums.service.js';
import { photosService } from '../../services/photos.service.js';
import { CreateAlbumDTO, UpdateAlbumDTO } from './albums.dto.js';

/**
 * Web UI controller for Albums
 * Renders EJS pages for album management
 */
export const albumsWebController = controller('/albums').endpoints([
  /**
   * Albums list page
   */
  get('/', 'albumsListPage')
    .middleware(requireAuth)
    .renderView('pages/albums/list', async (_inputs, req) => {
      // Get query params for filtering
      const status = req.query.status as string | undefined;
      const includeDeleted = req.query.includeDeleted === 'true';

      const albums = await albumsService.getAllAlbums({
        page: 1,
        limit: 100,
        sortBy: 'createdAt',
        sortDirection: 'desc',
        filters: {
          ...(status && { status }),
          ...(!includeDeleted && { isDeleted: false }),
        },
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
   */
  post('/', 'handleCreateAlbum')
    .middleware(requireAuth)
    .handler(async (_inputs, req, res) => {
      // Get user ID from session
      const createdByUserId = req.session.userId ?? 'system';

      const dto = new CreateAlbumDTO(req.body);

      const album = await albumsService.createAlbum({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(dto.toJSON() as any),
        createdByUserId,
      });

      res.redirect(`/albums/${album.id}`);
    }),

  /**
   * Handle update album form submission
   */
  post('/:id', 'handleUpdateAlbum')
    .middleware(requireAuth)
    .handler(async (_inputs, req, res) => {
      const albumId = req.params.id;
      const dto = new UpdateAlbumDTO(req.body);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await albumsService.updateAlbum(albumId, dto.toJSON() as any);

      res.redirect(`/albums/${albumId}`);
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
