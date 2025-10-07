import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Enable Row Level Security (RLS) for tenant isolation
 *
 * This migration implements PostgreSQL Row Level Security to automatically
 * enforce tenant data isolation at the database level.
 *
 * **How it works:**
 * 1. Connection pool sets app.tenant_id session variable from ServerContext
 * 2. RLS policies automatically filter all queries by tenant_id
 * 3. Application code no longer needs manual .where('tenantId', '=', tenantId)
 *
 * **Benefits:**
 * - Foolproof: Impossible to forget tenant filtering
 * - Defense-in-depth: Database enforces isolation
 * - Simpler code: No manual tenant filtering needed
 *
 * **Tables protected:**
 * - albums: User-created albums (tenant-scoped)
 * - photos: Photos within albums (tenant-scoped)
 * - user_roles: User-role assignments per tenant (tenant-scoped)
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  // Enable RLS on tenant-scoped tables
  // FORCE ensures RLS applies even to table owners (important for superuser connections)
  await sql`ALTER TABLE albums ENABLE ROW LEVEL SECURITY`.execute(db);
  await sql`ALTER TABLE albums FORCE ROW LEVEL SECURITY`.execute(db);

  await sql`ALTER TABLE photos ENABLE ROW LEVEL SECURITY`.execute(db);
  await sql`ALTER TABLE photos FORCE ROW LEVEL SECURITY`.execute(db);

  await sql`ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY`.execute(db);
  await sql`ALTER TABLE user_roles FORCE ROW LEVEL SECURITY`.execute(db);

  // Create RLS policies that check app.tenant_id session variable
  // NULLIF converts empty string to NULL (for queries without tenant context)
  // current_setting('app.tenant_id', TRUE) returns the session variable (TRUE = don't error if not set)

  await sql`
    CREATE POLICY tenant_isolation_policy ON albums
      FOR ALL
      USING (
        "tenantId" = NULLIF(current_setting('app.tenant_id', TRUE), '')::uuid
      )
      WITH CHECK (
        "tenantId" = NULLIF(current_setting('app.tenant_id', TRUE), '')::uuid
      )
  `.execute(db);

  await sql`
    CREATE POLICY tenant_isolation_policy ON photos
      FOR ALL
      USING (
        "tenantId" = NULLIF(current_setting('app.tenant_id', TRUE), '')::uuid
      )
      WITH CHECK (
        "tenantId" = NULLIF(current_setting('app.tenant_id', TRUE), '')::uuid
      )
  `.execute(db);

  await sql`
    CREATE POLICY tenant_isolation_policy ON user_roles
      FOR ALL
      USING (
        "tenantId" = NULLIF(current_setting('app.tenant_id', TRUE), '')::uuid
      )
      WITH CHECK (
        "tenantId" = NULLIF(current_setting('app.tenant_id', TRUE), '')::uuid
      )
  `.execute(db);

  // Note: We don't need separate policies for SELECT/INSERT/UPDATE/DELETE
  // The USING clause applies to all operations by default
}

/**
 * Disable Row Level Security
 *
 * Rollback migration that removes RLS policies and disables RLS.
 * After rollback, application code must manually filter by tenant_id.
 */
export async function down(db: Kysely<unknown>): Promise<void> {
  // Drop RLS policies
  await sql`DROP POLICY IF EXISTS tenant_isolation_policy ON albums`.execute(db);
  await sql`DROP POLICY IF EXISTS tenant_isolation_policy ON photos`.execute(db);
  await sql`DROP POLICY IF EXISTS tenant_isolation_policy ON user_roles`.execute(db);

  // Disable RLS
  await sql`ALTER TABLE albums DISABLE ROW LEVEL SECURITY`.execute(db);
  await sql`ALTER TABLE photos DISABLE ROW LEVEL SECURITY`.execute(db);
  await sql`ALTER TABLE user_roles DISABLE ROW LEVEL SECURITY`.execute(db);
}
