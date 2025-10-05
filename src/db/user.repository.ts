import type { Selectable } from 'kysely';
import { getDb } from '../lib/db/index.js';
import { buildQuery, type QueryParams } from '../lib/db/queryBuilder.js';
import type { Users } from '../lib/db/types.js';

/**
 * User data for creation (without generated fields)
 */
export interface CreateUserData {
  email: string;
  keycloakUserId: string;
  lastTenantId?: string | null;
}

/**
 * User data for updates (all fields optional)
 */
export interface UpdateUserData {
  email?: string;
  keycloakUserId?: string;
  lastTenantId?: string | null;
}

/**
 * User entity from database (selected/read form)
 */
export type UserEntity = Selectable<Users>;

/**
 * Repository for user database operations
 *
 * Provides CRUD operations for the users table using Kysely.
 * All operations use the singleton database instance from getDb().
 */
export class UserRepository {
  /**
   * Find all users with optional filtering, searching, and pagination
   */
  async findAll(params: QueryParams = {}): Promise<UserEntity[]> {
    const db = getDb();
    const query = db.selectFrom('users').selectAll();
    return buildQuery(query, params).execute();
  }

  /**
   * Find a user by ID
   */
  async findById(id: string): Promise<UserEntity | undefined> {
    const db = getDb();
    return db.selectFrom('users').selectAll().where('id', '=', id).executeTakeFirst();
  }

  /**
   * Find a user by email
   */
  async findByEmail(email: string): Promise<UserEntity | undefined> {
    const db = getDb();
    return db.selectFrom('users').selectAll().where('email', '=', email).executeTakeFirst();
  }

  /**
   * Find a user by Keycloak user ID
   */
  async findByKeycloakUserId(keycloakUserId: string): Promise<UserEntity | undefined> {
    const db = getDb();
    return db
      .selectFrom('users')
      .selectAll()
      .where('keycloakUserId', '=', keycloakUserId)
      .executeTakeFirst();
  }

  /**
   * Create a new user
   */
  async create(data: CreateUserData): Promise<UserEntity> {
    const db = getDb();
    return db.insertInto('users').values(data).returningAll().executeTakeFirstOrThrow();
  }

  /**
   * Update a user by ID
   */
  async update(id: string, data: UpdateUserData): Promise<UserEntity | undefined> {
    const db = getDb();
    return db
      .updateTable('users')
      .set({
        ...data,
        updatedAt: new Date().toISOString(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  /**
   * Delete a user by ID
   */
  async delete(id: string): Promise<boolean> {
    const db = getDb();
    const result = await db.deleteFrom('users').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0;
  }

  /**
   * Upsert a user by Keycloak user ID
   * Creates a new user if not exists, updates if exists
   * Uses database-level ON CONFLICT on email to handle test cleanup scenarios
   * where Keycloak users are deleted and recreated with new IDs
   */
  async upsertByKeycloakId(data: CreateUserData): Promise<UserEntity> {
    const db = getDb();
    return db
      .insertInto('users')
      .values(data)
      .onConflict((oc) =>
        oc.column('email').doUpdateSet({
          keycloakUserId: data.keycloakUserId,
          lastTenantId: data.lastTenantId,
          updatedAt: new Date().toISOString(),
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /**
   * Count total users (useful for pagination)
   */
  async count(params: QueryParams = {}): Promise<number> {
    const db = getDb();
    let query = db.selectFrom('users').select(db.fn.count('id').as('count'));

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

export const userRepository = new UserRepository();
