/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { controller, get, post } from '../../lib/http/index.js';
import { requireAuth } from '../../lib/http/middleware/auth.middleware.js';
import { photosService } from '../../services/photos.service.js';
import { CreatePhotoDTO, UpdatePhotoDTO } from './photos.dto.js';

/**
 * Web UI controller for Photos
 * Renders EJS pages for photo management
 */
export const photosWebController = controller('/photos').endpoints([
  /**
   * Create photo form page (with albumId in query)
   */
  get('/new', 'createPhotoPage')
    .middleware(requireAuth)
    .renderView('pages/photos/form', (_inputs, req) => {
      const albumId = req.query.albumId as string | undefined;

      return {
        title: 'Add Photo',
        photo: null,
        albumId: albumId ?? null,
        currentTenantId: req.session.currentTenantId ?? null,
      };
    }),

  /**
   * Edit photo form page
   */
  get('/:id/edit', 'editPhotoPage')
    .middleware(requireAuth)
    .renderView('pages/photos/form', async (_inputs, req) => {
      const photoId = req.params.id;
      const photo = await photosService.getPhotoById(photoId);

      return {
        title: `Edit ${photo.title}`,
        photo,
        albumId: photo.albumId,
        currentTenantId: req.session.currentTenantId ?? null,
      };
    }),

  /**
   * Handle create photo form submission
   */
  post('/', 'handleCreatePhoto')
    .middleware(requireAuth)
    .handler(async (_inputs, req, res) => {
      // Get user ID from session
      const createdByUserId = req.session.userId ?? 'system';

      const dto = new CreatePhotoDTO(req.body);

      const photo = await photosService.createPhoto({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(dto.toJSON() as any),
        createdByUserId,
      });

      // Redirect back to the album
      res.redirect(`/albums/${photo.albumId}`);
    }),

  /**
   * Handle update photo form submission
   */
  post('/:id', 'handleUpdatePhoto')
    .middleware(requireAuth)
    .handler(async (_inputs, req, res) => {
      const photoId = req.params.id;
      const dto = new UpdatePhotoDTO(req.body);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const photo = await photosService.updatePhoto(photoId, dto.toJSON() as any);

      // Redirect back to the album
      res.redirect(`/albums/${photo.albumId}`);
    }),

  /**
   * Handle delete photo
   */
  post('/:id/delete', 'handleDeletePhoto')
    .middleware(requireAuth)
    .handler(async (_inputs, req, res) => {
      const photoId = req.params.id;

      // Get the photo first to know which album to redirect to
      const photo = await photosService.getPhotoById(photoId);

      // TODO: Get actual user ID from session
      const userId = req.session.userId ?? 'system';

      await photosService.softDeletePhoto(photoId, userId);

      // Redirect back to the album
      res.redirect(`/albums/${photo.albumId}`);
    }),
]);
