import { Kysely } from 'kysely';

/**
 * Add keycloakOrganizationId column to tenants table
 *
 * This migration adds support for linking tenants to Keycloak Organizations:
 * - keycloakOrganizationId: UUID of the organization in Keycloak
 * - Nullable to support tenants created before Keycloak integration
 * - Indexed for efficient lookups
 * - Unique to ensure 1:1 mapping between tenant and organization
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  // Add keycloakOrganizationId column
  await db.schema
    .alterTable('tenants')
    .addColumn('keycloakOrganizationId', 'varchar(255)')
    .execute();

  // Create unique index on keycloakOrganizationId for efficient lookups
  await db.schema
    .createIndex('tenants_keycloak_organization_id_idx')
    .on('tenants')
    .column('keycloakOrganizationId')
    .unique()
    .execute();
}

/**
 * Remove keycloakOrganizationId column from tenants table
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  // Drop index first
  await db.schema.dropIndex('tenants_keycloak_organization_id_idx').execute();

  // Drop column
  await db.schema.alterTable('tenants').dropColumn('keycloakOrganizationId').execute();
}
