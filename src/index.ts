import { metaController } from './controllers/meta.js';
import { healthController } from './controllers/health.js';
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
    await db.selectFrom('users').select('id').limit(1).execute();
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

const server = new HTTP(
  {
    controllers: [metaController, healthController],
  },
  {
    port: config.PORT,
    oasInfo: {
      title: 'Antithesis API',
      version: '1.0.0',
      description: 'API for the Antithesis application',
    },
  },
);

server.start();

export {};
