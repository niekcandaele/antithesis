import type { Selectable } from 'kysely';
import { getDb } from '../lib/db/index.js';
import { TenantAwareRepository } from '../lib/db/TenantAwareRepository.js';
import type { UserRoles } from '../lib/db/types.js';

/**
 * User-Role relationship entity from database
 */
export type UserRoleEntity = Selectable<UserRoles>;

/**
 * Repository for user-role relationship operations
 *
 * Manages the many-to-many relationship between users and roles.
 * Roles are tenant-scoped, meaning a user can have different roles in different tenants.
 *
 * Uses Row Level Security (RLS) for automatic tenant filtering based on ServerContext.
 * All operations are strictly tenant-scoped with no bypass mechanisms.
 */
export class UserRoleRepository extends TenantAwareRepository {
  /**
   * Find all role IDs for a user in the current tenant
   *
   * Note: Automatically filtered by current tenant via RLS
   */
  async findRolesForUser(userId: string): Promise<string[]> {
    const db = getDb();
    const results = await db
      .selectFrom('user_roles')
      .select('roleId')
      .where('userId', '=', userId)
      .execute();
    return results.map((r) => r.roleId);
  }

  /**
   * Find all user IDs with a specific role in the current tenant
   *
   * Note: Automatically filtered by current tenant via RLS
   */
  async findUsersWithRole(roleId: string): Promise<string[]> {
    const db = getDb();
    const results = await db
      .selectFrom('user_roles')
      .select('userId')
      .where('roleId', '=', roleId)
      .execute();
    return results.map((r) => r.userId);
  }

  /**
   * Check if a user has a specific role in the current tenant
   *
   * Note: Automatically filtered by current tenant via RLS
   */
  async hasRole(userId: string, roleId: string): Promise<boolean> {
    const db = getDb();
    const result = await db
      .selectFrom('user_roles')
      .select('userId')
      .where('userId', '=', userId)
      .where('roleId', '=', roleId)
      .executeTakeFirst();
    return !!result;
  }

  /**
   * Assign a role to a user in the current tenant
   *
   * Note: tenantId is auto-injected from ServerContext
   */
  async assignRole(userId: string, roleId: string): Promise<UserRoleEntity> {
    const tenantId = this.getTenantId();
    const db = getDb();
    return db
      .insertInto('user_roles')
      .values({ userId, roleId, tenantId })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /**
   * Remove a role from a user in the current tenant
   *
   * Note: Automatically filtered by current tenant via RLS
   */
  async removeRole(userId: string, roleId: string): Promise<boolean> {
    const db = getDb();
    const result = await db
      .deleteFrom('user_roles')
      .where('userId', '=', userId)
      .where('roleId', '=', roleId)
      .executeTakeFirst();
    return result.numDeletedRows > 0;
  }

  /**
   * Remove all roles for a user in the current tenant
   *
   * Note: Automatically filtered by current tenant via RLS
   */
  async removeAllRolesForUser(userId: string): Promise<number> {
    const db = getDb();
    const result = await db
      .deleteFrom('user_roles')
      .where('userId', '=', userId)
      .executeTakeFirst();
    return Number(result.numDeletedRows);
  }
}

export const userRoleRepository = new UserRoleRepository();
