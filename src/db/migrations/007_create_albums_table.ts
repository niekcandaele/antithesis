import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('albums')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('tenantId', 'uuid', (col) =>
      col.notNull().references('tenants.id').onDelete('cascade'),
    )
    .addColumn('name', 'varchar(255)', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('coverPhotoUrl', 'text')
    .addColumn('status', 'varchar(50)', (col) => col.notNull().defaultTo('draft'))
    .addColumn('createdByUserId', 'uuid', (col) => col.notNull().references('users.id'))
    .addColumn('isDeleted', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('deletedAt', 'timestamp')
    .addColumn('deletedByUserId', 'uuid', (col) => col.references('users.id'))
    .addColumn('createdAt', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updatedAt', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Composite indexes for common query patterns
  await db.schema
    .createIndex('idx_albums_tenant_created')
    .on('albums')
    .columns(['tenantId', 'createdAt'])
    .execute();

  await db.schema
    .createIndex('idx_albums_tenant_name')
    .on('albums')
    .columns(['tenantId', 'name'])
    .execute();

  // Partial index for active (non-deleted) albums
  await sql`
    CREATE INDEX idx_albums_tenant_active
    ON albums("tenantId", "isDeleted")
    WHERE "isDeleted" = false
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('albums').execute();
}
