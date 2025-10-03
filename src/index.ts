import { metaController } from './controllers/meta.js';
import { healthController } from './controllers/health.js';
import { tenantController } from './controllers/tenants/tenant.controller.js';
import { config } from './lib/config.js';
import { HTTP } from './lib/http/index.js';
import { logger } from './lib/logger.js';
import { getDb } from './lib/db/index.js';
import { runMigrations } from './lib/db/migrations.js';
import { health } from './lib/health.js';
import { Redis } from './lib/redis.js';

const log = logger('app');

log.info(`Starting ${config.APP_NAME}...`);

// Initialize database
try {
  log.info('Connecting to database...');
  const db = getDb();

  // Run migrations (auto in development, manual in production)
  await runMigrations();

  // Register database health check
  health.registerReadinessHook('database', async () => {
    await db.selectFrom('tenants').select('id').limit(1).execute();
    return true;
  });

  log.info('Database connected and ready');
} catch (error) {
  log.error('Failed to initialize database', { error });
  throw error;
}

// Initialize Redis
try {
  log.info('Connecting to Redis...');
  await Redis.getClient('app');
  log.info('Redis connected and ready');
} catch (error) {
  log.error('Failed to initialize Redis', { error });
  throw error;
}

// Public API Server - User-facing endpoints
const publicApiServer = new HTTP(
  {
    controllers: [metaController], // Empty for now, ready for public endpoints
  },
  {
    port: config.PUBLIC_API_PORT,
    bypassAllowedOrigins: config.CORS_BYPASS_ALLOWED_ORIGINS,
    allowedOrigins: config.CORS_ALLOWED_ORIGINS,
    oasInfo: {
      title: 'Antithesis Public API',
      version: '1.0.0',
      description: 'Public API for the Antithesis application',
    },
  },
);

// Admin API Server - Internal admin/tenant management
const adminApiServer = new HTTP(
  {
    controllers: [metaController, tenantController],
  },
  {
    port: config.ADMIN_API_PORT,
    bypassAllowedOrigins: config.CORS_BYPASS_ALLOWED_ORIGINS,
    allowedOrigins: config.CORS_ALLOWED_ORIGINS,
    oasInfo: {
      title: 'Antithesis Admin API',
      version: '1.0.0',
      description: 'Admin API for tenant management and internal operations',
    },
  },
);

// Meta API Server - Health/readiness probes
const metaApiServer = new HTTP(
  {
    controllers: [healthController],
  },
  {
    port: config.META_API_PORT,
    bypassAllowedOrigins: config.CORS_BYPASS_ALLOWED_ORIGINS,
    allowedOrigins: config.CORS_ALLOWED_ORIGINS,
    oasInfo: {
      title: 'Antithesis Meta API',
      version: '1.0.0',
      description: 'Meta API for health and readiness checks',
    },
  },
);

publicApiServer.start();
adminApiServer.start();
metaApiServer.start();

export {};
