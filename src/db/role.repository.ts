import type { Selectable } from 'kysely';
import { getDb } from '../lib/db/index.js';
import { buildQuery, type QueryParams } from '../lib/db/queryBuilder.js';
import type { Roles } from '../lib/db/types.js';

/**
 * Role data for creation (without generated fields)
 */
export interface CreateRoleData {
  name: string;
}

/**
 * Role data for updates (all fields optional)
 */
export interface UpdateRoleData {
  name?: string;
}

/**
 * Role entity from database (selected/read form)
 */
export type RoleEntity = Selectable<Roles>;

/**
 * Repository for role database operations
 *
 * Provides CRUD operations for the roles table using Kysely.
 * Roles are code-defined and seeded by the application.
 */
export class RoleRepository {
  /**
   * Find all roles with optional filtering, searching, and pagination
   */
  async findAll(params: QueryParams = {}): Promise<RoleEntity[]> {
    const db = getDb();
    const query = db.selectFrom('roles').selectAll();
    return buildQuery(query, params).execute();
  }

  /**
   * Find a role by ID
   */
  async findById(id: string): Promise<RoleEntity | undefined> {
    const db = getDb();
    return db.selectFrom('roles').selectAll().where('id', '=', id).executeTakeFirst();
  }

  /**
   * Find a role by name
   */
  async findByName(name: string): Promise<RoleEntity | undefined> {
    const db = getDb();
    return db.selectFrom('roles').selectAll().where('name', '=', name).executeTakeFirst();
  }

  /**
   * Create a new role
   */
  async create(data: CreateRoleData): Promise<RoleEntity> {
    const db = getDb();
    return db.insertInto('roles').values(data).returningAll().executeTakeFirstOrThrow();
  }

  /**
   * Update a role by ID
   */
  async update(id: string, data: UpdateRoleData): Promise<RoleEntity | undefined> {
    const db = getDb();
    return db
      .updateTable('roles')
      .set({
        ...data,
        updatedAt: new Date().toISOString(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  /**
   * Delete a role by ID
   */
  async delete(id: string): Promise<boolean> {
    const db = getDb();
    const result = await db.deleteFrom('roles').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0;
  }

  /**
   * Upsert a role by name
   * Creates a new role if not exists, returns existing if exists
   */
  async upsertByName(name: string): Promise<RoleEntity> {
    const existing = await this.findByName(name);
    if (existing) {
      return existing;
    }
    return this.create({ name });
  }

  /**
   * Count total roles (useful for pagination)
   */
  async count(params: QueryParams = {}): Promise<number> {
    const db = getDb();
    let query = db.selectFrom('roles').select(db.fn.count('id').as('count'));

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

export const roleRepository = new RoleRepository();
