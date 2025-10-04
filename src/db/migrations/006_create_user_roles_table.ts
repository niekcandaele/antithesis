import { Kysely, sql } from 'kysely';

/**
 * Create user_roles junction table
 *
 * This migration creates a many-to-many relationship table between users and roles:
 * - Composite primary key on (userId, roleId, tenantId) for tenant-scoped roles
 * - Foreign keys with cascade delete
 * - Roles are tenant-scoped, meaning a user can have different roles in different tenants
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('user_roles')
    .addColumn('userId', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('roleId', 'uuid', (col) => col.notNull().references('roles.id').onDelete('cascade'))
    .addColumn('tenantId', 'uuid', (col) =>
      col.notNull().references('tenants.id').onDelete('cascade'),
    )
    .addColumn('createdAt', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint('user_roles_pkey', ['userId', 'roleId', 'tenantId'])
    .execute();

  // Index userId for efficient lookup of roles for a user
  await db.schema.createIndex('user_roles_user_id_idx').on('user_roles').column('userId').execute();

  // Index roleId for efficient lookup of users with a role
  await db.schema.createIndex('user_roles_role_id_idx').on('user_roles').column('roleId').execute();

  // Index tenantId for efficient lookup of user-role assignments in a tenant
  await db.schema
    .createIndex('user_roles_tenant_id_idx')
    .on('user_roles')
    .column('tenantId')
    .execute();

  // Composite index for efficient lookup of a user's roles in a specific tenant
  await db.schema
    .createIndex('user_roles_user_tenant_idx')
    .on('user_roles')
    .columns(['userId', 'tenantId'])
    .execute();
}

/**
 * Drop user_roles table
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('user_roles').execute();
}
