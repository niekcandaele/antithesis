import type { Selectable } from 'kysely';
import { getDb } from '../lib/db/index.js';
import { buildQuery, type QueryParams } from '../lib/db/queryBuilder.js';
import type { Tenants } from '../lib/db/types.js';

/**
 * Tenant data for creation (without generated fields)
 */
export interface CreateTenantData {
  name: string;
  slug: string;
  externalReferenceId?: string | null;
  keycloakOrganizationId?: string | null;
}

/**
 * Tenant data for updates (all fields optional)
 */
export interface UpdateTenantData {
  name?: string;
  slug?: string;
  externalReferenceId?: string | null;
  keycloakOrganizationId?: string | null;
}

/**
 * Tenant entity from database (selected/read form)
 */
export type TenantEntity = Selectable<Tenants>;

/**
 * Repository for tenant database operations
 *
 * Provides CRUD operations for the tenants table using Kysely.
 * All operations use the singleton database instance from getDb().
 */
export class TenantRepository {
  /**
   * Find all tenants with optional filtering, searching, and pagination
   */
  async findAll(params: QueryParams = {}): Promise<TenantEntity[]> {
    const db = getDb();
    const query = db.selectFrom('tenants').selectAll();
    return buildQuery(query, params).execute();
  }

  /**
   * Find a tenant by ID
   */
  async findById(id: string): Promise<TenantEntity | undefined> {
    const db = getDb();
    return db.selectFrom('tenants').selectAll().where('id', '=', id).executeTakeFirst();
  }

  /**
   * Find a tenant by slug
   */
  async findBySlug(slug: string): Promise<TenantEntity | undefined> {
    const db = getDb();
    return db.selectFrom('tenants').selectAll().where('slug', '=', slug).executeTakeFirst();
  }

  /**
   * Find a tenant by external reference ID
   */
  async findByExternalReferenceId(externalReferenceId: string): Promise<TenantEntity | undefined> {
    const db = getDb();
    return db
      .selectFrom('tenants')
      .selectAll()
      .where('externalReferenceId', '=', externalReferenceId)
      .executeTakeFirst();
  }

  /**
   * Find a tenant by Keycloak organization ID
   */
  async findByKeycloakOrganizationId(
    keycloakOrganizationId: string,
  ): Promise<TenantEntity | undefined> {
    const db = getDb();
    return db
      .selectFrom('tenants')
      .selectAll()
      .where('keycloakOrganizationId', '=', keycloakOrganizationId)
      .executeTakeFirst();
  }

  /**
   * Create a new tenant
   */
  async create(data: CreateTenantData): Promise<TenantEntity> {
    const db = getDb();
    return db.insertInto('tenants').values(data).returningAll().executeTakeFirstOrThrow();
  }

  /**
   * Update a tenant by ID
   */
  async update(id: string, data: UpdateTenantData): Promise<TenantEntity | undefined> {
    const db = getDb();
    return db
      .updateTable('tenants')
      .set({
        ...data,
        updatedAt: new Date().toISOString(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  /**
   * Delete a tenant by ID
   */
  async delete(id: string): Promise<boolean> {
    const db = getDb();
    const result = await db.deleteFrom('tenants').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0;
  }

  /**
   * Count total tenants (useful for pagination)
   */
  async count(params: QueryParams = {}): Promise<number> {
    const db = getDb();
    let query = db.selectFrom('tenants').select(db.fn.count('id').as('count'));

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

export const tenantRepository = new TenantRepository();
