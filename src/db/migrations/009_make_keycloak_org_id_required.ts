import { Kysely } from 'kysely';

/**
 * Make keycloakOrganizationId column required on tenants table
 *
 * This migration enforces that every tenant MUST have a Keycloak organization:
 * - Deletes any tenants without keycloakOrganizationId (orphaned tenants)
 * - Makes keycloakOrganizationId column NOT NULL
 * - Ensures data integrity between application and Keycloak
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  // Delete any tenants without keycloakOrganizationId
  // These are orphaned tenants that have no Keycloak organization
  await db.deleteFrom('tenants').where('keycloakOrganizationId', 'is', null).execute();

  // Make keycloakOrganizationId column NOT NULL
  await db.schema
    .alterTable('tenants')
    .alterColumn('keycloakOrganizationId', (col) => col.setNotNull())
    .execute();
}

/**
 * Revert keycloakOrganizationId to nullable
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  // Make keycloakOrganizationId column nullable again
  await db.schema
    .alterTable('tenants')
    .alterColumn('keycloakOrganizationId', (col) => col.dropNotNull())
    .execute();
}
