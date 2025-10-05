import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('photos')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('tenantId', 'uuid', (col) =>
      col.notNull().references('tenants.id').onDelete('cascade'),
    )
    .addColumn('albumId', 'uuid', (col) =>
      col.notNull().references('albums.id').onDelete('cascade'),
    )
    .addColumn('title', 'varchar(255)', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('url', 'text', (col) => col.notNull())
    .addColumn('thumbnailUrl', 'text')
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
    .createIndex('idx_photos_tenant_album')
    .on('photos')
    .columns(['tenantId', 'albumId'])
    .execute();

  await db.schema
    .createIndex('idx_photos_tenant_created')
    .on('photos')
    .columns(['tenantId', 'createdAt'])
    .execute();

  await db.schema.createIndex('idx_photos_album').on('photos').columns(['albumId']).execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('photos').execute();
}
