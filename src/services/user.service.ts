import { userRepository, type UserEntity } from '../db/user.repository.js';
import { userTenantRepository } from '../db/user-tenant.repository.js';
import { tenantRepository } from '../db/tenant.repository.js';
import type { UserClaims } from './auth.service.js';

/**
 * User service for managing users and their tenant relationships
 *
 * Handles synchronization of user data from Keycloak to the application database:
 * - User creation/update based on Keycloak user ID
 * - Tenant relationship synchronization from Keycloak organization membership
 * - Session tenant selection logic
 */
export class UserService {
  /**
   * Sync user and tenant relationships from Keycloak authentication
   *
   * This method:
   * 1. Upserts the user by Keycloak user ID
   * 2. Fetches tenant IDs based on Keycloak organization IDs
   * 3. Synchronizes user-tenant relationships (adds new, removes obsolete)
   *
   * @param keycloakData - User claims from Keycloak (ID token + UserInfo)
   * @returns Synced user entity
   */
  async syncUserFromKeycloak(keycloakData: UserClaims): Promise<UserEntity> {
    // Upsert user by Keycloak user ID
    const user = await userRepository.upsertByKeycloakId({
      email: keycloakData.email,
      keycloakUserId: keycloakData.keycloakUserId,
    });

    // Find tenants by Keycloak organization IDs
    const tenantIds = await this.findTenantsByOrganizationIds(keycloakData.organizations);

    // Sync user-tenant relationships
    await userTenantRepository.syncTenants(user.id, tenantIds);

    return user;
  }

  /**
   * Find tenant IDs by Keycloak organization IDs
   *
   * @param organizationIds - Array of Keycloak organization IDs
   * @returns Array of tenant IDs
   */
  private async findTenantsByOrganizationIds(organizationIds: string[]): Promise<string[]> {
    if (organizationIds.length === 0) {
      return [];
    }

    const tenantIds: string[] = [];

    for (const orgId of organizationIds) {
      const tenant = await tenantRepository.findByKeycloakOrganizationId(orgId);
      if (tenant) {
        tenantIds.push(tenant.id);
      }
    }

    return tenantIds;
  }

  /**
   * Determine current tenant for user session
   *
   * Logic:
   * 1. If user has lastTenantId and still has access, use it
   * 2. Otherwise, use first available tenant
   * 3. If no tenants, return null
   *
   * @param userId - User ID
   * @returns Current tenant ID or null
   */
  async determineCurrentTenant(userId: string): Promise<string | null> {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    const tenantIds = await userTenantRepository.findTenantsForUser(userId);

    if (tenantIds.length === 0) {
      return null;
    }

    // If user has lastTenantId and still has access, use it
    if (user.lastTenantId && tenantIds.includes(user.lastTenantId)) {
      return user.lastTenantId;
    }

    // Otherwise, use first available tenant
    return tenantIds[0] || null;
  }

  /**
   * Update user's last accessed tenant
   *
   * @param userId - User ID
   * @param tenantId - Tenant ID to set as last accessed
   */
  async updateLastTenant(userId: string, tenantId: string): Promise<void> {
    await userRepository.update(userId, { lastTenantId: tenantId });
  }
}

export const userService = new UserService();
