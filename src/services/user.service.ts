import { userRepository, type UserEntity } from '../db/user.repository.js';
import { userTenantRepository } from '../db/user-tenant.repository.js';
import { tenantService } from './tenant.service.js';
import { keycloakAdminService } from './keycloak-admin.service.js';
import type { UserClaims } from './auth.service.js';
import { logger } from '../lib/logger.js';

const log = logger('userService');

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
   * 2. Ensures local tenants exist for all Keycloak organizations
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

    // Ensure local tenants exist for all Keycloak organizations
    const tenantIds: string[] = [];

    for (const orgId of keycloakData.organizations) {
      try {
        // Get organization details from Keycloak to fetch name
        const org = await keycloakAdminService.getOrganization(orgId);

        // Ensure local tenant exists (creates if missing)
        const tenantId = await tenantService.ensureTenantForOrganization(orgId, org.name);

        tenantIds.push(tenantId);
      } catch (error) {
        // Log warning but continue with other orgs
        // This allows partial sync if one org fetch fails
        log.warn('Failed to sync tenant for organization', {
          userId: user.id,
          orgId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Sync user-tenant relationships with ALL successfully fetched tenants
    await userTenantRepository.syncTenants(user.id, tenantIds);

    return user;
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
