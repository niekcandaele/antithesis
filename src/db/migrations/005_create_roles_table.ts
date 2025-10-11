import { Kysely, sql } from 'kysely';

/**
 * Create roles table
 *
 * This migration creates a roles table for code-defined roles:
 * - UUID primary key with auto-generation
 * - Name (unique) for role identification (e.g., 'admin', 'user', 'viewer')
 * - Standard timestamp fields (createdAt, updatedAt)
 *
 * Roles are code-defined and seeded by the application, not user-created.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('roles')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('name', 'varchar(255)', (col) => col.notNull().unique())
    .addColumn('createdAt', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updatedAt', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Index name for efficient lookups by role name
  await db.schema.createIndex('roles_name_idx').on('roles').column('name').execute();
}

/**
 * Drop roles table
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('roles').execute();
}
