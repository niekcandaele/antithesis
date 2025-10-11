import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { HTTP } from '../lib/http/index.js';
import { albumsController } from '../controllers/albums/albums.controller.js';
import { closeDb } from '../lib/db/index.js';
import { tenantResolution } from '../lib/http/middleware/tenantResolution.middleware.js';
import { runMigrations } from '../lib/db/migrations.js';
import { Redis } from '../lib/redis.js';
import { config } from '../lib/config.js';
import type { Database } from '../lib/db/types.js';

/**
 * Row Level Security (RLS) Integration Tests
 *
 * Tests tenant isolation at the HTTP API level, verifying that:
 * 1. Users can only access their tenant's data
 * 2. Cross-tenant read/update/delete operations are blocked
 * 3. Unauthenticated requests have no access
 * 4. There is NO bypass mechanism - tenant isolation is absolute
 *
 * Uses the full production stack:
 * - HTTP server with tenant resolution middleware
 * - JWT-based authentication
 * - PostgreSQL RLS policies
 * - ServerContext for tenant scoping
 *
 * Test setup uses the postgres superuser to create test data,
 * but the application itself has no admin bypass capabilities.
 */
void describe('RLS Integration Tests via HTTP API', () => {
  let server: HTTP;
  let pgContainer: StartedPostgreSqlContainer;
  let redisContainer: StartedRedisContainer;
  let originalEnv: Record<string, string | undefined>;
  const port = 3053; // Unique test port

  // Test data IDs
  let tenant1Id: string;
  let tenant2Id: string;
  let user1Id: string;
  let user2Id: string;
  let album1Id: string;
  let album2Id: string;

  /**
   * Create a test JWT token with tenant_id claim
   * This simulates a real Keycloak JWT for testing tenant resolution
   */
  function createTestToken(tenantId: string, userId: string): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        tenant_id: tenantId,
        sub: userId,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString('base64url');
    // For tests, we don't need a valid signature - tenant resolution only reads the payload
    return `${header}.${payload}.fake-signature`;
  }

  before(async () => {
    // Save original environment
    originalEnv = {
      DB_HOST: process.env.DB_HOST,
      DB_PORT: process.env.DB_PORT,
      DB_NAME: process.env.DB_NAME,
      DB_USER: process.env.DB_USER,
      DB_PASSWORD: process.env.DB_PASSWORD,
      REDIS_HOST: process.env.REDIS_HOST,
      REDIS_PORT: process.env.REDIS_PORT,
    };

    // Start test containers
    pgContainer = await new PostgreSqlContainer('postgres:17.4').start();
    redisContainer = await new RedisContainer('redis:7.4-alpine').start();

    // Get bootstrap admin credentials
    const adminUser = pgContainer.getUsername(); // Default: postgres
    const adminPassword = pgContainer.getPassword();

    // Create non-superuser application role for RLS enforcement
    const { Pool } = await import('pg');
    const adminPool = new Pool({
      host: pgContainer.getHost(),
      port: pgContainer.getPort(),
      database: pgContainer.getDatabase(),
      user: adminUser,
      password: adminPassword,
    });

    await adminPool.query(`
      CREATE ROLE antithesis_app WITH LOGIN PASSWORD 'test123' NOSUPERUSER;
    `);

    await adminPool.end();

    // Override environment with admin user for migrations
    process.env.DB_HOST = pgContainer.getHost();
    process.env.DB_PORT = String(pgContainer.getPort());
    process.env.DB_NAME = pgContainer.getDatabase();
    process.env.DB_ADMIN_USER = adminUser; // Admin for migrations
    process.env.DB_ADMIN_PASSWORD = adminPassword;
    process.env.DB_USER = 'antithesis_app'; // Non-superuser for runtime
    process.env.DB_PASSWORD = 'test123';
    process.env.REDIS_HOST = redisContainer.getHost();
    process.env.REDIS_PORT = String(redisContainer.getPort());

    Object.assign(config, {
      DB_HOST: pgContainer.getHost(),
      DB_PORT: pgContainer.getPort(),
      DB_NAME: pgContainer.getDatabase(),
      DB_ADMIN_USER: adminUser,
      DB_ADMIN_PASSWORD: adminPassword,
      DB_USER: 'antithesis_app',
      DB_PASSWORD: 'test123',
      REDIS_HOST: redisContainer.getHost(),
      REDIS_PORT: redisContainer.getPort(),
    });

    // Run migrations (includes RLS setup) - uses admin credentials
    await runMigrations();

    // Grant permissions to application user for tables created by migrations
    const adminPool2 = new Pool({
      host: pgContainer.getHost(),
      port: pgContainer.getPort(),
      database: pgContainer.getDatabase(),
      user: adminUser,
      password: adminPassword,
    });

    await adminPool2.query(`
      GRANT CONNECT ON DATABASE ${pgContainer.getDatabase()} TO antithesis_app;
      GRANT USAGE ON SCHEMA public TO antithesis_app;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO antithesis_app;
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO antithesis_app;
    `);

    await adminPool2.end();

    // Initialize Redis
    await Redis.getClient('rls-test');

    // Start HTTP server with albums controller and tenant resolution middleware
    server = new HTTP(
      {
        controllers: [albumsController],
        middlewares: [tenantResolution],
      },
      {
        port,
        oasInfo: {
          title: 'RLS Test API',
          version: '1.0.0',
        },
      },
    );
    server.start();

    // Wait for server to be fully ready
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Create test data using raw admin connection (no RLS)
    // We use the postgres superuser to create test data directly
    const { Kysely, PostgresDialect } = await import('kysely');
    const adminPool3 = new Pool({
      host: pgContainer.getHost(),
      port: pgContainer.getPort(),
      database: pgContainer.getDatabase(),
      user: adminUser,
      password: adminPassword,
    });

    const adminDb = new Kysely<Database>({
      dialect: new PostgresDialect({ pool: adminPool3 }),
    });

    // Create system user for operations without authenticated context
    await adminDb
      .insertInto('users')
      .values({
        email: 'system@antithesis.com',
        keycloakUserId: 'system',
        id: '00000000-0000-0000-0000-000000000000',
      })
      .execute();

    // Create tenants
    const tenant1 = await adminDb
      .insertInto('tenants')
      .values({
        name: 'Test Tenant 1',
        slug: 'test-tenant-1',
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    tenant1Id = tenant1.id;

    const tenant2 = await adminDb
      .insertInto('tenants')
      .values({
        name: 'Test Tenant 2',
        slug: 'test-tenant-2',
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    tenant2Id = tenant2.id;

    // Create users
    const user1 = await adminDb
      .insertInto('users')
      .values({ email: 'user1@test.com', keycloakUserId: 'kc-user-1' })
      .returningAll()
      .executeTakeFirstOrThrow();
    user1Id = user1.id;

    const user2 = await adminDb
      .insertInto('users')
      .values({ email: 'user2@test.com', keycloakUserId: 'kc-user-2' })
      .returningAll()
      .executeTakeFirstOrThrow();
    user2Id = user2.id;

    // Create user-tenant relationships
    await adminDb
      .insertInto('user_tenants')
      .values([
        { userId: user1Id, tenantId: tenant1Id },
        { userId: user2Id, tenantId: tenant2Id },
      ])
      .execute();

    // Create albums for each tenant
    const album1 = await adminDb
      .insertInto('albums')
      .values({
        tenantId: tenant1Id,
        name: 'Tenant 1 Album',
        description: 'This belongs to tenant 1',
        createdByUserId: user1Id,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    album1Id = album1.id;

    const album2 = await adminDb
      .insertInto('albums')
      .values({
        tenantId: tenant2Id,
        name: 'Tenant 2 Album',
        description: 'This belongs to tenant 2',
        createdByUserId: user2Id,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    album2Id = album2.id;

    // Close admin database connection - application will use non-superuser connection
    await adminDb.destroy();
  });

  after(async () => {
    // Cleanup
    server.stop();
    await closeDb();
    await Redis.destroy();
    await pgContainer.stop();
    await redisContainer.stop();

    // Restore original environment
    for (const key of Object.keys(originalEnv)) {
      const value = originalEnv[key];
      if (value === undefined) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  void it('should filter albums by tenant context - tenant 1 sees only their album', async () => {
    const token = createTestToken(tenant1Id, user1Id);

    const response = await fetch(`http://localhost:${String(port)}/albums`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = (await response.json()) as { data: unknown[] };

    assert.strictEqual(response.status, 200);
    assert.ok(data.data);
    assert.strictEqual(data.data.length, 1);
    assert.strictEqual((data.data[0] as { id: string }).id, album1Id);
    assert.strictEqual((data.data[0] as { name: string }).name, 'Tenant 1 Album');
  });

  void it('should filter albums by tenant context - tenant 2 sees only their album', async () => {
    const token = createTestToken(tenant2Id, user2Id);

    const response = await fetch(`http://localhost:${String(port)}/albums`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = (await response.json()) as { data: unknown[] };

    assert.strictEqual(response.status, 200);
    assert.ok(data.data);
    assert.strictEqual(data.data.length, 1);
    assert.strictEqual((data.data[0] as { id: string }).id, album2Id);
    assert.strictEqual((data.data[0] as { name: string }).name, 'Tenant 2 Album');
  });

  void it('should block cross-tenant album reads - tenant 2 cannot read tenant 1 album', async () => {
    const token = createTestToken(tenant2Id, user2Id);

    const response = await fetch(`http://localhost:${String(port)}/albums/${album1Id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // RLS causes the album to not be found from tenant 2's perspective
    assert.strictEqual(response.status, 404);
  });

  void it('should block cross-tenant updates - tenant 2 cannot update tenant 1 album', async () => {
    const token = createTestToken(tenant2Id, user2Id);

    const response = await fetch(`http://localhost:${String(port)}/albums/${album1Id}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Hacked Album Name' }),
    });

    // RLS blocks the update - album not found from tenant 2's perspective
    assert.strictEqual(response.status, 404);

    // Verify album name unchanged by querying as tenant 1
    const token1 = createTestToken(tenant1Id, user1Id);
    const checkResponse = await fetch(`http://localhost:${String(port)}/albums/${album1Id}`, {
      headers: { Authorization: `Bearer ${token1}` },
    });

    const data = (await checkResponse.json()) as { data: { name: string } };

    assert.strictEqual(checkResponse.status, 200);
    assert.strictEqual(data.data.name, 'Tenant 1 Album'); // Still original name
  });

  void it('should block cross-tenant deletes - tenant 2 cannot delete tenant 1 album', async () => {
    const token = createTestToken(tenant2Id, user2Id);

    const response = await fetch(`http://localhost:${String(port)}/albums/${album1Id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    // RLS blocks the delete - album not found from tenant 2's perspective
    assert.strictEqual(response.status, 404);

    // Verify album still exists by querying as tenant 1
    const token1 = createTestToken(tenant1Id, user1Id);
    const checkResponse = await fetch(`http://localhost:${String(port)}/albums/${album1Id}`, {
      headers: { Authorization: `Bearer ${token1}` },
    });

    const data = (await checkResponse.json()) as { data: unknown };

    assert.strictEqual(checkResponse.status, 200);
    assert.ok(data.data); // Album still exists
  });

  void it('should return empty results for unauthenticated requests', async () => {
    // Request without Authorization header
    const response = await fetch(`http://localhost:${String(port)}/albums`);

    const data = (await response.json()) as { data: unknown[] };

    // Without tenant context, RLS returns no results
    assert.strictEqual(response.status, 200);
    assert.ok(data.data);
    assert.strictEqual(data.data.length, 0); // No albums visible
  });
});
