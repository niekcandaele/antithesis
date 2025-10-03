import { createClient, RedisClientType } from 'redis';
import { config } from './config.js';
import { health } from './health.js';
import type { TenantId } from './types.js';

/**
 * Redis client wrapper with automatic key prefixing
 */
class PrefixedRedisClient {
  constructor(
    private readonly client: RedisClientType,
    private readonly prefix: string,
  ) {}

  /**
   * Get value with automatic key prefixing
   */
  async get(key: string): Promise<string | null> {
    return this.client.get(`${this.prefix}${key}`);
  }

  /**
   * Set value with automatic key prefixing
   */
  async set(key: string, value: string, options?: { EX?: number }): Promise<string | null> {
    return this.client.set(`${this.prefix}${key}`, value, options);
  }

  /**
   * Delete key with automatic key prefixing
   */
  async del(key: string): Promise<number> {
    return this.client.del(`${this.prefix}${key}`);
  }

  /**
   * Check if key exists with automatic key prefixing
   */
  async exists(key: string): Promise<number> {
    return this.client.exists(`${this.prefix}${key}`);
  }

  /**
   * Ping the Redis server
   */
  async ping(): Promise<string> {
    return this.client.ping();
  }

  /**
   * Disconnect from Redis
   */
  async quit(): Promise<string> {
    return this.client.quit();
  }

  /**
   * Get the underlying Redis client (use with caution - keys won't be auto-prefixed)
   */
  get raw(): RedisClientType {
    return this.client;
  }
}

/**
 * Redis client manager instance
 */
class RedisManager {
  private clients = new Map<string, PrefixedRedisClient>();
  private rawClients = new Map<string, RedisClientType>();
  private baseClient: RedisClientType | null = null;

  /**
   * Get or create a base Redis client
   */
  private async getBaseClient(): Promise<RedisClientType> {
    if (!this.baseClient) {
      const username = config.REDIS_USERNAME ?? '';
      const password = config.REDIS_PASSWORD ?? '';
      const connectionUrl = config.REDIS_USERNAME
        ? `redis://${username}:${password}@${config.REDIS_HOST}:${String(config.REDIS_PORT)}`
        : `redis://${config.REDIS_HOST}:${String(config.REDIS_PORT)}`;

      this.baseClient = createClient({ url: connectionUrl });

      this.baseClient.on('error', (err: Error) => {
        // Error logging for Redis connection issues
        // eslint-disable-next-line no-console
        console.error('Redis Client Error', err);
      });

      await this.baseClient.connect();
    }

    return this.baseClient;
  }

  /**
   * Get or create a cached Redis client with app-name prefixing
   *
   * Keys are automatically prefixed with: `${APP_NAME}:${name}:`
   *
   * @param name - Unique name for this client (e.g., 'session-store', 'cache')
   * @returns Prefixed Redis client
   *
   * @example
   * ```typescript
   * const client = await Redis.getClient('session-store');
   * await client.set('key', 'value', { EX: 3600 });
   * // Actual key in Redis: "antithesis:session-store:key"
   * ```
   */
  async getClient(name: string): Promise<PrefixedRedisClient> {
    const cacheKey = `app:${name}`;

    if (!this.clients.has(cacheKey)) {
      const baseClient = await this.getBaseClient();
      const rawClient = baseClient.duplicate();

      rawClient.on('error', (err: Error) => {
        // Error logging for Redis client
        // eslint-disable-next-line no-console
        console.error(`Redis Client Error (${name})`, err);
      });

      await rawClient.connect();

      // Register readiness hook
      health.registerReadinessHook(`redis:${name}`, async () => {
        try {
          await rawClient.ping();
          return true;
        } catch {
          return false;
        }
      });

      this.rawClients.set(cacheKey, rawClient);

      // Create and cache the wrapped client
      const prefix = `${config.APP_NAME}:${name}:`;
      const wrappedClient = new PrefixedRedisClient(rawClient, prefix);
      this.clients.set(cacheKey, wrappedClient);
    }

    const client = this.clients.get(cacheKey);
    if (!client) {
      throw new Error(`Redis client not found for key: ${cacheKey}`);
    }
    return client;
  }

