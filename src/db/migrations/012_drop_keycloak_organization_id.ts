import { Kysely } from 'kysely';

/**
 * Drop keycloakOrganizationId column from tenants table
 *
 * This migration removes Keycloak Organization integration:
 * - Drops unique index on keycloakOrganizationId
 * - Drops keycloakOrganizationId column entirely
 * - Part of migration to OIDC-only authentication (no Admin API)
 * - User-tenant relationships now managed via user_tenants table only
 *
 * Safe for greenfield application (no production data to migrate).
 * Rollback possible via down() if needed.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  // Drop unique index first
  await db.schema.dropIndex('tenants_keycloak_organization_id_idx').execute();

  // Drop keycloakOrganizationId column
  await db.schema.alterTable('tenants').dropColumn('keycloakOrganizationId').execute();
}

/**
 * Restore keycloakOrganizationId column (rollback)
 *
 * Adds column back as nullable for rollback capability.
 * Note: Data will be lost if migration was run and then rolled back.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  // Add keycloakOrganizationId column back (nullable)
  await db.schema
    .alterTable('tenants')
    .addColumn('keycloakOrganizationId', 'varchar(255)')
    .execute();

  // Recreate unique index
  await db.schema
    .createIndex('tenants_keycloak_organization_id_idx')
    .on('tenants')
    .column('keycloakOrganizationId')
    .unique()
    .execute();
}
