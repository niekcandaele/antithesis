import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Enable Row Level Security (RLS) for junction tables
 *
 * This migration adds RLS to junction tables that link users to tenants,
 * enforcing tenant isolation through relationship filtering.
 *
 * **Tables protected:**
 * - user_tenants: Users can only see relationships for their current tenant
 *
 * **Tables NOT protected:**
 * - users: Global entities that can belong to multiple tenants
 * - tenants: Global metadata about tenants (access controlled via user_tenants)
 * - roles: Global and code-defined, visible to all
 *
 * **Why tenants table has NO RLS:**
 * The tenants table is global metadata, not tenant-scoped data. Tenant isolation
 * is enforced through the user_tenants junction table, which controls which users
 * can access which tenants. Enabling RLS on tenants would break tenant provisioning
 * during login (chicken-and-egg problem with INSERT...RETURNING requiring SELECT access).
 *
 * **How it works:**
 * Policies use the app.tenant_id session variable set by the connection pool.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  // Enable RLS on user_tenants junction table
  await sql`ALTER TABLE user_tenants ENABLE ROW LEVEL SECURITY`.execute(db);
  await sql`ALTER TABLE user_tenants FORCE ROW LEVEL SECURITY`.execute(db);

  // User-tenants SELECT policy: Users can see their own relationships OR relationships for current tenant
  // This allows tenant resolution to work (query user's tenants before tenant context is set)
  await sql`
    CREATE POLICY user_tenant_select_policy ON user_tenants
      FOR SELECT
      USING (
        "userId" = NULLIF(current_setting('app.user_id', TRUE), '')::uuid
        OR "tenantId" = NULLIF(current_setting('app.tenant_id', TRUE), '')::uuid
      )
  `.execute(db);

  await sql`
    CREATE POLICY user_tenant_update_policy ON user_tenants
      FOR UPDATE
      USING (
        "tenantId" = NULLIF(current_setting('app.tenant_id', TRUE), '')::uuid
      )
      WITH CHECK (
        "tenantId" = NULLIF(current_setting('app.tenant_id', TRUE), '')::uuid
      )
  `.execute(db);

  await sql`
    CREATE POLICY user_tenant_delete_policy ON user_tenants
      FOR DELETE
      USING (
        "tenantId" = NULLIF(current_setting('app.tenant_id', TRUE), '')::uuid
      )
  `.execute(db);

  // User-tenants INSERT policy: Allow all (for initial user-tenant provisioning during login)
  // This is safe because the service layer controls tenant assignment based on Keycloak org membership
  await sql`
    CREATE POLICY user_tenant_insert_policy ON user_tenants
      FOR INSERT
      WITH CHECK (true)
  `.execute(db);

  // Note: users, tenants, and roles tables do NOT get RLS
  // - users: Global entities that can belong to multiple tenants (tenant membership via user_tenants)
  // - tenants: Global metadata about tenants (access controlled via user_tenants junction table)
  // - roles: Global and code-defined, all tenants share the same role definitions (admin, user, viewer)
}

/**
 * Disable Row Level Security on junction tables
 *
 * Rollback migration that removes RLS policies and disables RLS.
 */
export async function down(db: Kysely<unknown>): Promise<void> {
  // Drop RLS policies
  await sql`DROP POLICY IF EXISTS user_tenant_select_policy ON user_tenants`.execute(db);
  await sql`DROP POLICY IF EXISTS user_tenant_update_policy ON user_tenants`.execute(db);
  await sql`DROP POLICY IF EXISTS user_tenant_delete_policy ON user_tenants`.execute(db);
  await sql`DROP POLICY IF EXISTS user_tenant_insert_policy ON user_tenants`.execute(db);

  // Disable RLS
  await sql`ALTER TABLE user_tenants DISABLE ROW LEVEL SECURITY`.execute(db);
}
