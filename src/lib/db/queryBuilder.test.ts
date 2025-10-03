import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import type { Kysely } from 'kysely';
import { buildQuery, type QueryParams } from './queryBuilder.js';
import {
  setupQueryBuilderTestDatabase,
  teardownTestDatabase,
  type TestDatabase,
} from './test-helpers.js';

// Test database schema for query builder tests
interface QueryBuilderTestDatabase {
  users: {
    id: string;
    name: string;
    email: string;
    role: string;
    isActive: boolean;
    createdAt: string;
    age: number;
  };
}

void describe('Query Builder', () => {
  let testDb: TestDatabase;
  let db: Kysely<QueryBuilderTestDatabase>;

  before(async () => {
    // Setup isolated PostgreSQL testcontainer with users table
    testDb = await setupQueryBuilderTestDatabase();
    // Cast to our test schema type for type-safe query building
    db = testDb.db as unknown as Kysely<QueryBuilderTestDatabase>;
  });

  after(async () => {
    // Teardown testcontainer after all tests
    await teardownTestDatabase(testDb);
  });
  void it('should apply IN filter for array values', () => {
    const params: QueryParams = {
      filters: { role: ['admin', 'user'] },
    };

    const query = buildQuery(db.selectFrom('users'), params);
    const sql = query.compile();

    assert.ok(sql.sql.includes('in'));
    // Parameters include: ['admin', 'user', limit, offset]
    assert.ok(sql.parameters.includes('admin'));
    assert.ok(sql.parameters.includes('user'));
  });

  void it('should apply equality filter for single values', () => {
    const params: QueryParams = {
      filters: { isActive: true },
    };

    const query = buildQuery(db.selectFrom('users'), params);
    const sql = query.compile();

    assert.ok(sql.sql.includes('='));
    // Parameters include: [true, limit, offset]
    assert.ok(sql.parameters.includes(true));
  });

  void it('should apply IS NULL filter for null values', () => {
    const params: QueryParams = {
      filters: { email: null },
    };

    const query = buildQuery(db.selectFrom('users'), params);
    const sql = query.compile();

    assert.ok(sql.sql.includes('is null'));
  });

  void it('should apply ILIKE search for case-insensitive matching', () => {
    const params: QueryParams = {
      search: { name: 'john' },
    };

    const query = buildQuery(db.selectFrom('users'), params);
    const sql = query.compile();

    // SQLite doesn't have ILIKE, but the code should generate it
    // The actual ILIKE functionality is PostgreSQL-specific
    assert.ok(sql.sql.toLowerCase().includes('ilike') || sql.sql.includes('LIKE'));
    assert.ok(sql.parameters.some((p) => String(p).includes('%john%')));
  });

  void it('should apply greaterThan filter', () => {
    const params: QueryParams = {
      greaterThan: { age: 18 },
    };

    const query = buildQuery(db.selectFrom('users'), params);
    const sql = query.compile();

    assert.ok(sql.sql.includes('>'));
    // Parameters include: [18, limit, offset]
    assert.ok(sql.parameters.includes(18));
  });

  void it('should apply lessThan filter', () => {
    const params: QueryParams = {
      lessThan: { age: 65 },
    };

    const query = buildQuery(db.selectFrom('users'), params);
    const sql = query.compile();

    assert.ok(sql.sql.includes('<'));
    // Parameters include: [65, limit, offset]
    assert.ok(sql.parameters.includes(65));
  });

  void it('should apply sorting with default asc direction', () => {
    const params: QueryParams = {
      sortBy: 'createdAt',
    };

    const query = buildQuery(db.selectFrom('users'), params);
    const sql = query.compile();

    assert.ok(sql.sql.includes('order by'));
    assert.ok(sql.sql.toLowerCase().includes('asc') || !sql.sql.toLowerCase().includes('desc'));
  });

  void it('should apply sorting with desc direction', () => {
    const params: QueryParams = {
      sortBy: 'createdAt',
      sortDirection: 'desc',
    };

    const query = buildQuery(db.selectFrom('users'), params);
    const sql = query.compile();

    assert.ok(sql.sql.includes('order by'));
    assert.ok(sql.sql.toLowerCase().includes('desc'));
  });

  void it('should apply default pagination (limit 20, page 1)', () => {
    const params: QueryParams = {};

    const query = buildQuery(db.selectFrom('users'), params);
    const sql = query.compile();

    assert.ok(sql.sql.includes('limit'));
    assert.ok(sql.sql.includes('offset'));
    // Default: limit 20, offset 0
    assert.ok(sql.parameters.includes(20));
    assert.ok(sql.parameters.includes(0));
  });

  void it('should apply custom pagination', () => {
    const params: QueryParams = {
      page: 3,
      limit: 50,
    };

    const query = buildQuery(db.selectFrom('users'), params);
    const sql = query.compile();

    assert.ok(sql.sql.includes('limit'));
    assert.ok(sql.sql.includes('offset'));
    // Page 3 with limit 50: offset = (3-1) * 50 = 100
    assert.ok(sql.parameters.includes(50));
    assert.ok(sql.parameters.includes(100));
  });

  void it('should enforce maximum limit of 100', () => {
    const params: QueryParams = {
      limit: 500, // Exceeds max
    };

    const query = buildQuery(db.selectFrom('users'), params);
    const sql = query.compile();

    // Should be capped at 100
    assert.ok(sql.parameters.includes(100));
    assert.ok(!sql.parameters.includes(500));
  });

  void it('should combine multiple filters', () => {
    const params: QueryParams = {
      filters: { role: ['admin', 'user'], isActive: true },
      search: { name: 'john' },
      greaterThan: { age: 18 },
      lessThan: { age: 65 },
      sortBy: 'createdAt',
      sortDirection: 'desc',
      page: 2,
      limit: 25,
    };

    const query = buildQuery(db.selectFrom('users'), params);
    const sql = query.compile();

    // Verify all operations are present
    assert.ok(sql.sql.includes('in')); // IN filter
    assert.ok(sql.sql.includes('=')); // Equality filter
    assert.ok(sql.sql.toLowerCase().includes('ilike') || sql.sql.includes('LIKE')); // Search
    assert.ok(sql.sql.includes('>')); // Greater than
    assert.ok(sql.sql.includes('<')); // Less than
    assert.ok(sql.sql.includes('order by')); // Sorting
    assert.ok(sql.sql.toLowerCase().includes('desc')); // Sort direction
    assert.ok(sql.sql.includes('limit')); // Limit
    assert.ok(sql.sql.includes('offset')); // Offset

    // Verify pagination: page 2 with limit 25 = offset 25
    assert.ok(sql.parameters.includes(25)); // Both limit and offset
  });

  void it('should handle empty parameters', () => {
    const params: QueryParams = {};

    const query = buildQuery(db.selectFrom('users'), params);
    const sql = query.compile();

    // Should still have limit and offset (defaults)
    assert.ok(sql.sql.includes('limit'));
    assert.ok(sql.sql.includes('offset'));
  });

  void it('should handle empty search value', () => {
    const params: QueryParams = {
      search: { name: '' },
    };

    const query = buildQuery(db.selectFrom('users'), params);
    const sql = query.compile();

    // Empty search should be ignored
    assert.ok(!sql.sql.toLowerCase().includes('ilike'));
  });
});
