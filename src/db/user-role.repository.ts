import type { Selectable } from 'kysely';
import { getDb } from '../lib/db/index.js';
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
 */
export class UserRoleRepository {
  /**
   * Find all role IDs for a user in a specific tenant
   */
  async findRolesForUser(userId: string, tenantId: string): Promise<string[]> {
    const db = getDb();
    const results = await db
      .selectFrom('user_roles')
      .select('roleId')
      .where('userId', '=', userId)
      .where('tenantId', '=', tenantId)
      .execute();
    return results.map((r) => r.roleId);
  }

  /**
   * Find all user IDs with a specific role in a tenant
   */
  async findUsersWithRole(roleId: string, tenantId: string): Promise<string[]> {
    const db = getDb();
    const results = await db
      .selectFrom('user_roles')
      .select('userId')
      .where('roleId', '=', roleId)
      .where('tenantId', '=', tenantId)
      .execute();
    return results.map((r) => r.userId);
  }

  /**
   * Check if a user has a specific role in a tenant
   */
  async hasRole(userId: string, roleId: string, tenantId: string): Promise<boolean> {
    const db = getDb();
    const result = await db
      .selectFrom('user_roles')
      .select('userId')
      .where('userId', '=', userId)
      .where('roleId', '=', roleId)
      .where('tenantId', '=', tenantId)
      .executeTakeFirst();
    return !!result;
  }

  /**
   * Assign a role to a user in a specific tenant
   */
  async assignRole(userId: string, roleId: string, tenantId: string): Promise<UserRoleEntity> {
    const db = getDb();
    return db
      .insertInto('user_roles')
      .values({ userId, roleId, tenantId })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /**
   * Remove a role from a user in a specific tenant
   */
  async removeRole(userId: string, roleId: string, tenantId: string): Promise<boolean> {
    const db = getDb();
    const result = await db
      .deleteFrom('user_roles')
      .where('userId', '=', userId)
      .where('roleId', '=', roleId)
      .where('tenantId', '=', tenantId)
      .executeTakeFirst();
    return result.numDeletedRows > 0;
  }

  /**
   * Remove all roles for a user in a specific tenant
   */
  async removeAllRolesForUser(userId: string, tenantId: string): Promise<number> {
    const db = getDb();
    const result = await db
      .deleteFrom('user_roles')
      .where('userId', '=', userId)
      .where('tenantId', '=', tenantId)
      .executeTakeFirst();
    return Number(result.numDeletedRows);
  }

  /**
   * Remove all role assignments for a user (across all tenants)
   */
  async removeAllForUser(userId: string): Promise<number> {
    const db = getDb();
    const result = await db
      .deleteFrom('user_roles')
      .where('userId', '=', userId)
      .executeTakeFirst();
    return Number(result.numDeletedRows);
  }

  /**
   * Remove all role assignments for a tenant
   */
  async removeAllForTenant(tenantId: string): Promise<number> {
    const db = getDb();
    const result = await db
      .deleteFrom('user_roles')
      .where('tenantId', '=', tenantId)
      .executeTakeFirst();
    return Number(result.numDeletedRows);
  }

  /**
   * Remove all assignments of a specific role
   */
  async removeAllForRole(roleId: string): Promise<number> {
    const db = getDb();
    const result = await db
      .deleteFrom('user_roles')
      .where('roleId', '=', roleId)
      .executeTakeFirst();
    return Number(result.numDeletedRows);
  }
}

export const userRoleRepository = new UserRoleRepository();
