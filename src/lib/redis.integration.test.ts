import { describe, it, beforeEach, before, after } from 'node:test';
import assert from 'node:assert';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { createClient, RedisClientType } from 'redis';
import { config } from './config.js';
import { Redis } from './redis.js';
import { health } from './health.js';

describe('Redis Integration Tests', () => {
  let container: StartedRedisContainer;
  let inspectorClient: RedisClientType;
  let originalEnv: Record<string, string | undefined>;

  before(() => {
    // Save original environment
    originalEnv = {
      REDIS_HOST: process.env.REDIS_HOST,
      REDIS_PORT: process.env.REDIS_PORT,
    };
  });

  before(async () => {
    // Start a single Redis container shared across all tests
    // This significantly reduces test execution time by avoiding container overhead
    container = await new RedisContainer('redis:7.4-alpine').start();

    // Override environment to point to test container
    const host = container.getHost();
    const port = container.getPort();
    process.env.REDIS_HOST = host;
    process.env.REDIS_PORT = String(port);

    // Reload config with new environment
    Object.assign(config, {
      REDIS_HOST: host,
      REDIS_PORT: port,
    });

    // Create inspector client
    const connectionUrl = container.getConnectionUrl();
    inspectorClient = createClient({ url: connectionUrl });
    await inspectorClient.connect();
  });

  beforeEach(async () => {
    // Flush all data between tests to ensure isolation
    await inspectorClient.flushAll();

    // Clean up health hooks from previous tests
    const hookNames = [
      'redis:test',
      'redis:session-store',
      'redis:cache',
      'redis:client1',
      'redis:client2',
      'redis:new-client',
      'redis:tenant-123:cache',
      'redis:tenant-456:cache',
    ];

    hookNames.forEach((name) => {
      health.unregisterReadinessHook(name);
    });
  });

  after(async () => {
    // Clean up after all tests complete
    await Redis.destroy();
    await inspectorClient.quit();
    await container.stop();

    // Restore original environment
    process.env.REDIS_HOST = originalEnv.REDIS_HOST;
    process.env.REDIS_PORT = originalEnv.REDIS_PORT;

    // Clean up health hooks
    const hookNames = [
      'redis:test',
      'redis:session-store',
      'redis:cache',
      'redis:client1',
      'redis:client2',
      'redis:new-client',
      'redis:tenant-123:cache',
      'redis:tenant-456:cache',
    ];

    hookNames.forEach((name) => {
      health.unregisterReadinessHook(name);
    });
  });

  describe('Connection', () => {
    it('should connect to Redis successfully', async () => {
      const client = await Redis.getClient('test');
      const result = await client.ping();

      assert.strictEqual(result, 'PONG');
    });

    it('should handle connection errors gracefully', async () => {
      const client = await Redis.getClient('test');
      assert.ok(client);
    });
  });

  describe('Basic Operations', () => {
    it('should set and get values', async () => {
      const client = await Redis.getClient('test');

      await client.set('key1', 'value1');
      const result = await client.get('key1');

      assert.strictEqual(result, 'value1');
    });

    it('should set values with expiration', async () => {
      const client = await Redis.getClient('test');

      await client.set('temp-key', 'temp-value', { EX: 1 });
      const result1 = await client.get('temp-key');
      assert.strictEqual(result1, 'temp-value');

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const result2 = await client.get('temp-key');
      assert.strictEqual(result2, null);
    });

    it('should delete values', async () => {
      const client = await Redis.getClient('test');

      await client.set('key-to-delete', 'value');
      const deleted = await client.del('key-to-delete');
      assert.strictEqual(deleted, 1);

      const result = await client.get('key-to-delete');
      assert.strictEqual(result, null);
    });

    it('should check if key exists', async () => {
      const client = await Redis.getClient('test');

      await client.set('existing-key', 'value');
      const exists = await client.exists('existing-key');
      assert.strictEqual(exists, 1);

      const notExists = await client.exists('non-existing-key');
      assert.strictEqual(notExists, 0);
    });
  });

  describe('Key Prefixing', () => {
    it('should prefix keys with app name and client name', async () => {
      const client = await Redis.getClient('session-store');
      await client.set('user:123', 'user-data');

      // Verify actual Redis key using inspector client
      const actualKey = 'antithesis:session-store:user:123';
      const value = await inspectorClient.get(actualKey);
      assert.strictEqual(value, 'user-data');

      // Verify we can retrieve using the prefixed client
      const retrieved = await client.get('user:123');
      assert.strictEqual(retrieved, 'user-data');
    });

    it('should prefix keys with tenant ID for tenant-scoped clients', async () => {
      const tenantId = 'tenant-123' as unknown as import('./types.js').TenantId;
      const client = await Redis.getTenantScopedClient(tenantId, 'cache');
      await client.set('settings', 'tenant-settings');

      // Verify actual Redis key
      const actualKey = 'antithesis:tenant-123:cache:settings';
      const value = await inspectorClient.get(actualKey);
      assert.strictEqual(value, 'tenant-settings');

      // Verify retrieval
      const retrieved = await client.get('settings');
      assert.strictEqual(retrieved, 'tenant-settings');
    });

    it('should isolate keys between different tenants', async () => {
      const tenant1 = 'tenant-123' as unknown as import('./types.js').TenantId;
      const tenant2 = 'tenant-456' as unknown as import('./types.js').TenantId;

      const client1 = await Redis.getTenantScopedClient(tenant1, 'cache');
      const client2 = await Redis.getTenantScopedClient(tenant2, 'cache');

      await client1.set('data', 'tenant-1-data');
      await client2.set('data', 'tenant-2-data');

      const value1 = await client1.get('data');
      const value2 = await client2.get('data');

      assert.strictEqual(value1, 'tenant-1-data');
      assert.strictEqual(value2, 'tenant-2-data');

      // Verify actual keys in Redis
      const keys = await inspectorClient.keys('antithesis:tenant-*:cache:data');
      assert.strictEqual(keys.length, 2);
      assert.ok(keys.includes('antithesis:tenant-123:cache:data'));
      assert.ok(keys.includes('antithesis:tenant-456:cache:data'));
    });
  });

  describe('Health Check Registration', () => {
    it('should auto-register readiness hook for app-scoped clients', async () => {
      await Redis.getClient('session-store');

      const isReady = await health.checkReadiness();
      assert.strictEqual(isReady, true);
    });

    it('should auto-register readiness hook for tenant-scoped clients', async () => {
      const tenantId = 'tenant-123' as unknown as import('./types.js').TenantId;
      await Redis.getTenantScopedClient(tenantId, 'cache');

      const isReady = await health.checkReadiness();
      assert.strictEqual(isReady, true);
    });
  });

  describe('Client Cleanup', () => {
    it('should disconnect all clients on destroy', async () => {
      await Redis.getClient('client1');
      await Redis.getClient('client2');
      await Redis.getTenantScopedClient(
        'tenant-123' as unknown as import('./types.js').TenantId,
        'cache',
      );

      await Redis.destroy();

      // Create a new client after destroy should work
      const newClient = await Redis.getClient('new-client');
      const result = await newClient.ping();
      assert.strictEqual(result, 'PONG');
    });

    it('should clear cached clients on destroy', async () => {
      const client1 = await Redis.getClient('cache');
      await client1.set('test', 'value1');

      await Redis.destroy();

      const client2 = await Redis.getClient('cache');
      await client2.set('test', 'value2');

      const value = await client2.get('test');
      assert.strictEqual(value, 'value2');
    });
  });

  describe('Client Caching', () => {
    it('should reuse cached clients', async () => {
      const client1 = await Redis.getClient('cache');
      const client2 = await Redis.getClient('cache');

      // Should be the same instance
      assert.strictEqual(client1, client2);

      // Setting via one client should be visible via the other
      await client1.set('shared', 'data');
      const value = await client2.get('shared');
      assert.strictEqual(value, 'data');
    });

    it('should cache tenant-scoped clients separately', async () => {
      const tenant1Client1 = await Redis.getTenantScopedClient(
        'tenant-123' as unknown as import('./types.js').TenantId,
        'cache',
      );
      const tenant1Client2 = await Redis.getTenantScopedClient(
        'tenant-123' as unknown as import('./types.js').TenantId,
        'cache',
      );
      const tenant2Client = await Redis.getTenantScopedClient(
        'tenant-456' as unknown as import('./types.js').TenantId,
        'cache',
      );

      // Same tenant and name should return same client
      assert.strictEqual(tenant1Client1, tenant1Client2);

      // Different tenant should return different client
      assert.notStrictEqual(tenant1Client1, tenant2Client);
    });
  });
});
