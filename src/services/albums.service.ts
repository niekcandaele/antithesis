import { NotFoundError } from '../lib/http/errors.js';
import {
  albumsRepository,
  type CreateAlbumData,
  type UpdateAlbumData,
  type AlbumEntity,
} from '../db/albums.repository.js';
import type { QueryParams } from '../lib/db/queryBuilder.js';

/**
 * Plain album object returned by service
 */
export interface Album {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  coverPhotoUrl: string | null;
  status: string;
  createdByUserId: string;
  isDeleted: boolean;
  deletedAt: string | null;
  deletedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Album with creator information
 */
export interface AlbumWithCreator extends Album {
  creatorEmail?: string | null;
}

/**
 * Service for album business logic
 *
 * Provides business logic layer for album operations, including:
 * - Validation of business rules
 * - Error handling with appropriate HTTP errors
 * - Coordination between repository and controllers
 * - Mapping database entities to plain objects
 */
export class AlbumsService {
  /**
   * Map database entity to plain object
   */
  private mapToPlain(entity: AlbumEntity): Album {
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      name: entity.name,
      description: entity.description ?? null,
      coverPhotoUrl: entity.coverPhotoUrl ?? null,
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
   * Get all albums for current tenant with optional filtering and pagination
   */
  async getAllAlbums(params: QueryParams = {}): Promise<Album[]> {
    const entities = await albumsRepository.findAll(params);
    return entities.map((e) => this.mapToPlain(e));
  }

  /**
   * Get active (non-deleted) albums for current tenant
   */
  async getActiveAlbums(params: QueryParams = {}): Promise<Album[]> {
    const entities = await albumsRepository.findActive(params);
    return entities.map((e) => this.mapToPlain(e));
  }

  /**
   * Get albums by status for current tenant
   */
  async getAlbumsByStatus(status: string, params: QueryParams = {}): Promise<Album[]> {
    const entities = await albumsRepository.findByStatus(status, params);
    return entities.map((e) => this.mapToPlain(e));
  }

  /**
   * Get an album by ID
   * @throws {NotFoundError} If album doesn't exist or doesn't belong to current tenant
   */
  async getAlbumById(id: string): Promise<Album> {
    const album = await albumsRepository.findById(id);
    if (!album) {
      throw new NotFoundError('Album not found');
    }
    return this.mapToPlain(album);
  }

  /**
   * Get an album by ID with creator information
   * @throws {NotFoundError} If album doesn't exist or doesn't belong to current tenant
   */
  async getAlbumByIdWithCreator(id: string): Promise<AlbumWithCreator> {
    const album = await albumsRepository.findByIdWithCreator(id);
    if (!album) {
      throw new NotFoundError('Album not found');
    }
    return {
      ...this.mapToPlain(album),
      creatorEmail: album.creatorEmail,
    };
  }

  /**
   * Create a new album
   */
  async createAlbum(data: CreateAlbumData): Promise<Album> {
    const album = await albumsRepository.create(data);
    return this.mapToPlain(album);
  }

  /**
   * Update an album by ID
   * @throws {NotFoundError} If album doesn't exist or doesn't belong to current tenant
   */
  async updateAlbum(id: string, data: UpdateAlbumData): Promise<Album> {
    const album = await albumsRepository.update(id, data);
    if (!album) {
      throw new NotFoundError('Album not found');
    }
    return this.mapToPlain(album);
  }

  /**
   * Soft delete an album by ID
   * @throws {NotFoundError} If album doesn't exist or doesn't belong to current tenant
   */
  async softDeleteAlbum(id: string, deletedByUserId: string): Promise<Album> {
    const album = await albumsRepository.softDelete(id, deletedByUserId);
    if (!album) {
      throw new NotFoundError('Album not found');
    }
    return this.mapToPlain(album);
  }

  /**
   * Restore a soft-deleted album by ID
   * @throws {NotFoundError} If album doesn't exist or doesn't belong to current tenant
   */
  async restoreAlbum(id: string): Promise<Album> {
    const album = await albumsRepository.restore(id);
    if (!album) {
      throw new NotFoundError('Album not found');
    }
    return this.mapToPlain(album);
  }

  /**
   * Hard delete an album by ID
   * Warning: This permanently deletes the album and cascades to photos
   * @throws {NotFoundError} If album doesn't exist or doesn't belong to current tenant
   */
  async deleteAlbum(id: string): Promise<void> {
    const deleted = await albumsRepository.delete(id);
    if (!deleted) {
      throw new NotFoundError('Album not found');
    }
  }

  /**
   * Count albums for current tenant
   */
  async countAlbums(params: QueryParams = {}): Promise<number> {
    return albumsRepository.count(params);
  }
}

export const albumsService = new AlbumsService();
