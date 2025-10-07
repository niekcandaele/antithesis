import { getServerContext } from '../http/serverContext.js';
import { BadRequestError } from '../http/errors.js';

/**
 * Abstract base repository for tenant-aware entities
 *
 * Provides helper methods for tenant-scoped operations using PostgreSQL Row Level Security (RLS).
 *
 * **How RLS works:**
 * - Connection pool automatically sets app.tenant_id session variable from ServerContext
 * - RLS policies filter ALL queries by tenant_id (SELECT/INSERT/UPDATE/DELETE)
 * - No manual `.where('tenantId', '=', tenantId)` needed in child repositories
 * - There is NO way to bypass tenant isolation - all operations are strictly scoped
 *
 * **getTenantId() usage:**
 * - Only needed for INSERT operations to auto-inject tenantId
 * - NOT needed for SELECT/UPDATE/DELETE (RLS handles filtering)
 *
 * @example
 * ```typescript
 * // Tenant-scoped query (RLS automatic)
 * export class AlbumsRepository extends TenantAwareRepository {
 *   async findAll(): Promise<AlbumEntity[]> {
 *     const db = getDb();
 *     return db.selectFrom('albums').selectAll().execute();
 *     // RLS automatically adds: WHERE tenant_id = current_tenant_id
 *   }
 *
 *   async create(data: CreateAlbumData): Promise<AlbumEntity> {
 *     const tenantId = this.getTenantId(); // Only for INSERT
 *     const db = getDb();
 *     return db
 *       .insertInto('albums')
 *       .values({ ...data, tenantId })
 *       .returningAll()
 *       .executeTakeFirstOrThrow();
 *   }
 * }
 * ```
 */
export abstract class TenantAwareRepository {
  /**
   * Get current tenant ID from server context
   *
   * **Use this ONLY for INSERT operations** to auto-inject tenantId.
   * For SELECT/UPDATE/DELETE, RLS automatically handles tenant filtering.
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
