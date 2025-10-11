import type { Selectable, Insertable } from 'kysely';
import { getDb } from '../lib/db/index.js';
import { TenantAwareRepository } from '../lib/db/TenantAwareRepository.js';
import { buildQuery, type QueryParams } from '../lib/db/queryBuilder.js';
import type { Photos } from '../lib/db/types.js';

/**
 * Photo data for creation (without generated/auto-filled fields)
 */
export interface CreatePhotoData {
  albumId: string;
  title: string;
  description?: string | null;
  url: string;
  thumbnailUrl?: string | null;
  status?: string;
  createdByUserId: string;
}

/**
 * Photo data for updates (all fields optional)
 */
export interface UpdatePhotoData {
  title?: string;
  description?: string | null;
  url?: string;
  thumbnailUrl?: string | null;
  status?: string;
}

/**
 * Photo entity from database
 */
export type PhotoEntity = Selectable<Photos>;

/**
 * Repository for photo database operations with automatic tenant scoping
 *
 * All queries are automatically filtered by Row Level Security (RLS) policies
 * based on the current tenant from ServerContext. No manual tenant filtering needed!
 *
 * RLS automatically adds: WHERE tenant_id = current_tenant_id
 */
export class PhotosRepository extends TenantAwareRepository {
  /**
   * Find all photos for current tenant with optional filtering, searching, and pagination
   *
   * Note: Tenant filtering is automatic via RLS - no manual where clause needed
   */
  async findAll(params: QueryParams = {}): Promise<PhotoEntity[]> {
    const db = getDb();
    const query = db.selectFrom('photos').selectAll();
    return buildQuery(query, params).execute();
  }

  /**
   * Find a photo by ID (automatically tenant-scoped via RLS)
   */
  async findById(id: string): Promise<PhotoEntity | undefined> {
    const db = getDb();
    return db.selectFrom('photos').selectAll().where('id', '=', id).executeTakeFirst();
  }

  /**
   * Find photos by album ID (automatically tenant-scoped via RLS)
   * RLS verifies both the photos and album belong to current tenant
   */
  async findByAlbumId(albumId: string, params: QueryParams = {}): Promise<PhotoEntity[]> {
    const db = getDb();
    const query = db.selectFrom('photos').selectAll().where('albumId', '=', albumId);
    return buildQuery(query, params).execute();
  }

  /**
   * Find photos by status for current tenant (automatically tenant-scoped via RLS)
   */
  async findByStatus(status: string, params: QueryParams = {}): Promise<PhotoEntity[]> {
    const db = getDb();
    const query = db.selectFrom('photos').selectAll().where('status', '=', status);
    return buildQuery(query, params).execute();
  }

  /**
   * Find active (non-deleted) photos for current tenant (automatically tenant-scoped via RLS)
   */
  async findActive(params: QueryParams = {}): Promise<PhotoEntity[]> {
    const db = getDb();
    const query = db.selectFrom('photos').selectAll().where('isDeleted', '=', false);
    return buildQuery(query, params).execute();
  }

  /**
   * Create a new photo (auto-injects tenantId)
   */
  async create(data: CreatePhotoData): Promise<PhotoEntity> {
    const tenantId = this.getTenantId();
    const db = getDb();
    return db
      .insertInto('photos')
      .values({ ...data, tenantId } as Insertable<Photos>)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /**
   * Update a photo by ID (automatically verifies tenant ownership via RLS)
   */
  async update(id: string, data: UpdatePhotoData): Promise<PhotoEntity | undefined> {
    const db = getDb();
    return db
      .updateTable('photos')
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  /**
   * Soft delete a photo by ID (automatically verifies tenant ownership via RLS)
   */
  async softDelete(id: string, deletedByUserId: string): Promise<PhotoEntity | undefined> {
    const db = getDb();
    return db
      .updateTable('photos')
      .set({
        isDeleted: true,
        deletedAt: new Date(),
        deletedByUserId,
        updatedAt: new Date(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  /**
   * Restore a soft-deleted photo by ID (automatically verifies tenant ownership via RLS)
   */
  async restore(id: string): Promise<PhotoEntity | undefined> {
    const db = getDb();
    return db
      .updateTable('photos')
      .set({
        isDeleted: false,
        deletedAt: null,
        deletedByUserId: null,
        updatedAt: new Date(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  /**
   * Hard delete a photo by ID (automatically verifies tenant ownership via RLS)
   * Warning: This permanently deletes the photo
   */
  async delete(id: string): Promise<boolean> {
    const db = getDb();
    const result = await db.deleteFrom('photos').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0;
  }

  /**
   * Count photos for current tenant (automatically tenant-scoped via RLS)
   */
  async count(params: QueryParams = {}): Promise<number> {
    const db = getDb();
    let query = db.selectFrom('photos').select(db.fn.count('id').as('count'));

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

export const photosRepository = new PhotosRepository();
