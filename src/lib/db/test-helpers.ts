import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { Pool } from 'pg';
import type { Database } from './types.js';

/**
 * Test database container and client
 */
export interface TestDatabase {
  container: StartedPostgreSqlContainer;
  db: Kysely<Database>;
  connectionString: string;
}

/**
 * Create tenants table schema
 * This matches the production migration but is created directly in tests
 */
const CREATE_TENANTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    "externalReferenceId" VARCHAR(255),
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
  );

  CREATE INDEX IF NOT EXISTS tenants_slug_idx ON tenants(slug);
  CREATE INDEX IF NOT EXISTS tenants_external_reference_id_idx ON tenants("externalReferenceId");
`;

/**
 * Create users table schema for query builder tests
 * This is a generic test schema to test various query builder features
 */
const CREATE_USERS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    role TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
    "createdAt" TEXT NOT NULL,
    age INTEGER
  );
`;

/**
 * Setup isolated test database with PostgreSQL testcontainer
 *
 * Creates a fresh PostgreSQL container and database instance for testing.
 * Each container is completely isolated with its own data.
 *
 * @returns Test database with container, Kysely instance, and connection string
 *
 * @example
 * ```typescript
 * let testDb: TestDatabase;
 *
 * before(async () => {
 *   testDb = await setupTestDatabase();
 * });
 *
 * after(async () => {
 *   await teardownTestDatabase(testDb);
 * });
 * ```
 */
export async function setupTestDatabase(): Promise<TestDatabase> {
  // Start PostgreSQL container with same version as production
  const container = await new PostgreSqlContainer('postgres:17.4').start();

  // Get connection details
  const connectionString = container.getConnectionUri();

  // Create Kysely instance
  const pool = new Pool({ connectionString });
  const db = new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
  });

  // Create schema using sql template
  await sql.raw(CREATE_TENANTS_TABLE_SQL).execute(db);

  return {
    container,
    db,
    connectionString,
  };
}

/**
 * Teardown test database and stop container
 *
 * Closes database connections and stops the PostgreSQL container.
 * Should be called in `after()` or `afterEach()` hooks.
 *
 * @param testDb - Test database to teardown
 *
 * @example
 * ```typescript
 * after(async () => {
 *   await teardownTestDatabase(testDb);
 * });
 * ```
 */
export async function teardownTestDatabase(testDb: TestDatabase): Promise<void> {
  await testDb.db.destroy();
  await testDb.container.stop();
}

/**
 * Setup isolated test database for query builder tests
 *
 * Creates a PostgreSQL testcontainer with a users table for testing
 * the generic query builder functionality.
 *
 * @returns Test database with container, Kysely instance, and connection string
 *
 * @example
 * ```typescript
 * let testDb: TestDatabase;
 *
 * before(async () => {
 *   testDb = await setupQueryBuilderTestDatabase();
 * });
 *
 * after(async () => {
 *   await teardownTestDatabase(testDb);
 * });
 * ```
 */
export async function setupQueryBuilderTestDatabase(): Promise<TestDatabase> {
  // Start PostgreSQL container with same version as production
  const container = await new PostgreSqlContainer('postgres:17.4').start();

  // Get connection details
  const connectionString = container.getConnectionUri();

  // Create Kysely instance
  const pool = new Pool({ connectionString });
  const db = new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
  });

  // Create users table schema for query builder tests
  await sql.raw(CREATE_USERS_TABLE_SQL).execute(db);

  return {
    container,
    db,
    connectionString,
  };
}

/**
 * Clean all data from test database
 *
 * Truncates all tables to provide a clean slate for each test.
 * Useful in `beforeEach()` hooks for test isolation.
 *
 * @param db - Kysely database instance
 *
 * @example
 * ```typescript
 * beforeEach(async () => {
 *   await cleanTestDatabase(testDb.db);
 * });
 * ```
 */
export async function cleanTestDatabase(db: Kysely<Database>): Promise<void> {
  await db.deleteFrom('tenants').execute();
}

/**
 * Mock tenant context for testing tenant-aware repositories with RLS
 *
 * Sets app.tenant_id PostgreSQL session variable for RLS policies.
 * Uses a transaction to ensure all operations run on the same connection
 * (session variables are connection-specific in PostgreSQL).
 *
 * @param db - Kysely database instance
 * @param tenantId - The tenant ID to set in context
 * @param fn - The function to execute with the tenant context (receives transaction instance)
 * @returns The result of the function
 *
 * @example
 * ```typescript
 * await withTenantContext(testDb.db, 'tenant-123', async (trx) => {
 *   const albums = await trx.selectFrom('albums').selectAll().execute();
 *   // albums will be scoped to tenant-123 via RLS
 * });
 * ```
 */
export async function withTenantContext<T>(
  db: Kysely<Database>,
  tenantId: string,
  fn: (trx: Kysely<Database>) => Promise<T>,
): Promise<T> {
  // Use a transaction to ensure all operations use the same connection
  // This is critical because PostgreSQL session variables are connection-specific
  return db.transaction().execute(async (trx) => {
    // Set PostgreSQL session variable for RLS policies (local to transaction)
    // Third parameter TRUE means setting is local to this transaction
    // Note: We don't set ServerContext here because tests run without HTTP middleware
    await sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`.execute(trx);

    // Execute the test function with the transaction context
    return await fn(trx);
  });
}
