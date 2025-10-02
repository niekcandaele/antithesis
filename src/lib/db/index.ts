import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { config } from '../config.js';
import type { Database } from './types.js';

/**
 * Singleton Kysely database instance
 */
let db: Kysely<Database> | undefined;

/**
 * Get or create the Kysely database instance
 *
 * Returns a singleton Kysely instance with PostgreSQL connection pooling.
 * Connection pool configuration:
 * - Max connections: config.DB_POOL_SIZE (default: 10 dev, 20 prod)
 * - Idle timeout: 30 seconds
 * - Connection timeout: 10 seconds
 *
 * @returns Kysely database instance
 *
 * @example
 * ```typescript
 * import { getDb } from './lib/db/index.js';
 *
 * const db = getDb();
 * const users = await db
 *   .selectFrom('users')
 *   .selectAll()
 *   .execute();
 * ```
 */
export function getDb(): Kysely<Database> {
  if (!db) {
    const pool = new Pool({
      host: config.DB_HOST,
      port: config.DB_PORT,
      database: config.DB_NAME,
      user: config.DB_USER,
      password: config.DB_PASSWORD,
      max: config.DB_POOL_SIZE,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    db = new Kysely<Database>({
      dialect: new PostgresDialect({ pool }),
    });
  }

  return db;
}

/**
 * Close the database connection pool
 *
 * Destroys the singleton database instance and closes all pooled connections.
 * Should be called during application shutdown.
 *
 * @example
 * ```typescript
 * import { closeDb } from './lib/db/index.js';
 *
 * // During app shutdown
 * await closeDb();
 * ```
 */
export async function closeDb(): Promise<void> {
  if (db) {
    await db.destroy();
    db = undefined;
  }
}
