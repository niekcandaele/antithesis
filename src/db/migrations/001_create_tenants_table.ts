import { Kysely, sql } from 'kysely';

/**
 * Create tenants table
 *
 * This migration creates a tenants table with:
 * - UUID primary key with auto-generation
 * - Name for display purposes
 * - URL-friendly slug with validation
 * - External reference ID for integration with external systems
 * - Standard timestamp fields (createdAt, updatedAt)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('tenants')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('slug', 'text', (col) => col.notNull().unique())
    .addColumn('externalReferenceId', 'varchar(255)')
    .addColumn('createdAt', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updatedAt', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint('slug_format', sql`slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`)
    .execute();

  // Index slug for efficient lookups
  await db.schema.createIndex('tenants_slug_idx').on('tenants').column('slug').execute();

  // Index externalReferenceId for integration lookups
  await db.schema
    .createIndex('tenants_external_reference_id_idx')
    .on('tenants')
    .column('externalReferenceId')
    .execute();
}

/**
 * Drop tenants table
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('tenants').execute();
}
