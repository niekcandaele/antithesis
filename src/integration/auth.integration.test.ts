import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { getDb, closeDb } from '../lib/db/index.js';
import { runMigrations } from '../lib/db/migrations.js';
import { Redis } from '../lib/redis.js';
import { config } from '../lib/config.js';
import { roleService } from '../services/role.service.js';
import { userRepository } from '../db/user.repository.js';
import { roleRepository } from '../db/role.repository.js';

/**
 * Integration test for authentication system
 *
 * Tests the complete auth flow with real Postgres and Redis:
 * - Database migrations
 * - Role seeding
 * - Session persistence
 * - User creation
 */
void describe('Auth System Integration Tests', () => {
  let pgContainer: StartedPostgreSqlContainer;
  let redisContainer: StartedRedisContainer;
  let originalEnv: Record<string, string | undefined>;

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

    // Start Postgres container
    pgContainer = await new PostgreSqlContainer('postgres:17.4').start();

    // Start Redis container
    redisContainer = await new RedisContainer('redis:7.4-alpine').start();

    // Override environment to point to test containers
    process.env.DB_HOST = pgContainer.getHost();
    process.env.DB_PORT = String(pgContainer.getPort());
    process.env.DB_NAME = pgContainer.getDatabase();
    process.env.DB_USER = pgContainer.getUsername();
    process.env.DB_PASSWORD = pgContainer.getPassword();
    process.env.REDIS_HOST = redisContainer.getHost();
    process.env.REDIS_PORT = String(redisContainer.getPort());

    // Reload config with new environment
    Object.assign(config, {
      DB_HOST: pgContainer.getHost(),
      DB_PORT: pgContainer.getPort(),
      DB_NAME: pgContainer.getDatabase(),
      DB_USER: pgContainer.getUsername(),
      DB_PASSWORD: pgContainer.getPassword(),
      REDIS_HOST: redisContainer.getHost(),
      REDIS_PORT: redisContainer.getPort(),
    });

    // Run migrations
    await runMigrations();

    // Initialize Redis clients
    await Redis.getClient('app');
    await Redis.getClient('sessions');
  });

  after(async () => {
    // Clean up
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

  void it('should run migrations successfully', async () => {
    const db = getDb();

    // Verify tenants table exists
    const tenants = await db.selectFrom('tenants').selectAll().execute();
    assert.ok(Array.isArray(tenants), 'Tenants table should exist');

    // Verify users table exists
    const users = await db.selectFrom('users').selectAll().execute();
    assert.ok(Array.isArray(users), 'Users table should exist');

    // Verify roles table exists
    const roles = await db.selectFrom('roles').selectAll().execute();
    assert.ok(Array.isArray(roles), 'Roles table should exist');

    // Verify user_tenants table exists
    const userTenants = await db.selectFrom('user_tenants').selectAll().execute();
    assert.ok(Array.isArray(userTenants), 'UserTenants table should exist');

    // Verify user_roles table exists
    const userRoles = await db.selectFrom('user_roles').selectAll().execute();
    assert.ok(Array.isArray(userRoles), 'UserRoles table should exist');
  });

  void it('should seed roles successfully', async () => {
    // Seed roles
    const seededRoles = await roleService.seedRoles();

    assert.strictEqual(seededRoles.length, 3, 'Should seed 3 roles');
    assert.ok(
      seededRoles.some((r) => r.name === 'admin'),
      'Should include admin role',
    );
    assert.ok(
      seededRoles.some((r) => r.name === 'user'),
      'Should include user role',
    );
    assert.ok(
      seededRoles.some((r) => r.name === 'viewer'),
      'Should include viewer role',
    );

    // Verify idempotency - seeding again should not create duplicates
    const secondSeed = await roleService.seedRoles();
    assert.strictEqual(secondSeed.length, 3, 'Should still have 3 roles after re-seeding');

    // Verify database only has 3 roles
    const allRoles = await roleRepository.findAll();
    assert.strictEqual(allRoles.length, 3, 'Database should only have 3 roles');
  });

  void it('should create and retrieve users', async () => {
    // Create a test user
    const userData = {
      email: 'test@example.com',
      keycloakUserId: 'keycloak-123',
    };

    const createdUser = await userRepository.create(userData);

    assert.ok(createdUser.id, 'User should have an ID');
    assert.strictEqual(createdUser.email, userData.email, 'Email should match');
    assert.strictEqual(
      createdUser.keycloakUserId,
      userData.keycloakUserId,
      'Keycloak user ID should match',
    );

    // Retrieve user by ID
    const foundUser = await userRepository.findById(createdUser.id);
    assert.ok(foundUser, 'Should find user by ID');
    assert.strictEqual(foundUser.email, userData.email);

    // Retrieve user by email
    const foundByEmail = await userRepository.findByEmail(userData.email);
    assert.ok(foundByEmail, 'Should find user by email');
    assert.strictEqual(foundByEmail.id, createdUser.id);

    // Retrieve user by Keycloak ID
    const foundByKeycloakId = await userRepository.findByKeycloakUserId(userData.keycloakUserId);
    assert.ok(foundByKeycloakId, 'Should find user by Keycloak ID');
    assert.strictEqual(foundByKeycloakId.id, createdUser.id);
  });

  void it('should persist sessions in Redis', async () => {
    const sessionClient = await Redis.getClient('sessions');

    // Create a test session
    const sessionId = 'test-session-123';
    const sessionData = {
      userId: 'user-123',
      currentTenantId: 'tenant-456',
      oauthState: 'random-state',
    };

    // Store session
    await sessionClient.set(`session:${sessionId}`, JSON.stringify(sessionData), {
      EX: 3600, // 1 hour expiry
    });

    // Retrieve session
    const retrieved = await sessionClient.get(`session:${sessionId}`);
    assert.ok(retrieved, 'Session should be stored');

    const parsedSession = JSON.parse(retrieved) as typeof sessionData;
    assert.strictEqual(parsedSession.userId, sessionData.userId);
    assert.strictEqual(parsedSession.currentTenantId, sessionData.currentTenantId);
    assert.strictEqual(parsedSession.oauthState, sessionData.oauthState);

    // Clean up
    await sessionClient.del(`session:${sessionId}`);
  });

  void it('should handle user upsert by Keycloak ID', async () => {
    const keycloakUserId = 'keycloak-upsert-test';
    const email = 'upsert@example.com';

    // First upsert - should create
    const firstUpsert = await userRepository.upsertByKeycloakId({
      keycloakUserId,
      email,
    });
    assert.ok(firstUpsert.id, 'Should create user on first upsert');
    assert.strictEqual(firstUpsert.email, email);

    // Second upsert - should update
    const newEmail = 'updated@example.com';
    const secondUpsert = await userRepository.upsertByKeycloakId({
      keycloakUserId,
      email: newEmail,
    });
    assert.strictEqual(secondUpsert.id, firstUpsert.id, 'Should have same ID');
    assert.strictEqual(secondUpsert.email, newEmail, 'Email should be updated');

    // Verify only one user exists with this Keycloak ID
    const allUsers = await userRepository.findAll({
      filters: { keycloakUserId },
    });
    assert.strictEqual(allUsers.length, 1, 'Should only have one user with this Keycloak ID');
  });
});
