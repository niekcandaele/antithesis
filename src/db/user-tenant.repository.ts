import type { Selectable } from 'kysely';
import { getDb } from '../lib/db/index.js';
import type { UserTenants } from '../lib/db/types.js';

/**
 * User-Tenant relationship entity from database
 */
export type UserTenantEntity = Selectable<UserTenants>;

/**
 * Repository for user-tenant relationship operations
 *
 * Manages the many-to-many relationship between users and tenants.
 * Supports automatic synchronization of tenant access based on Keycloak organization membership.
 */
export class UserTenantRepository {
  /**
   * Find all tenant IDs for a user
   */
  async findTenantsForUser(userId: string): Promise<string[]> {
    const db = getDb();
    const results = await db
      .selectFrom('user_tenants')
      .select('tenantId')
      .where('userId', '=', userId)
      .execute();
    return results.map((r) => r.tenantId);
  }

  /**
   * Find all user IDs for a tenant
   */
  async findUsersForTenant(tenantId: string): Promise<string[]> {
    const db = getDb();
    const results = await db
      .selectFrom('user_tenants')
      .select('userId')
      .where('tenantId', '=', tenantId)
      .execute();
    return results.map((r) => r.userId);
  }

  /**
   * Check if a user has access to a tenant
   */
  async hasAccess(userId: string, tenantId: string): Promise<boolean> {
    const db = getDb();
    const result = await db
      .selectFrom('user_tenants')
      .select('userId')
      .where('userId', '=', userId)
      .where('tenantId', '=', tenantId)
      .executeTakeFirst();
    return !!result;
  }

  /**
   * Add a user-tenant relationship
   */
  async addRelationship(userId: string, tenantId: string): Promise<UserTenantEntity> {
    const db = getDb();
    return db
      .insertInto('user_tenants')
      .values({ userId, tenantId })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /**
   * Remove a user-tenant relationship
   */
  async removeRelationship(userId: string, tenantId: string): Promise<boolean> {
    const db = getDb();
    const result = await db
      .deleteFrom('user_tenants')
      .where('userId', '=', userId)
      .where('tenantId', '=', tenantId)
      .executeTakeFirst();
    return result.numDeletedRows > 0;
  }

  /**
   * Sync user-tenant relationships based on Keycloak organization membership
   * Adds missing relationships, removes obsolete ones
   *
   * @param userId - The user ID
   * @param tenantIds - Array of tenant IDs the user should have access to
   */
  async syncTenants(userId: string, tenantIds: string[]): Promise<void> {
    // Get current tenant IDs for user
    const currentTenantIds = await this.findTenantsForUser(userId);

    // Determine which relationships to add and remove
    const toAdd = tenantIds.filter((id) => !currentTenantIds.includes(id));
    const toRemove = currentTenantIds.filter((id) => !tenantIds.includes(id));

    // Add new relationships
    for (const tenantId of toAdd) {
      try {
        await this.addRelationship(userId, tenantId);
      } catch (error) {
        // Ignore duplicate key errors (relationship already exists)
        if (!(error instanceof Error && error.message.includes('duplicate key'))) {
          throw error;
        }
      }
    }

    // Remove obsolete relationships
    for (const tenantId of toRemove) {
      await this.removeRelationship(userId, tenantId);
    }
  }

  /**
   * Remove all relationships for a user
   */
  async removeAllForUser(userId: string): Promise<number> {
    const db = getDb();
    const result = await db
      .deleteFrom('user_tenants')
      .where('userId', '=', userId)
      .executeTakeFirst();
    return Number(result.numDeletedRows);
  }

  /**
   * Remove all relationships for a tenant
   */
  async removeAllForTenant(tenantId: string): Promise<number> {
    const db = getDb();
    const result = await db
      .deleteFrom('user_tenants')
      .where('tenantId', '=', tenantId)
      .executeTakeFirst();
    return Number(result.numDeletedRows);
  }
}

export const userTenantRepository = new UserTenantRepository();
