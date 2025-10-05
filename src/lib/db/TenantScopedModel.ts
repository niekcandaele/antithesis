import type { SelectQueryBuilder } from 'kysely';
import type { TenantId } from '../types.js';

/**
 * @deprecated This manual tenant scoping approach has been replaced by TenantAwareRepository.
 *
 * Instead of manually calling withTenantScope() on every query, extend TenantAwareRepository
 * which automatically handles tenant scoping for all CRUD operations.
 *
 * @see TenantAwareRepository in src/lib/db/TenantAwareRepository.ts
 *
 * @example Migration from withTenantScope to TenantAwareRepository
 * ```typescript
 * // OLD APPROACH (deprecated):
 * const users = await withTenantScope(
 *   db.selectFrom('users'),
 *   tenantId
 * ).selectAll().execute();
 *
 * // NEW APPROACH (recommended):
 * class UsersRepository extends TenantAwareRepository {
 *   async findAll(): Promise<User[]> {
 *     const tenantId = this.getTenantId(); // Automatic context lookup
 *     return db.selectFrom('users')
 *       .where('tenantId', '=', tenantId)
 *       .selectAll()
 *       .execute();
 *   }
 * }
 * ```
 *
 * This file is kept for reference only and may be removed in a future version.
 *
 * ---
 *
 * Apply tenant scoping to a Kysely query
 *
 * Adds a WHERE clause to filter results by tenantId. This ensures that
 * queries only return data belonging to the specified tenant, enforcing
 * multi-tenant data isolation at the query level.
 *
 * @param query - The Kysely query builder to scope
 * @param tenantId - The tenant ID to filter by
 * @returns Query builder with tenantId filter applied
 *
 * @example
 * ```typescript
 * import { getDb } from './index.js';
 * import { withTenantScope } from './TenantScopedModel.js';
 *
 * const db = getDb();
 * const tenantId = 'tenant-123' as TenantId;
 *
 * // Without tenant scoping (returns all users - DANGEROUS!)
 * const allUsers = await db.selectFrom('users').selectAll().execute();
 *
 * // With tenant scoping (only returns users for this tenant)
 * const baseQuery = db.selectFrom('users');
 * const scopedQuery = withTenantScope(baseQuery, tenantId);
 * const tenantUsers = await scopedQuery.selectAll().execute();
 * // Only returns users where tenantId = 'tenant-123'
 * ```
 *
 * @example
 * ```typescript
 * // Using with additional filters
 * import { withTenantScope } from './TenantScopedModel.js';
 *
 * const users = await withTenantScope(
 *   db.selectFrom('users'),
 *   tenantId
 * )
 *   .where('email', '=', 'user@example.com')
 *   .selectAll()
 *   .execute();
 * // Returns users for the tenant with matching email
 * ```
 */
export function withTenantScope<DB, TB extends keyof DB & string, O>(
  query: SelectQueryBuilder<DB, TB, O>,
  tenantId: TenantId,
): SelectQueryBuilder<DB, TB, O> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return query.where('tenantId' as any, '=', tenantId);
}
