import type { SelectQueryBuilder } from 'kysely';
import { sql } from 'kysely';

/**
 * Query parameters for filtering, searching, sorting, and pagination
 *
 * @example
 * ```typescript
 * const params: QueryParams = {
 *   filters: { role: ['admin', 'user'], isActive: true },
 *   search: { name: 'john' },
 *   greaterThan: { createdAt: '2024-01-01' },
 *   lessThan: { createdAt: '2024-12-31' },
 *   page: 1,
 *   limit: 20,
 *   sortBy: 'createdAt',
 *   sortDirection: 'desc',
 * };
 * ```
 */
export interface QueryParams {
  /** Filter by exact matches (IN queries for arrays, equality for single values) */
  filters?: Record<string, unknown[] | string | number | boolean | null>;

  /** Search using case-insensitive ILIKE (PostgreSQL) */
  search?: Record<string, string>;

  /** Filter for values greater than the specified value */
  greaterThan?: Record<string, unknown>;

  /** Filter for values less than the specified value */
  lessThan?: Record<string, unknown>;

  /** Page number for pagination (1-indexed, default: 1) */
  page?: number;

  /** Number of items per page (default: 20, max: 100) */
  limit?: number;

  /** Field to sort by */
  sortBy?: string;

  /** Sort direction (default: 'asc') */
  sortDirection?: 'asc' | 'desc';
}

/**
 * Build a Kysely query with filtering, searching, sorting, and pagination
 *
 * Applies the following operations in order:
 * 1. Filters (IN queries for arrays, equality for single values)
 * 2. Search (ILIKE for case-insensitive partial matching)
 * 3. Greater than comparisons
 * 4. Less than comparisons
 * 5. Sorting
 * 6. Pagination (offset and limit)
 *
 * Pagination limits:
 * - Default limit: 20 items per page
 * - Maximum limit: 100 items per page
 * - Page numbers are 1-indexed
 *
 * @param query - The Kysely query builder to enhance
 * @param params - Query parameters for filtering, searching, sorting, and pagination
 * @returns Enhanced query builder with all operations applied
 *
 * @example
 * ```typescript
 * import { getDb } from './index.js';
 * import { buildQuery } from './queryBuilder.js';
 *
 * const db = getDb();
 *
 * const params: QueryParams = {
 *   filters: { role: ['admin', 'user'] },
 *   search: { name: 'john' },
 *   page: 1,
 *   limit: 20,
 *   sortBy: 'createdAt',
 *   sortDirection: 'desc',
 * };
 *
 * const users = await buildQuery(
 *   db.selectFrom('users'),
 *   params
 * ).selectAll().execute();
 * ```
 *
 * @example
 * ```typescript
 * // Date range filtering
 * const params: QueryParams = {
 *   greaterThan: { createdAt: '2024-01-01' },
 *   lessThan: { createdAt: '2024-12-31' },
 * };
 *
 * const usersInRange = await buildQuery(
 *   db.selectFrom('users'),
 *   params
 * ).selectAll().execute();
 * ```
 *
 * @example
 * ```typescript
 * // Case-insensitive search
 * const params: QueryParams = {
 *   search: { email: 'example.com' }, // Finds emails containing "example.com"
 * };
 *
 * const users = await buildQuery(
 *   db.selectFrom('users'),
 *   params
 * ).selectAll().execute();
 * ```
 */
export function buildQuery<DB, TB extends keyof DB & string, O>(
  query: SelectQueryBuilder<DB, TB, O>,
  params: QueryParams = {},
): SelectQueryBuilder<DB, TB, O> {
  let result = query;

  // Apply filters (IN queries for arrays, equality for single values)
  if (params.filters) {
    for (const [column, value] of Object.entries(params.filters)) {
      if (value === null) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        result = result.where(column as any, 'is', null as any);
      } else if (Array.isArray(value)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        result = result.where(column as any, 'in', value as any);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        result = result.where(column as any, '=', value as any);
      }
    }
  }

  // Apply search (ILIKE for case-insensitive)
  if (params.search) {
    for (const [column, value] of Object.entries(params.search)) {
      if (value) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        result = result.where(sql`${sql.ref(column)} ILIKE ${`%${value}%`}` as any);
      }
    }
  }

  // Apply greaterThan filters
  if (params.greaterThan) {
    for (const [column, value] of Object.entries(params.greaterThan)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result = result.where(column as any, '>', value as any);
    }
  }

  // Apply lessThan filters
  if (params.lessThan) {
    for (const [column, value] of Object.entries(params.lessThan)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result = result.where(column as any, '<', value as any);
    }
  }

  // Apply sorting
  if (params.sortBy) {
    const direction: 'asc' | 'desc' = params.sortDirection ?? 'asc';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result = result.orderBy(params.sortBy as any, direction);
  }

  // Apply pagination
  const page = params.page ?? 1;
  const limit = Math.min(params.limit ?? 20, 100); // Default 20, max 100
  const offset = (page - 1) * limit;

  result = result.limit(limit).offset(offset);

  return result;
}
