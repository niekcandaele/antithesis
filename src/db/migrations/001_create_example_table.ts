import { Kysely, sql } from 'kysely';

/**
 * Create example users table
 *
 * This migration creates a users table demonstrating:
 * - UUID primary key with auto-generation
 * - Tenant scoping via tenantId column
 * - Standard BaseModel fields (id, createdAt, updatedAt)
 * - Indexed tenantId for query performance
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('users')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('tenantId', 'uuid', (col) => col.notNull())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('email', 'text', (col) => col.notNull().unique())
    .addColumn('role', 'text', (col) => col.notNull().defaultTo('user'))
    .addColumn('isActive', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('createdAt', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updatedAt', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Index tenantId for efficient tenant-scoped queries
  await db.schema.createIndex('users_tenant_id_idx').on('users').column('tenantId').execute();

  // Index email for lookups
  await db.schema.createIndex('users_email_idx').on('users').column('email').execute();
}

/**
 * Drop example users table
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('users').execute();
}
