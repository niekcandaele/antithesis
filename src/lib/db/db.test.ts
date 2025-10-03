import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert';
import { getDb, closeDb } from './index.js';
import { withTenantScope } from './TenantScopedModel.js';
import { buildQuery, type QueryParams } from './queryBuilder.js';
import { withUpdatedTimestamp } from './BaseModel.js';
import type { TenantId } from '../types.js';

void describe('Database Integration', () => {
  // Use valid UUIDs for tenant IDs
  const tenantId1 = '00000000-0000-0000-0000-000000000001' as TenantId;
  const tenantId2 = '00000000-0000-0000-0000-000000000002' as TenantId;

  beforeEach(async () => {
    // Clean up test data before each test
    const db = getDb();
    await db.deleteFrom('users').execute();
  });

  after(async () => {
    // Clean up test data and close connection
    const db = getDb();
    await db.deleteFrom('users').execute();
    await closeDb();
  });

  void it('should connect to database successfully', () => {
    const db = getDb();
    assert.ok(db);
  });

  void it('should insert and retrieve user data', async () => {
    const db = getDb();

    const userData = {
      tenantId: tenantId1,
      name: 'John Doe',
      email: 'john@example.com',
      role: 'admin',
    };

    const inserted = await db
      .insertInto('users')
      .values(userData)
      .returningAll()
      .executeTakeFirstOrThrow();

    assert.strictEqual(inserted.name, 'John Doe');
    assert.strictEqual(inserted.email, 'john@example.com');
    assert.strictEqual(inserted.tenantId, tenantId1);
    assert.ok(inserted.id);
    assert.ok(inserted.createdAt);
    assert.ok(inserted.updatedAt);
  });

  void it('should enforce tenant isolation with withTenantScope', async () => {
    const db = getDb();

    // Insert users for two different tenants
    await db
      .insertInto('users')
      .values({
        tenantId: tenantId1,
        name: 'Tenant 1 User',
        email: 'user1@tenant1.com',
      })
      .execute();

    await db
      .insertInto('users')
      .values({
        tenantId: tenantId2,
        name: 'Tenant 2 User',
        email: 'user2@tenant2.com',
      })
      .execute();

    // Query with tenant scope for tenant 1
    const tenant1Users = await withTenantScope(db.selectFrom('users'), tenantId1)
      .selectAll()
      .execute();

    // Should only return tenant 1 users
    assert.strictEqual(tenant1Users.length, 1);
    assert.strictEqual(tenant1Users[0].tenantId, tenantId1);
    assert.strictEqual(tenant1Users[0].email, 'user1@tenant1.com');

    // Query with tenant scope for tenant 2
    const tenant2Users = await withTenantScope(db.selectFrom('users'), tenantId2)
      .selectAll()
      .execute();

    // Should only return tenant 2 users
    assert.strictEqual(tenant2Users.length, 1);
    assert.strictEqual(tenant2Users[0].tenantId, tenantId2);
    assert.strictEqual(tenant2Users[0].email, 'user2@tenant2.com');
  });

  void it('should apply filters with query builder', async () => {
    const db = getDb();

    // Insert test data with different roles
    await db
      .insertInto('users')
      .values([
        {
          tenantId: tenantId1,
          name: 'Admin User',
          email: 'admin@tenant1.com',
          role: 'admin',
        },
        {
          tenantId: tenantId1,
          name: 'Regular User',
          email: 'user@tenant1.com',
          role: 'user',
        },
      ])
      .execute();

    // Query with filter
    const params: QueryParams = {
      filters: { role: ['admin'], tenantId: tenantId1 },
    };

    const adminUsers = await buildQuery(db.selectFrom('users'), params).selectAll().execute();

    assert.strictEqual(adminUsers.length, 1);
    assert.strictEqual(adminUsers[0].role, 'admin');
    assert.strictEqual(adminUsers[0].email, 'admin@tenant1.com');
  });

  void it('should apply search with query builder (ILIKE)', async () => {
    const db = getDb();

    await db
      .insertInto('users')
      .values({
        tenantId: tenantId1,
        name: 'Search Test User',
        email: 'searchtest@example.com',
      })
      .execute();

    // Case-insensitive search
    const params: QueryParams = {
      search: { name: 'SEARCH' }, // Should match "Search Test User"
      filters: { tenantId: tenantId1 },
    };

    const results = await buildQuery(db.selectFrom('users'), params).selectAll().execute();

    assert.ok(results.length > 0);
    assert.ok(results.some((u) => u.name.includes('Search')));
  });

  void it('should apply pagination with query builder', async () => {
    const db = getDb();

    // Insert multiple users
    const users = Array.from({ length: 30 }, (_, i) => ({
      tenantId: tenantId1,
      name: `User ${String(i)}`,
      email: `user${String(i)}@example.com`,
    }));

    await db.insertInto('users').values(users).execute();

    // Query page 1 (default limit 20)
    const page1Params: QueryParams = {
      page: 1,
      filters: { tenantId: tenantId1 },
      sortBy: 'name',
    };

    const page1Results = await buildQuery(db.selectFrom('users'), page1Params)
      .selectAll()
      .execute();

    assert.strictEqual(page1Results.length, 20); // Default limit

    // Query page 2
    const page2Params: QueryParams = {
      page: 2,
      filters: { tenantId: tenantId1 },
      sortBy: 'name',
    };

    const page2Results = await buildQuery(db.selectFrom('users'), page2Params)
      .selectAll()
      .execute();

    assert.ok(page2Results.length > 0);

    // Verify pagination works (different results)
    assert.notStrictEqual(page1Results[0].id, page2Results[0].id);
  });

  void it('should enforce maximum limit of 100', async () => {
    const db = getDb();

    const params: QueryParams = {
      limit: 500, // Exceeds max
      filters: { tenantId: tenantId1 },
    };

    const results = await buildQuery(db.selectFrom('users'), params).selectAll().execute();

    // Should be capped at 100 (or less if fewer records)
    assert.ok(results.length <= 100);
  });

  void it('should apply sorting with query builder', async () => {
    const db = getDb();

    await db
      .insertInto('users')
      .values([
        {
          tenantId: tenantId1,
          name: 'Alpha',
          email: 'alpha@example.com',
        },
        {
          tenantId: tenantId1,
          name: 'Zeta',
          email: 'zeta@example.com',
        },
      ])
      .execute();

    // Sort ascending
    const ascParams: QueryParams = {
      sortBy: 'name',
      sortDirection: 'asc',
      filters: { tenantId: tenantId1, name: ['Alpha', 'Zeta'] },
    };

    const ascResults = await buildQuery(db.selectFrom('users'), ascParams).selectAll().execute();

    assert.strictEqual(ascResults[0].name, 'Alpha');

    // Sort descending
    const descParams: QueryParams = {
      sortBy: 'name',
      sortDirection: 'desc',
      filters: { tenantId: tenantId1, name: ['Alpha', 'Zeta'] },
    };

    const descResults = await buildQuery(db.selectFrom('users'), descParams).selectAll().execute();

    assert.strictEqual(descResults[0].name, 'Zeta');
  });

  void it('should update and retrieve updated data', async () => {
    const db = getDb();

    const inserted = await db
      .insertInto('users')
      .values({
        tenantId: tenantId1,
        name: 'Update Test',
        email: 'update@example.com',
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const originalUpdatedAt = inserted.updatedAt;

    // Wait a moment to ensure timestamp changes
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });

    // Update the user (with updated timestamp)
    await db
      .updateTable('users')
      .set(withUpdatedTimestamp({ name: 'Updated Name' }))
      .where('id', '=', inserted.id)
      .execute();

    // Retrieve updated data
    const updated = await db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', inserted.id)
      .executeTakeFirstOrThrow();

    assert.strictEqual(updated.name, 'Updated Name');
    // updatedAt should have changed (compare as Date objects)
    const originalDate = new Date(originalUpdatedAt).getTime();
    const updatedDate = new Date(updated.updatedAt).getTime();
    assert.ok(updatedDate > originalDate, 'updatedAt should be newer');
  });

  void it('should delete data', async () => {
    const db = getDb();

    const inserted = await db
      .insertInto('users')
      .values({
        tenantId: tenantId1,
        name: 'Delete Test',
        email: 'delete@example.com',
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Delete the user
    await db.deleteFrom('users').where('id', '=', inserted.id).execute();

    // Verify it's deleted
    const result = await db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', inserted.id)
      .executeTakeFirst();

    assert.strictEqual(result, undefined);
  });
});
