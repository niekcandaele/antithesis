import { NotFoundError } from '../lib/http/errors.js';
import {
  photosRepository,
  type CreatePhotoData,
  type UpdatePhotoData,
  type PhotoEntity,
} from '../db/photos.repository.js';
import { albumsRepository } from '../db/albums.repository.js';
import type { QueryParams } from '../lib/db/queryBuilder.js';

/**
 * Plain photo object returned by service
 */
export interface Photo {
  id: string;
  tenantId: string;
  albumId: string;
  title: string;
  description: string | null;
  url: string;
  thumbnailUrl: string | null;
  status: string;
  createdByUserId: string;
  isDeleted: boolean;
  deletedAt: string | null;
  deletedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Service for photo business logic
 *
 * Provides business logic layer for photo operations, including:
 * - Validation of business rules (album ownership, etc.)
 * - Error handling with appropriate HTTP errors
 * - Coordination between repository and controllers
 * - Mapping database entities to plain objects
 */
export class PhotosService {
  /**
   * Map database entity to plain object
   */
  private mapToPlain(entity: PhotoEntity): Photo {
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      albumId: entity.albumId,
      title: entity.title,
      description: entity.description ?? null,
      url: entity.url,
      thumbnailUrl: entity.thumbnailUrl ?? null,
      status: entity.status,
      createdByUserId: entity.createdByUserId,
      isDeleted: entity.isDeleted,
      deletedAt:
        entity.deletedAt instanceof Date ? entity.deletedAt.toISOString() : entity.deletedAt,
      deletedByUserId: entity.deletedByUserId ?? null,
      createdAt:
        entity.createdAt instanceof Date ? entity.createdAt.toISOString() : entity.createdAt,
      updatedAt:
        entity.updatedAt instanceof Date ? entity.updatedAt.toISOString() : entity.updatedAt,
    };
  }

  /**
   * Verify album exists and belongs to current tenant
   * @throws {NotFoundError} If album doesn't exist or doesn't belong to current tenant
   */
  private async verifyAlbumOwnership(albumId: string): Promise<void> {
    const album = await albumsRepository.findById(albumId);
    if (!album) {
      throw new NotFoundError('Album not found');
    }
  }

  /**
   * Get all photos for current tenant with optional filtering and pagination
   */
  async getAllPhotos(params: QueryParams = {}): Promise<Photo[]> {
    const entities = await photosRepository.findAll(params);
    return entities.map((e) => this.mapToPlain(e));
  }

  /**
   * Get photos by album ID (tenant-scoped)
   * @throws {NotFoundError} If album doesn't exist or doesn't belong to current tenant
   */
  async getPhotosByAlbumId(albumId: string, params: QueryParams = {}): Promise<Photo[]> {
    await this.verifyAlbumOwnership(albumId);
    const entities = await photosRepository.findByAlbumId(albumId, params);
    return entities.map((e) => this.mapToPlain(e));
  }

  /**
   * Get active (non-deleted) photos for current tenant
   */
  async getActivePhotos(params: QueryParams = {}): Promise<Photo[]> {
    const entities = await photosRepository.findActive(params);
    return entities.map((e) => this.mapToPlain(e));
  }

  /**
   * Get photos by status for current tenant
   */
  async getPhotosByStatus(status: string, params: QueryParams = {}): Promise<Photo[]> {
    const entities = await photosRepository.findByStatus(status, params);
    return entities.map((e) => this.mapToPlain(e));
  }

  /**
   * Get a photo by ID
   * @throws {NotFoundError} If photo doesn't exist or doesn't belong to current tenant
   */
  async getPhotoById(id: string): Promise<Photo> {
    const photo = await photosRepository.findById(id);
    if (!photo) {
      throw new NotFoundError('Photo not found');
    }
    return this.mapToPlain(photo);
  }

  /**
   * Create a new photo
   * @throws {NotFoundError} If album doesn't exist or doesn't belong to current tenant
   */
  async createPhoto(data: CreatePhotoData): Promise<Photo> {
    await this.verifyAlbumOwnership(data.albumId);
    const photo = await photosRepository.create(data);
    return this.mapToPlain(photo);
  }

  /**
   * Update a photo by ID
   * @throws {NotFoundError} If photo doesn't exist or doesn't belong to current tenant
   */
  async updatePhoto(id: string, data: UpdatePhotoData): Promise<Photo> {
    const photo = await photosRepository.update(id, data);
    if (!photo) {
      throw new NotFoundError('Photo not found');
    }
    return this.mapToPlain(photo);
  }

  /**
   * Soft delete a photo by ID
   * @throws {NotFoundError} If photo doesn't exist or doesn't belong to current tenant
   */
  async softDeletePhoto(id: string, deletedByUserId: string): Promise<Photo> {
    const photo = await photosRepository.softDelete(id, deletedByUserId);
    if (!photo) {
      throw new NotFoundError('Photo not found');
    }
    return this.mapToPlain(photo);
  }

  /**
   * Restore a soft-deleted photo by ID
   * @throws {NotFoundError} If photo doesn't exist or doesn't belong to current tenant
   */
  async restorePhoto(id: string): Promise<Photo> {
    const photo = await photosRepository.restore(id);
    if (!photo) {
      throw new NotFoundError('Photo not found');
    }
    return this.mapToPlain(photo);
  }

  /**
   * Hard delete a photo by ID
   * Warning: This permanently deletes the photo
   * @throws {NotFoundError} If photo doesn't exist or doesn't belong to current tenant
   */
  async deletePhoto(id: string): Promise<void> {
    const deleted = await photosRepository.delete(id);
    if (!deleted) {
      throw new NotFoundError('Photo not found');
    }
  }

  /**
   * Count photos for current tenant
   */
  async countPhotos(params: QueryParams = {}): Promise<number> {
    return photosRepository.count(params);
  }
}

export const photosService = new PhotosService();
