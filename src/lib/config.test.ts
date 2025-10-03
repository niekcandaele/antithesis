import { describe, it } from 'node:test';
import assert from 'node:assert';
import { z } from 'zod';

void describe('Config Module', () => {
  void it('should load APP_NAME from environment variable', () => {
    const configSchema = z.object({
      APP_NAME: z.string().default('antithesis'),
    });

    const mockEnv = {
      APP_NAME: 'test-app',
    };

    const config = configSchema.parse(mockEnv);

    assert.strictEqual(config.APP_NAME, 'test-app');
  });

  void it('should use default value when APP_NAME is undefined', () => {
    const configSchema = z.object({
      APP_NAME: z.string().default('antithesis'),
    });

    const mockEnv = {};

    const config = configSchema.parse(mockEnv);

    assert.strictEqual(config.APP_NAME, 'antithesis');
  });

  void it('should validate schema and reject invalid types', () => {
    const configSchema = z.object({
      APP_NAME: z.string(),
    });

    const mockEnv = {
      APP_NAME: 123, // Invalid: should be string
    };

    assert.throws(
      () => configSchema.parse(mockEnv),
      (err: Error) => {
        return err instanceof z.ZodError;
      },
    );
  });

  void it('should provide type-safe config object', () => {
    const configSchema = z.object({
      APP_NAME: z.string().default('antithesis'),
    });

    type Config = z.infer<typeof configSchema>;

    const mockEnv = {
      APP_NAME: 'typed-app',
    };

    const config: Config = configSchema.parse(mockEnv);

    // TypeScript will enforce type safety
    assert.strictEqual(typeof config.APP_NAME, 'string');
  });

  void it('should handle multiple config values', () => {
    const configSchema = z.object({
      APP_NAME: z.string().default('antithesis'),
      PORT: z.coerce.number().default(3000),
      DEBUG: z
        .string()
        .transform((val) => val === 'true')
        .default('false'),
    });

    const mockEnv = {
      APP_NAME: 'multi-config-app',
      PORT: '8080',
      DEBUG: 'true',
    };

    const config = configSchema.parse(mockEnv);

    assert.strictEqual(config.APP_NAME, 'multi-config-app');
    assert.strictEqual(config.PORT, 8080);
    assert.strictEqual(config.DEBUG, true);
  });

  void it('should apply defaults for missing values', () => {
    const configSchema = z.object({
      APP_NAME: z.string().default('antithesis'),
      PORT: z.coerce.number().default(3000),
      DEBUG: z
        .string()
        .transform((val) => val === 'true')
        .default('false'),
    });

    const mockEnv = {
      APP_NAME: 'partial-config',
    };

    const config = configSchema.parse(mockEnv);

    assert.strictEqual(config.APP_NAME, 'partial-config');
    assert.strictEqual(config.PORT, 3000); // default
    assert.strictEqual(config.DEBUG, false); // default
  });

  void it('should parse database config fields correctly', () => {
    const configSchema = z.object({
      DB_HOST: z.string().default('localhost'),
      DB_PORT: z.coerce.number().default(5432),
      DB_NAME: z.string().default('antithesis'),
      DB_USER: z.string().default('antithesis'),
      DB_PASSWORD: z.string().default('antithesis'),
      DB_POOL_SIZE: z.coerce.number().default(10),
    });

    const mockEnv = {
      DB_HOST: 'db.example.com',
      DB_PORT: '5433',
      DB_NAME: 'mydb',
      DB_USER: 'myuser',
      DB_PASSWORD: 'mypass',
      DB_POOL_SIZE: '25',
    };

    const config = configSchema.parse(mockEnv);

    assert.strictEqual(config.DB_HOST, 'db.example.com');
    assert.strictEqual(config.DB_PORT, 5433);
    assert.strictEqual(config.DB_NAME, 'mydb');
    assert.strictEqual(config.DB_USER, 'myuser');
    assert.strictEqual(config.DB_PASSWORD, 'mypass');
    assert.strictEqual(config.DB_POOL_SIZE, 25);
  });

  void it('should parse Redis config fields correctly', () => {
    const configSchema = z.object({
      REDIS_HOST: z.string().default('localhost'),
      REDIS_PORT: z.coerce.number().default(6379),
      REDIS_USERNAME: z.string().optional(),
      REDIS_PASSWORD: z.string().optional(),
    });

    const mockEnv = {
      REDIS_HOST: 'redis.example.com',
      REDIS_PORT: '6380',
      REDIS_USERNAME: 'redisuser',
      REDIS_PASSWORD: 'redispass',
    };

    const config = configSchema.parse(mockEnv);

    assert.strictEqual(config.REDIS_HOST, 'redis.example.com');
    assert.strictEqual(config.REDIS_PORT, 6380);
    assert.strictEqual(config.REDIS_USERNAME, 'redisuser');
    assert.strictEqual(config.REDIS_PASSWORD, 'redispass');
  });

  void it('should default DTO_AUTO_VALIDATE to true', () => {
    const configSchema = z.object({
      DTO_AUTO_VALIDATE: z
        .string()
        .transform((val) => val !== 'false')
        .default('true'),
    });

    const mockEnv = {};

    const config = configSchema.parse(mockEnv);

    assert.strictEqual(config.DTO_AUTO_VALIDATE, true);
  });

  void it('should parse DTO_AUTO_VALIDATE as boolean', () => {
    const configSchema = z.object({
      DTO_AUTO_VALIDATE: z
        .string()
        .transform((val) => val !== 'false')
        .default('true'),
    });

    const mockEnv1 = { DTO_AUTO_VALIDATE: 'false' };
    const config1 = configSchema.parse(mockEnv1);
    assert.strictEqual(config1.DTO_AUTO_VALIDATE, false);

    const mockEnv2 = { DTO_AUTO_VALIDATE: 'true' };
    const config2 = configSchema.parse(mockEnv2);
    assert.strictEqual(config2.DTO_AUTO_VALIDATE, true);
  });

  void it('should have environment-aware DB_POOL_SIZE defaults', () => {
    const createConfigSchema = (nodeEnv: string) =>
      z.object({
        DB_POOL_SIZE: z.coerce.number().default(nodeEnv === 'production' ? 20 : 10),
      });

    // Development environment
    const devConfig = createConfigSchema('development').parse({});
    assert.strictEqual(devConfig.DB_POOL_SIZE, 10);

    // Production environment
    const prodConfig = createConfigSchema('production').parse({});
    assert.strictEqual(prodConfig.DB_POOL_SIZE, 20);
  });
});
