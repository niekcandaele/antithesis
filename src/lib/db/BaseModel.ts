/**
 * Base model interface for all database entities
 *
 * Provides standard fields that all database tables should include:
 * - id: Primary key (UUID)
 * - createdAt: Timestamp when record was created
 * - updatedAt: Timestamp when record was last updated
 *
 * @example
 * ```typescript
 * interface User extends BaseModel {
 *   name: string;
 *   email: string;
 *   tenantId: string;
 * }
 *
 * // Usage with Kysely
 * const user = await db
 *   .selectFrom('users')
 *   .selectAll()
 *   .where('id', '=', userId)
 *   .executeTakeFirst();
 * // user has id, createdAt, updatedAt fields
 * ```
 */
export interface BaseModel {
  /** Primary key (UUID) */
  id: string;

  /** Timestamp when record was created */
  createdAt: string;

  /** Timestamp when record was last updated */
  updatedAt: string;
}

/**
 * Add timestamp fields to data object
 *
 * Helper function to add createdAt and updatedAt timestamps to data
 * being inserted into the database. Both fields are set to the current time.
 *
 * @param data - The data object to add timestamps to
 * @returns Data object with createdAt and updatedAt fields
 *
 * @example
 * ```typescript
 * import { withTimestamps } from './BaseModel.js';
 *
 * const userData = {
 *   name: 'John Doe',
 *   email: 'john@example.com',
 *   tenantId: 'tenant-123',
 * };
 *
 * const dataWithTimestamps = withTimestamps(userData);
 * // {
 * //   name: 'John Doe',
 * //   email: 'john@example.com',
 * //   tenantId: 'tenant-123',
 * //   createdAt: '2024-01-15T12:00:00.000Z',
 * //   updatedAt: '2024-01-15T12:00:00.000Z'
 * // }
 *
 * await db.insertInto('users').values(dataWithTimestamps).execute();
 * ```
 */
export function withTimestamps<T extends Record<string, unknown>>(
  data: T,
): T & Pick<BaseModel, 'createdAt' | 'updatedAt'> {
  const now = new Date().toISOString();
  return {
    ...data,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Update the updatedAt timestamp
 *
 * Helper function to set updatedAt to the current time when updating a record.
 *
 * @param data - The data object to update
 * @returns Data object with updated updatedAt field
 *
 * @example
 * ```typescript
 * import { withUpdatedTimestamp } from './BaseModel.js';
 *
 * const updates = {
 *   name: 'Jane Doe',
 * };
 *
 * const dataWithTimestamp = withUpdatedTimestamp(updates);
 * // {
 * //   name: 'Jane Doe',
 * //   updatedAt: '2024-01-15T12:00:00.000Z'
 * // }
 *
 * await db
 *   .updateTable('users')
 *   .set(dataWithTimestamp)
 *   .where('id', '=', userId)
 *   .execute();
 * ```
 */
export function withUpdatedTimestamp<T extends Record<string, unknown>>(
  data: T,
): T & Pick<BaseModel, 'updatedAt'> {
  return {
    ...data,
    updatedAt: new Date().toISOString(),
  };
}
