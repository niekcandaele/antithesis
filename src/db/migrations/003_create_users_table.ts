import { Kysely, sql } from 'kysely';

/**
 * Create users table
 *
 * This migration creates a users table for authentication:
 * - UUID primary key with auto-generation
 * - Email from Keycloak (unique)
 * - Keycloak user ID (unique) for linking to Keycloak
 * - Last tenant ID for defaulting multi-tenant users
 * - Standard timestamp fields (createdAt, updatedAt)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('users')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('email', 'varchar(255)', (col) => col.notNull().unique())
    .addColumn('keycloakUserId', 'varchar(255)', (col) => col.notNull().unique())
    .addColumn('lastTenantId', 'uuid')
    .addColumn('createdAt', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updatedAt', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Index email for efficient lookups
  await db.schema.createIndex('users_email_idx').on('users').column('email').execute();

  // Index keycloakUserId for efficient lookups during authentication
  await db.schema
    .createIndex('users_keycloak_user_id_idx')
    .on('users')
    .column('keycloakUserId')
    .execute();

  // Index lastTenantId for efficient lookups when determining default tenant
  await db.schema
    .createIndex('users_last_tenant_id_idx')
    .on('users')
    .column('lastTenantId')
    .execute();
}

/**
 * Drop users table
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('users').execute();
}
