import session from 'express-session';
import * as ConnectRedis from 'connect-redis';
import { metaController } from './controllers/meta.js';
import { healthController } from './controllers/health.js';
import { tenantController } from './controllers/tenants/tenant.controller.js';
import { dashboardController } from './controllers/dashboard.js';
import { authController } from './controllers/auth.controller.js';
import { albumsController } from './controllers/albums/albums.controller.js';
import { albumsWebController } from './controllers/albums/albums.web.controller.js';
import { photosController, albumPhotosController } from './controllers/photos/photos.controller.js';
import { photosWebController } from './controllers/photos/photos.web.controller.js';
import { config } from './lib/config.js';
import { HTTP, middleware, MiddlewareTypes } from './lib/http/index.js';
import { logger } from './lib/logger.js';
import { getDb } from './lib/db/index.js';
import { runMigrations } from './lib/db/migrations.js';
import { health } from './lib/health.js';
import { Redis } from './lib/redis.js';
import { populateUser } from './lib/http/middleware/auth.middleware.js';
import { tenantResolution } from './lib/http/middleware/tenantResolution.middleware.js';
import { authService } from './services/auth.service.js';
import { roleService } from './services/role.service.js';

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

// Seed roles
try {
  log.info('Seeding roles...');
  const seededRoles = await roleService.seedRoles();
  log.info(`Seeded ${String(seededRoles.length)} roles`, {
    roles: seededRoles.map((r) => r.name),
  });
} catch (error) {
  log.error('Failed to seed roles', { error });
  throw error;
}

// Initialize Redis
try {
  log.info('Connecting to Redis...');
  await Redis.getClient('app');
  await Redis.getClient('sessions'); // For session store
  log.info('Redis connected and ready');
} catch (error) {
  log.error('Failed to initialize Redis', { error });
  throw error;
}

// Initialize Auth Service
try {
  log.info('Initializing Keycloak OIDC client...');
  await authService.initialize();
  log.info('Keycloak OIDC client initialized');
} catch (error) {
  log.error('Failed to initialize Keycloak OIDC client', { error });
  log.warn('Authentication will not be available - check Keycloak configuration');
  // Don't throw - allow app to start even if Keycloak is unavailable
}

// Initialize session store
const sessionRedisClient = await Redis.getClient('sessions');

const RedisStore = (ConnectRedis as any).RedisStore;
const sessionMiddleware = middleware({
  name: 'session',
  type: MiddlewareTypes.BEFORE,
  handler: session({
    store: new RedisStore({
      client: sessionRedisClient.raw,
      prefix: 'session:',
    }),
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: config.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: config.SESSION_MAX_AGE,
      sameSite: 'lax',
    },
  }),
});

// Public API Server - User-facing endpoints
const publicApiServer = new HTTP(
  {
    controllers: [
      metaController,
      authController,
      dashboardController,
      albumsWebController,
      photosWebController,
      albumsController,
      photosController,
      albumPhotosController,
    ],
    middlewares: [sessionMiddleware, populateUser, tenantResolution],
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
