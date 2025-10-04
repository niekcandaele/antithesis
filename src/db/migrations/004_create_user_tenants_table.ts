import { Kysely, sql } from 'kysely';

/**
 * Create user_tenants junction table
 *
 * This migration creates a many-to-many relationship table between users and tenants:
 * - Composite primary key on (userId, tenantId)
 * - Foreign keys with cascade delete (if user or tenant deleted, relationship removed)
 * - Timestamp for when relationship was created
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('user_tenants')
    .addColumn('userId', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('tenantId', 'uuid', (col) =>
      col.notNull().references('tenants.id').onDelete('cascade'),
    )
    .addColumn('createdAt', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint('user_tenants_pkey', ['userId', 'tenantId'])
    .execute();

  // Index userId for efficient lookup of tenants for a user
  await db.schema
    .createIndex('user_tenants_user_id_idx')
    .on('user_tenants')
    .column('userId')
    .execute();

  // Index tenantId for efficient lookup of users for a tenant
  await db.schema
    .createIndex('user_tenants_tenant_id_idx')
    .on('user_tenants')
    .column('tenantId')
    .execute();
}

/**
 * Drop user_tenants table
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('user_tenants').execute();
}