  /**
   * Get or create a cached Redis client with tenant-scoped prefixing
   *
   * Keys are automatically prefixed with: `${APP_NAME}:${tenantId}:${name}:`
   *
   * @param tenantId - The tenant ID for scoping
   * @param name - Unique name for this client (e.g., 'cache', 'locks')
   * @returns Prefixed Redis client scoped to tenant
   *
   * @example
   * ```typescript
   * const client = await Redis.getTenantScopedClient(tenantId, 'cache');
   * await client.set('user-settings', JSON.stringify(settings));
   * // Actual key in Redis: "antithesis:tenant-123:cache:user-settings"
   * ```
   */
  async getTenantScopedClient(tenantId: TenantId, name: string): Promise<PrefixedRedisClient> {
    const cacheKey = `tenant:${tenantId}:${name}`;

    if (!this.clients.has(cacheKey)) {
      const baseClient = await this.getBaseClient();
      const rawClient = baseClient.duplicate();

      rawClient.on('error', (err: Error) => {
        // Error logging for Redis client
        // eslint-disable-next-line no-console
        console.error(`Redis Client Error (${tenantId}:${name})`, err);
      });

      await rawClient.connect();

      // Register readiness hook
      health.registerReadinessHook(`redis:${tenantId}:${name}`, async () => {
        try {
          await rawClient.ping();
          return true;
        } catch {
          return false;
        }
      });

      this.rawClients.set(cacheKey, rawClient);

      // Create and cache the wrapped client
      const prefix = `${config.APP_NAME}:${tenantId}:${name}:`;
      const wrappedClient = new PrefixedRedisClient(rawClient, prefix);
      this.clients.set(cacheKey, wrappedClient);
    }

    const client = this.clients.get(cacheKey);
    if (!client) {
      throw new Error(`Redis client not found for key: ${cacheKey}`);
    }
    return client;
  }

  /**
   * Disconnect all Redis clients
   *
   * @example
   * ```typescript
   * // Clean up on application shutdown
   * await Redis.destroy();
   * ```
   */
  async destroy(): Promise<void> {
    // Disconnect raw clients (not the wrappers)
    const disconnectPromises = Array.from(this.rawClients.values()).map(async (client) => {
      try {
        // Only quit if client is still open
        if (client.isOpen) {
          await client.quit();
        }
      } catch (error: unknown) {
        // Ignore errors from already-closed clients
        // eslint-disable-next-line no-console
        console.error('Error closing Redis client:', error);
      }
    });

    if (this.baseClient?.isOpen) {
      disconnectPromises.push(
        this.baseClient
          .quit()
          .then(() => undefined)
          .catch((error: unknown) => {
            // eslint-disable-next-line no-console
            console.error('Error closing base Redis client:', error);
          }),
      );
    }

    await Promise.all(disconnectPromises);

    this.clients.clear();
    this.rawClients.clear();
    this.baseClient = null;
  }
}

/**
 * Redis client management with connection caching and automatic app name prefixing
 *
 * Provides two types of clients:
 * 1. App-scoped clients: Keys prefixed with `${APP_NAME}:${name}:`
 * 2. Tenant-scoped clients: Keys prefixed with `${APP_NAME}:${tenantId}:${name}:`
 *
 * Features:
 * - Connection caching (reuses existing connections)
 * - Automatic health check registration
 * - Key prefixing for namespace isolation
 *
 * @example
 * ```typescript
 * // Get app-scoped client
 * const sessionStore = await Redis.getClient('session-store');
 * await sessionStore.set('user:123', 'data', { EX: 3600 });
 * // Key in Redis: "antithesis:session-store:user:123"
 *
 * // Get tenant-scoped client
 * const tenantCache = await Redis.getTenantScopedClient(tenantId, 'cache');
 * await tenantCache.set('settings', JSON.stringify(data));
 * // Key in Redis: "antithesis:tenant-123:cache:settings"
 * ```
 */
export const Redis = new RedisManager();
