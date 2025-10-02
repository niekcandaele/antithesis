import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { FileMigrationProvider, Migrator } from 'kysely';
import { getDb } from './index.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

const log = logger('migrations');

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
  const db = getDb();

  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(process.cwd(), 'src/db/migrations'),
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
  } else {
    log.info(
      'Skipping auto-migration in production. Run migrations manually via `npm run migrate`',
    );
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
  const db = getDb();

  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(process.cwd(), 'src/db/migrations'),
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
}
