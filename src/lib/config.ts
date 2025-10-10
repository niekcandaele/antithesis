import { z } from 'zod';

const logLevelSchema = z.enum(['error', 'warn', 'info', 'debug', 'none']);
const logFormatSchema = z.enum(['human', 'json']);

const configSchema = z.object({
  APP_NAME: z.string().default('antithesis'),
  NODE_ENV: z.string().default('development'),

  /**
   * Public API port for user-facing endpoints
   * @example 3000
   */
  PUBLIC_API_PORT: z.coerce.number().default(3000),

  /**
   * Admin API port for internal admin/tenant management
   * @example 3001
   */
  ADMIN_API_PORT: z.coerce.number().default(3001),

  /**
   * Meta API port for health/readiness probes
   * @example 3002
   */
  META_API_PORT: z.coerce.number().default(3002),

  /**
   * Bypass CORS origin checks
   * Defaults to true in development, false in production
   * @example true
   */
  CORS_BYPASS_ALLOWED_ORIGINS: z
    .string()
    .transform((val) => val !== 'false')
    .default(process.env.NODE_ENV === 'production' ? 'false' : 'true'),

  /**
   * Comma-separated list of allowed CORS origins
   * Only used when CORS_BYPASS_ALLOWED_ORIGINS is false
   * @example 'http://localhost:3000,https://app.example.com'
   */
  CORS_ALLOWED_ORIGINS: z
    .string()
    .optional()
    .transform((val) => (val ? val.split(',').filter(Boolean) : [])),

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
   * Database user (application runtime - non-superuser for RLS enforcement)
   * @example 'antithesis_app'
   */
  DB_USER: z.string().default('antithesis_app'),

  /**
   * Database password
   * @example 'antithesis'
   */
  DB_PASSWORD: z.string().default('antithesis'),

  /**
   * Database admin user (MIGRATIONS ONLY - may be superuser)
   * Used ONLY for running database migrations which require elevated privileges.
   * The application runtime NEVER uses admin access - all operations are tenant-scoped via RLS.
   * If not set, falls back to DB_USER.
   * @example 'postgres'
   */
  DB_ADMIN_USER: z.string().optional(),

  /**
   * Database admin password (MIGRATIONS ONLY)
   * Used ONLY for running database migrations.
   * The application runtime NEVER uses admin access.
   * If not set, falls back to DB_PASSWORD.
   * @example 'antithesis'
   */
  DB_ADMIN_PASSWORD: z.string().optional(),

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

  /**
   * Keycloak server URL (internal - for server-to-server communication)
   * Used for OIDC discovery, token exchange, and other backend Keycloak API calls
   * @example 'http://keycloak:8080' (Docker), 'https://keycloak.example.com' (production)
   */
  KEYCLOAK_URL: z.string().url().default('http://keycloak.local'),

  /**
   * Keycloak public URL (for browser redirects in OAuth flow)
   * Falls back to KEYCLOAK_URL if not set (production: both are same public URL)
   * In E2E/local: KEYCLOAK_URL=http://keycloak:8080, KEYCLOAK_PUBLIC_URL=http://127.0.0.1:8080
   * @example 'http://127.0.0.1:8080' or 'https://keycloak.example.com'
   */
  KEYCLOAK_PUBLIC_URL: z
    .string()
    .url()
    .optional()
    .transform((val) => val ?? process.env.KEYCLOAK_URL ?? 'http://keycloak.local'),

  /**
   * Keycloak realm name
   * @example 'antithesis'
   */
  KEYCLOAK_REALM: z.string().default('antithesis'),

  /**
   * Keycloak OIDC client ID
   * @example 'antithesis-app'
   */
  KEYCLOAK_CLIENT_ID: z.string().default('antithesis-app'),

  /**
   * Keycloak OIDC client secret
   * @example 'secret'
   */
  KEYCLOAK_CLIENT_SECRET: z.string().default('secret'),

  /**
   * Allow insecure HTTP communication with Keycloak (development/testing only)
   * IMPORTANT: This should ONLY be enabled in development/test environments
   * Always use HTTPS in production for security
   * @default false
   */
  KEYCLOAK_ALLOW_HTTP: z
    .string()
    .transform((val) => val === 'true')
    .default('false'),

  /**
   * Session secret for encryption
   * MUST be changed in production for security
   * @example 'random-secret-key'
   */
  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET must be at least 32 characters in production')
    .default('development-session-secret-change-in-production'),

  /**
   * Session maximum age in milliseconds
   * @example 86400000 (24 hours)
   */
  SESSION_MAX_AGE: z.coerce.number().default(86400000),

  /**
   * Public API URL for OAuth redirects
   * @example 'http://localhost:3000'
   */
  PUBLIC_API_URL: z.string().url().default('http://localhost:3000'),

  /**
   * Admin API URL for internal admin operations
   * @example 'http://localhost:3001' or 'https://admin.example.com'
   */
  ADMIN_API_URL: z.string().url().default('http://localhost:3001'),

  /**
   * Meta API URL for health/readiness checks
   * @example 'http://localhost:3002' or 'https://meta.example.com'
   */
  META_API_URL: z.string().url().default('http://localhost:3002'),

  /**
   * Views directory path for EJS templates
   * @example 'views' or '/app/views'
   */
  VIEWS_DIR: z.string().default('views'),
});

export type Config = z.infer<typeof configSchema>;

function loadConfig(): Config {
  const config = configSchema.parse(process.env);

  // Production validation - ensure critical secrets are changed from defaults
  if (config.NODE_ENV === 'production') {
    const warnings: string[] = [];

    if (config.SESSION_SECRET === 'development-session-secret-change-in-production') {
      warnings.push(
        'SESSION_SECRET is using default value in production - this is a security risk!',
      );
    }

    if (config.KEYCLOAK_CLIENT_SECRET === 'secret') {
      warnings.push('KEYCLOAK_CLIENT_SECRET is using default value in production');
    }

    if (
      config.KEYCLOAK_URL === 'http://keycloak.local' ||
      config.KEYCLOAK_PUBLIC_URL === 'http://keycloak.local'
    ) {
      warnings.push(
        'KEYCLOAK_URL/KEYCLOAK_PUBLIC_URL is using default value - configure to point to real Keycloak',
      );
    }

    if (warnings.length > 0) {
      // eslint-disable-next-line no-console
      console.error('⚠️  Production configuration warnings:');
      warnings.forEach((warning) => {
        // eslint-disable-next-line no-console
        console.error(`   - ${warning}`);
      });
      throw new Error('Invalid production configuration - see warnings above');
    }
  }

  return config;
}

export const config: Config = loadConfig();
