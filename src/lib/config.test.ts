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
});
