import { z } from 'zod';

const logLevelSchema = z.enum(['error', 'warn', 'info', 'debug', 'none']);
const logFormatSchema = z.enum(['human', 'json']);

const configSchema = z.object({
  APP_NAME: z.string().default('antithesis'),
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: logLevelSchema.default('info'),
  LOG_FORMAT: logFormatSchema.default(process.env.NODE_ENV === 'production' ? 'json' : 'human'),

  /**
   * Database host
   * @example 'localhost'
   */
  DB_HOST: z.string().default('localhost'),

  /**
   * Database port
   * @example 5432
   */
  DB_PORT: z.coerce.number().default(5432),

  /**
   * Database name
   * @example 'antithesis'
   */
  DB_NAME: z.string().default('antithesis'),

  /**
   * Database user
   * @example 'antithesis'
   */
  DB_USER: z.string().default('antithesis'),

  /**
   * Database password
   * @example 'antithesis'
   */
  DB_PASSWORD: z.string().default('antithesis'),

  /**
   * Database connection pool size
   * Defaults to 10 in development, 20 in production
   * @example 20
   */
  DB_POOL_SIZE: z.coerce.number().default(process.env.NODE_ENV === 'production' ? 20 : 10),

  /**
   * Redis host
   * @example 'localhost'
   */
  REDIS_HOST: z.string().default('localhost'),

  /**
   * Redis port
   * @example 6379
   */
  REDIS_PORT: z.coerce.number().default(6379),

  /**
   * Redis username (optional)
   * @example 'default'
   */
  REDIS_USERNAME: z.string().optional(),

  /**
   * Redis password (optional)
   * @example 'password'
   */
  REDIS_PASSWORD: z.string().optional(),

  /**
   * Enable automatic DTO validation
   * When true, DTOs validate on construction. When false, validation must be called explicitly.
   * @example true
   */
  DTO_AUTO_VALIDATE: z
    .string()
    .transform((val) => val !== 'false')
    .default('true'),
});

export type Config = z.infer<typeof configSchema>;

function loadConfig(): Config {
  return configSchema.parse(process.env);
}

export const config: Config = loadConfig();
