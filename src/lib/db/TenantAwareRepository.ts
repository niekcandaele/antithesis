import { getServerContext } from '../http/serverContext.js';
import { BadRequestError } from '../http/errors.js';

/**
 * Abstract base repository for tenant-aware entities
 *
 * Provides helper methods for tenant scoping without complex generics.
 * Child repositories implement their own CRUD methods using these helpers.
 *
 * Key features:
 * - getTenantId(): Get current tenant from context or throw error
 * - Explicit NOT_TENANT_SCOPED_ prefix for admin operations
 *
 * @example
 * ```typescript
 * export class AlbumsRepository extends TenantAwareRepository {
 *   async findAll(): Promise<AlbumEntity[]> {
 *     const tenantId = this.getTenantId();
 *     return db
 *       .selectFrom('albums')
 *       .selectAll()
 *       .where('tenantId', '=', tenantId)
 *       .execute();
 *   }
 * }
 * ```
 */
export abstract class TenantAwareRepository {
  /**
   * Get current tenant ID from server context
   * Throws BadRequestError(400) if no tenant context is available
   *
   * @throws BadRequestError when tenant context is missing
   * @returns The current tenant ID
   */
  protected getTenantId(): string {
    const context = getServerContext();
    if (!context.tenantId) {
      throw new BadRequestError('Tenant context required for this operation');
    }
    return context.tenantId;
  }

  /**
   * Check if tenant context is available
   * Use this for optional tenant scoping scenarios
   *
   * @returns True if tenant context exists, false otherwise
   */
  protected hasTenantContext(): boolean {
    const context = getServerContext();
    return context.tenantId !== undefined;
  }
}
