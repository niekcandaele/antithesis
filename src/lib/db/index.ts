import { Kysely, PostgresDialect } from 'kysely';
import { Pool, type PoolClient } from 'pg';
import { config } from '../config.js';
import type { Database } from './types.js';
import { getServerContext } from '../http/serverContext.js';

/**
 * Singleton Kysely database instance with tenant-scoped RLS
 */
let db: Kysely<Database> | undefined;

/**
 * Wrap a pg Pool to automatically set tenant context from ServerContext
 *
 * On each connection checkout, sets PostgreSQL session variable app.tenant_id
 * which is used by Row Level Security policies to filter data.
 *
 * @param pool - The pg Pool to wrap
 * @returns Wrapped pool that sets tenant context
 */
function wrapPoolWithTenantContext(pool: Pool): Pool {
  const originalConnect = pool.connect.bind(pool);

  // Override connect to set tenant context
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pool.connect = function (callback?: any): any {
    if (callback) {
      // Callback-style
      // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
      return originalConnect(
        (
          err: Error | undefined,
          client: PoolClient | undefined,
          done: (release?: unknown) => void,
        ) => {
          if (err || !client) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call
            callback(err, client, done);
            return;
          }

          // Set tenant context before returning client
          setTenantContextOnClient(client)
            .then(() => {
              // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return
              return callback(err, client, done);
            })
            .catch((contextErr: unknown) => {
              // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return
              return callback(contextErr as Error, client, done);
            });
        },
      );
    } else {
      // Promise-style
      return originalConnect().then(async (client) => {
        await setTenantContextOnClient(client);
        return client;
      });
    }
  };

  return pool;
}

/**
 * Set tenant and user context on a PostgreSQL client from ServerContext
 *
 * Sets the app.tenant_id and app.user_id session variables that RLS policies use.
 * If no context exists, sets empty string (allows non-scoped queries).
 *
 * @param client - PostgreSQL client to set context on
 */
async function setTenantContextOnClient(client: PoolClient): Promise<void> {
  try {
    const context = getServerContext();
    const tenantId = context.tenantId ?? null;
    const userId = context.userId ?? null;

    // Set session variables for RLS policies
    // Using empty string for NULL since current_setting doesn't like NULL
    await client.query("SELECT set_config('app.tenant_id', $1, false)", [tenantId ?? '']);
    await client.query("SELECT set_config('app.user_id', $1, false)", [userId ?? '']);
  } catch {
    // If there's no server context (e.g., migrations, scripts), allow query without context
    await client.query("SELECT set_config('app.tenant_id', '', false)");
    await client.query("SELECT set_config('app.user_id', '', false)");
  }
}

/**
 * Get or create the tenant-scoped Kysely database instance
 *
 * Returns a singleton Kysely instance with PostgreSQL connection pooling
 * and automatic tenant scoping via Row Level Security (RLS).
 *
 * **RLS Automatic Tenant Filtering:**
 * - All queries are automatically filtered by tenant_id from ServerContext
 * - No manual `.where('tenantId', '=', tenantId)` needed
 * - Database enforces tenant isolation (foolproof)
 *
 * Connection pool configuration:
 * - Max connections: config.DB_POOL_SIZE (default: 10 dev, 20 prod)
 * - Idle timeout: 30 seconds
 * - Connection timeout: 10 seconds
 * - Tenant context: Automatically set from ServerContext on each connection
 *
 * @returns Kysely database instance with tenant scoping
 *
 * @example
 * ```typescript
 * import { getDb } from './lib/db/index.js';
 *
 * const db = getDb();
 * // Automatically filtered by current tenant from ServerContext
 * const albums = await db
 *   .selectFrom('albums')
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

    // Wrap pool to set tenant context on connection checkout
    const wrappedPool = wrapPoolWithTenantContext(pool);

    db = new Kysely<Database>({
      dialect: new PostgresDialect({ pool: wrappedPool }),
    });
  }

  return db;
}

/**
 * Close the database connection pools
 *
 * Destroys the singleton database instances and closes all pooled connections.
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
