import { metaController } from './controllers/meta.js';
import { config } from './lib/config.js';
import { HTTP } from './lib/http/index.js';
import { logger } from './lib/logger.js';

const log = logger('app');

log.info(`Starting ${config.APP_NAME}...`);

const server = new HTTP(
  {
    controllers: [metaController],
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
