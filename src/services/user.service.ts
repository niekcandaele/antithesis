import { userRepository, type UserEntity } from '../db/user.repository.js';
import { userTenantRepository } from '../db/user-tenant.repository.js';
import type { UserClaims } from './auth.service.js';

/**
 * User service for managing users and their tenant relationships
 *
 * Handles synchronization of user data from Keycloak to the application database:
 * - User creation/update based on Keycloak user ID
 * - Session tenant selection logic
 */
export class UserService {
  /**
   * Sync user from Keycloak authentication
   *
   * Upserts the user record based on Keycloak user ID and email.
   * Tenant relationships are managed separately (auto-provisioning in auth flow).
   *
   * @param keycloakData - User claims from Keycloak ID token
   * @returns Synced user entity
   */
  async syncUserFromKeycloak(keycloakData: UserClaims): Promise<UserEntity> {
    // Upsert user by Keycloak user ID
    return userRepository.upsertByKeycloakId({
      email: keycloakData.email,
      keycloakUserId: keycloakData.keycloakUserId,
    });
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
