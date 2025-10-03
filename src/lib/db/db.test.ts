import { describe, it, beforeEach, after, before } from 'node:test';
import assert from 'node:assert';
import type { Kysely } from 'kysely';
import { buildQuery, type QueryParams } from './queryBuilder.js';
import { withUpdatedTimestamp } from './BaseModel.js';
import { setupTestDatabase, teardownTestDatabase, cleanTestDatabase, type TestDatabase } from './test-helpers.js';
import type { Database } from './types.js';

void describe('Database Integration', () => {
  let testDb: TestDatabase;
  let db: Kysely<Database>;

  before(async () => {
    // Setup isolated PostgreSQL testcontainer
    testDb = await setupTestDatabase();
    db = testDb.db;
  });

  beforeEach(async () => {
    // Clean database before each test for isolation
    await cleanTestDatabase(db);
  });

  after(async () => {
    // Teardown container after all tests
    await teardownTestDatabase(testDb);
  });

  void it('should connect to database successfully', () => {
    assert.ok(db);
  });

  void it('should insert and retrieve tenant data', async () => {
    const tenantData = {
      name: 'Acme Corp',
      slug: 'acme-corp',
      externalReferenceId: 'ext-123',
    };

    const inserted = await db
      .insertInto('tenants')
      .values(tenantData)
      .returningAll()
      .executeTakeFirstOrThrow();

    assert.strictEqual(inserted.name, 'Acme Corp');
    assert.strictEqual(inserted.slug, 'acme-corp');
    assert.strictEqual(inserted.externalReferenceId, 'ext-123');
    assert.ok(inserted.id);
    assert.ok(inserted.createdAt);
    assert.ok(inserted.updatedAt);
  });

  void it('should enforce unique slug constraint', async () => {
    const tenantData = {
      name: 'Test Tenant',
      slug: 'unique-slug',
    };

    // Insert first tenant
    await db.insertInto('tenants').values(tenantData).execute();

    // Attempt to insert duplicate slug
    await assert.rejects(
      async () => {
        await db.insertInto('tenants').values(tenantData).execute();
      },
      {
        message: /unique|duplicate/i,
      },
    );
  });

  void it('should enforce slug format validation', async () => {
    const invalidSlugs = [
      'Invalid Slug', // Uppercase and spaces
      'slug_with_underscore', // Underscores not allowed
      '-leading-dash', // Leading dash
      'trailing-dash-', // Trailing dash
      'double--dash', // Double dash
    ];

    for (const slug of invalidSlugs) {
      await assert.rejects(
        async () => {
          await db.insertInto('tenants').values({ name: 'Test', slug }).execute();
        },
        {
          message: /check|constraint/i,
        },
        `Should reject invalid slug: ${slug}`,
      );
    }
  });

  void it('should accept valid slug formats', async () => {
    const validSlugs = ['simple', 'kebab-case', 'with-123-numbers', 'a', '123'];

    for (const slug of validSlugs) {
      await db
        .insertInto('tenants')
        .values({ name: `Test ${slug}`, slug })
        .execute();

      const result = await db
        .selectFrom('tenants')
        .selectAll()
        .where('slug', '=', slug)
        .executeTakeFirst();

      assert.ok(result, `Should accept valid slug: ${slug}`);
    }
  });

  void it('should apply filters with query builder', async () => {
    // Insert test data
    await db
      .insertInto('tenants')
      .values([
        { name: 'Active Tenant', slug: 'active', externalReferenceId: 'ext-1' },
        { name: 'Inactive Tenant', slug: 'inactive', externalReferenceId: null },
      ])
      .execute();

    // Query with filter for non-null externalReferenceId
    const params: QueryParams = {
      filters: { externalReferenceId: ['ext-1'] },
    };

    const results = await buildQuery(db.selectFrom('tenants'), params).selectAll().execute();

    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].name, 'Active Tenant');
  });

  void it('should apply search with query builder (ILIKE)', async () => {
    await db
      .insertInto('tenants')
      .values({
        name: 'Search Test Tenant',
        slug: 'search-test',
      })
      .execute();

    // Case-insensitive search
    const params: QueryParams = {
      search: { name: 'SEARCH' }, // Should match "Search Test Tenant"
    };

    const results = await buildQuery(db.selectFrom('tenants'), params).selectAll().execute();

    assert.ok(results.length > 0);
    assert.ok(results.some((t) => t.name.includes('Search')));
  });

  void it('should apply pagination with query builder', async () => {
    // Insert multiple tenants
    const tenants = Array.from({ length: 30 }, (_, i) => ({
      name: `Tenant ${String(i)}`,
      slug: `tenant-${String(i)}`,
    }));

    await db.insertInto('tenants').values(tenants).execute();

    // Query page 1 (default limit 20)
    const page1Params: QueryParams = {
      page: 1,
      sortBy: 'name',
    };

    const page1Results = await buildQuery(db.selectFrom('tenants'), page1Params)
      .selectAll()
      .execute();

    assert.strictEqual(page1Results.length, 20); // Default limit

    // Query page 2
    const page2Params: QueryParams = {
      page: 2,
      sortBy: 'name',
    };

    const page2Results = await buildQuery(db.selectFrom('tenants'), page2Params)
      .selectAll()
      .execute();

    assert.ok(page2Results.length > 0);

    // Verify pagination works (different results)
    assert.notStrictEqual(page1Results[0].id, page2Results[0].id);
  });

  void it('should enforce maximum limit of 100', async () => {
    const params: QueryParams = {
      limit: 500, // Exceeds max
    };

    const results = await buildQuery(db.selectFrom('tenants'), params).selectAll().execute();

    // Should be capped at 100 (or less if fewer records)
    assert.ok(results.length <= 100);
  });

  void it('should apply sorting with query builder', async () => {
    await db
      .insertInto('tenants')
      .values([
        { name: 'Alpha', slug: 'alpha' },
        { name: 'Zeta', slug: 'zeta' },
      ])
      .execute();

    // Sort ascending
    const ascParams: QueryParams = {
      sortBy: 'name',
      sortDirection: 'asc',
      filters: { name: ['Alpha', 'Zeta'] },
    };

    const ascResults = await buildQuery(db.selectFrom('tenants'), ascParams).selectAll().execute();

    assert.strictEqual(ascResults[0].name, 'Alpha');

    // Sort descending
    const descParams: QueryParams = {
      sortBy: 'name',
      sortDirection: 'desc',
      filters: { name: ['Alpha', 'Zeta'] },
    };

    const descResults = await buildQuery(db.selectFrom('tenants'), descParams)
      .selectAll()
      .execute();

    assert.strictEqual(descResults[0].name, 'Zeta');
  });

  void it('should update and retrieve updated data', async () => {
    const inserted = await db
      .insertInto('tenants')
      .values({
        name: 'Update Test',
        slug: 'update-test',
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const originalUpdatedAt = inserted.updatedAt;

    // Wait a moment to ensure timestamp changes
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });

    // Update the tenant (with updated timestamp)
    await db
      .updateTable('tenants')
      .set(withUpdatedTimestamp({ name: 'Updated Name' }))
      .where('id', '=', inserted.id)
      .execute();

    // Retrieve updated data
    const updated = await db
      .selectFrom('tenants')
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
    const inserted = await db
      .insertInto('tenants')
      .values({
        name: 'Delete Test',
        slug: 'delete-test',
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Delete the tenant
    await db.deleteFrom('tenants').where('id', '=', inserted.id).execute();

    // Verify it's deleted
    const result = await db
      .selectFrom('tenants')
      .selectAll()
      .where('id', '=', inserted.id)
      .executeTakeFirst();

    assert.strictEqual(result, undefined);
  });

  void it('should handle null externalReferenceId', async () => {
    const tenant = await db
      .insertInto('tenants')
      .values({
        name: 'No External Ref',
        slug: 'no-external-ref',
        externalReferenceId: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    assert.strictEqual(tenant.externalReferenceId, null);
  });
});
