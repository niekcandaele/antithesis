import * as path from 'node:path';
import { promises as fs, existsSync } from 'node:fs';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { Pool } from 'pg';
import { FileMigrationProvider, Migrator } from 'kysely';
import type { Database } from './types.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

const log = logger('migrations');

/**
 * Get the migration folder path based on the environment
 * - In development: uses TypeScript source files in src/db/migrations
 * - In production: uses compiled JavaScript in dist/db/migrations
 */
function getMigrationFolder(): string {
  const srcPath = path.join(process.cwd(), 'src/db/migrations');
  const distPath = path.join(process.cwd(), 'dist/db/migrations');

  // Check if we're running from compiled output (production)
  // by checking if dist folder exists
  if (existsSync(distPath)) {
    return distPath;
  }

  return srcPath;
}

/**
 * Create a database connection for migrations using admin credentials
 *
 * Migrations require elevated privileges to create/alter tables and RLS policies.
 * Uses DB_ADMIN_USER if set, otherwise falls back to DB_USER.
 *
 * @returns Kysely database instance with admin privileges
 */
function getAdminDbForMigrations(): Kysely<Database> {
  const pool = new Pool({
    host: config.DB_HOST,
    port: config.DB_PORT,
    database: config.DB_NAME,
    // Use admin credentials if available, otherwise fallback to regular credentials
    user: config.DB_ADMIN_USER ?? config.DB_USER,
    password: config.DB_ADMIN_PASSWORD ?? config.DB_PASSWORD,
    max: 5, // Smaller pool for migrations
  });

  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
  });
}

/**
 * Run database migrations
 *
 * Executes all pending migrations from src/db/migrations/ directory.
 * Behavior is environment-aware:
 * - Development: Auto-runs migrations on application start
 * - Production: Must be run manually via `npm run migrate`
 *
 * Migration files must export up() and down() functions:
 * - up(): Apply the migration (create tables, add columns, etc.)
 * - down(): Rollback the migration (drop tables, remove columns, etc.)
 *
 * @throws {Error} If migration fails
 *
 * @example
 * ```typescript
 * // src/db/migrations/001_create_users.ts
 * import { Kysely, sql } from 'kysely';
 *
 * export async function up(db: Kysely<any>) {
 *   await db.schema
 *     .createTable('users')
 *     .addColumn('id', 'uuid', (col) =>
 *       col.primaryKey().defaultTo(sql`gen_random_uuid()`)
 *     )
 *     .addColumn('tenantId', 'uuid', (col) => col.notNull())
 *     .addColumn('name', 'text', (col) => col.notNull())
 *     .addColumn('email', 'text', (col) => col.notNull().unique())
 *     .addColumn('createdAt', 'timestamp', (col) =>
 *       col.notNull().defaultTo(sql`now()`)
 *     )
 *     .addColumn('updatedAt', 'timestamp', (col) =>
 *       col.notNull().defaultTo(sql`now()`)
 *     )
 *     .execute();
 *
 *   await db.schema
 *     .createIndex('users_tenant_id_idx')
 *     .on('users')
 *     .column('tenantId')
 *     .execute();
 * }
 *
 * export async function down(db: Kysely<any>) {
 *   await db.schema.dropTable('users').execute();
 * }
 * ```
 */
export async function runMigrations(): Promise<void> {
  // Use admin credentials for migrations (requires elevated privileges)
  const db = getAdminDbForMigrations();

  try {
    const migrator = new Migrator({
      db,
      provider: new FileMigrationProvider({
        fs,
        path,
        migrationFolder: getMigrationFolder(),
      }),
    });

    // In development, auto-run migrations
    // In production, migrations must be run manually via npm run migrate
    if (config.NODE_ENV === 'development') {
      log.info('Running database migrations (auto-run in development)');

      const { error, results } = await migrator.migrateToLatest();

      results?.forEach((result) => {
        if (result.status === 'Success') {
          log.info(`Migration "${result.migrationName}" executed successfully`);
        } else if (result.status === 'Error') {
          log.error(`Migration "${result.migrationName}" failed`);
        }
      });

      if (error) {
        log.error('Failed to run migrations', { error });
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw error;
      }

      log.info('Migrations complete');

      // Grant permissions to app user after migrations
      if (config.DB_USER !== config.DB_ADMIN_USER) {
        log.info(`Granting permissions to app user: ${config.DB_USER}`);
        await sql`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${sql.ref(config.DB_USER)}`.execute(
          db,
        );
        await sql`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${sql.ref(config.DB_USER)}`.execute(
          db,
        );
        log.info('Permissions granted successfully');
      }
    } else {
      log.info(
        'Skipping auto-migration in production. Run migrations manually via `npm run migrate`',
      );
    }
  } finally {
    // Clean up admin connection
    await db.destroy();
  }
}

/**
 * Run migrations manually (for production)
 *
 * This function always runs migrations regardless of environment.
 * Used by the migrate CLI script (src/lib/db/migrate-cli.ts).
 *
 * @throws {Error} If migration fails
 *
 * @example
 * ```bash
 * # Run via npm script
 * npm run migrate
 * ```
 */
export async function runMigrationsManually(): Promise<void> {
  // Use admin credentials for migrations (requires elevated privileges)
  const db = getAdminDbForMigrations();

  try {
    const migrator = new Migrator({
      db,
      provider: new FileMigrationProvider({
        fs,
        path,
        migrationFolder: getMigrationFolder(),
      }),
    });

    log.info('Running database migrations manually');

    const { error, results } = await migrator.migrateToLatest();

    results?.forEach((result) => {
      if (result.status === 'Success') {
        log.info(`Migration "${result.migrationName}" executed successfully`);
      } else if (result.status === 'Error') {
        log.error(`Migration "${result.migrationName}" failed`);
      }
    });

    if (error) {
      log.error('Failed to run migrations', { error });
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw error;
    }

    log.info('Migrations complete');

    // Grant permissions to app user after migrations
    if (config.DB_USER !== config.DB_ADMIN_USER) {
      log.info(`Granting permissions to app user: ${config.DB_USER}`);
      await sql`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${sql.ref(config.DB_USER)}`.execute(
        db,
      );
      await sql`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${sql.ref(config.DB_USER)}`.execute(
        db,
      );
      log.info('Permissions granted successfully');
    }
  } finally {
    // Clean up admin connection
    await db.destroy();
  }
}
