import type { Selectable, Insertable } from 'kysely';
import { getDb } from '../lib/db/index.js';
import { TenantAwareRepository } from '../lib/db/TenantAwareRepository.js';
import { buildQuery, type QueryParams } from '../lib/db/queryBuilder.js';
import type { Albums } from '../lib/db/types.js';

/**
 * Album data for creation (without generated/auto-filled fields)
 */
export interface CreateAlbumData {
  name: string;
  description?: string | null;
  coverPhotoUrl?: string | null;
  status?: string;
  createdByUserId: string;
}

/**
 * Album data for updates (all fields optional)
 */
export interface UpdateAlbumData {
  name?: string;
  description?: string | null;
  coverPhotoUrl?: string | null;
  status?: string;
}

/**
 * Album entity from database
 */
export type AlbumEntity = Selectable<Albums>;

/**
 * Repository for album database operations with automatic tenant scoping
 *
 * All queries are automatically filtered by the current tenant from ServerContext.
 * Extends TenantAwareRepository for automatic tenant isolation.
 */
export class AlbumsRepository extends TenantAwareRepository {
  /**
   * Find all albums for current tenant with optional filtering, searching, and pagination
   */
  async findAll(params: QueryParams = {}): Promise<AlbumEntity[]> {
    const tenantId = this.getTenantId();
    const db = getDb();
    const query = db.selectFrom('albums').selectAll().where('tenantId', '=', tenantId);
    return buildQuery(query, params).execute();
  }

  /**
   * Find an album by ID (tenant-scoped)
   */
  async findById(id: string): Promise<AlbumEntity | undefined> {
    const tenantId = this.getTenantId();
    const db = getDb();
    return db
      .selectFrom('albums')
      .selectAll()
      .where('tenantId', '=', tenantId)
      .where('id', '=', id)
      .executeTakeFirst();
  }

  /**
   * Find an album by ID with creator user information (tenant-scoped)
   */
  async findByIdWithCreator(
    id: string,
  ): Promise<(AlbumEntity & { creatorEmail?: string | null }) | undefined> {
    const tenantId = this.getTenantId();
    const db = getDb();
    return db
      .selectFrom('albums')
      .leftJoin('users', 'users.id', 'albums.createdByUserId')
      .selectAll('albums')
      .select('users.email as creatorEmail')
      .where('albums.tenantId', '=', tenantId)
      .where('albums.id', '=', id)
      .executeTakeFirst();
  }

  /**
   * Find albums by status for current tenant
   */
  async findByStatus(status: string, params: QueryParams = {}): Promise<AlbumEntity[]> {
    const tenantId = this.getTenantId();
    const db = getDb();
    const query = db
      .selectFrom('albums')
      .selectAll()
      .where('tenantId', '=', tenantId)
      .where('status', '=', status);
    return buildQuery(query, params).execute();
  }

  /**
   * Find active (non-deleted) albums for current tenant
   */
  async findActive(params: QueryParams = {}): Promise<AlbumEntity[]> {
    const tenantId = this.getTenantId();
    const db = getDb();
    const query = db
      .selectFrom('albums')
      .selectAll()
      .where('tenantId', '=', tenantId)
      .where('isDeleted', '=', false);
    return buildQuery(query, params).execute();
  }

  /**
   * Create a new album (auto-injects tenantId)
   */
  async create(data: CreateAlbumData): Promise<AlbumEntity> {
    const tenantId = this.getTenantId();
    const db = getDb();
    return db
      .insertInto('albums')
      .values({ ...data, tenantId } as Insertable<Albums>)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /**
   * Update an album by ID (verifies tenant ownership)
   */
  async update(id: string, data: UpdateAlbumData): Promise<AlbumEntity | undefined> {
    const tenantId = this.getTenantId();
    const db = getDb();
    return db
      .updateTable('albums')
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where('tenantId', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  /**
   * Soft delete an album by ID (verifies tenant ownership)
   */
  async softDelete(id: string, deletedByUserId: string): Promise<AlbumEntity | undefined> {
    const tenantId = this.getTenantId();
    const db = getDb();
    return db
      .updateTable('albums')
      .set({
        isDeleted: true,
        deletedAt: new Date(),
        deletedByUserId,
        updatedAt: new Date(),
      })
      .where('tenantId', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  /**
   * Restore a soft-deleted album by ID (verifies tenant ownership)
   */
  async restore(id: string): Promise<AlbumEntity | undefined> {
    const tenantId = this.getTenantId();
    const db = getDb();
    return db
      .updateTable('albums')
      .set({
        isDeleted: false,
        deletedAt: null,
        deletedByUserId: null,
        updatedAt: new Date(),
      })
      .where('tenantId', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  /**
   * Hard delete an album by ID (verifies tenant ownership)
   * Warning: This permanently deletes the album and cascades to photos
   */
  async delete(id: string): Promise<boolean> {
    const tenantId = this.getTenantId();
    const db = getDb();
    const result = await db
      .deleteFrom('albums')
      .where('tenantId', '=', tenantId)
      .where('id', '=', id)
      .executeTakeFirst();
    return result.numDeletedRows > 0;
  }

  /**
   * Count albums for current tenant
   */
  async count(params: QueryParams = {}): Promise<number> {
    const tenantId = this.getTenantId();
    const db = getDb();
    let query = db
      .selectFrom('albums')
      .select(db.fn.count('id').as('count'))
      .where('tenantId', '=', tenantId);

    // Apply filters from params (excluding pagination)
    if (params.filters) {
      for (const [column, value] of Object.entries(params.filters)) {
        if (value === null) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          query = query.where(column as any, 'is', null as any);
        } else if (Array.isArray(value)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          query = query.where(column as any, 'in', value as any);
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          query = query.where(column as any, '=', value as any);
        }
      }
    }

    const result = await query.executeTakeFirst();
    return Number(result?.count ?? 0);
  }
}

export const albumsRepository = new AlbumsRepository();
