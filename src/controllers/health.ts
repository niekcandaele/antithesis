import type { Response } from 'express';
import { controller, get, apiResponse } from '../lib/http/index.js';
import { health } from '../lib/health.js';

/**
 * Health check controller
 *
 * Provides Kubernetes-compatible health check endpoints:
 * - /healthz: Liveness probe (checks if app is alive)
 * - /readyz: Readiness probe (checks if app can serve traffic)
 */
export const healthController = controller('health')
  .description('Health check endpoints for monitoring')
  .endpoints([
    /**
     * Liveness probe endpoint
     *
     * Returns 200 if the application is alive and functioning.
     * Returns 503 if any health checks fail.
     */
    get('/healthz', 'checkHealth')
      .description('Liveness probe - checks if application is alive')
      .hideFromOpenAPI()
      .handler(async (_inputs, _req, res: Response) => {
        const isHealthy = await health.checkHealth();

        if (isHealthy) {
          res.status(200);
          return apiResponse({ healthy: true });
        } else {
          res.status(503);
          return apiResponse({ healthy: false });
        }
      }),

    /**
     * Readiness probe endpoint
     *
     * Returns 200 if the application is ready to serve traffic.
     * Returns 503 if any health or readiness checks fail.
     */
    get('/readyz', 'checkReadiness')
      .description('Readiness probe - checks if application can serve traffic')
      .hideFromOpenAPI()
      .handler(async (_inputs, _req, res: Response) => {
        const isReady = await health.checkReadiness();

        if (isReady) {
          res.status(200);
          return apiResponse({ ready: true });
        } else {
          res.status(503);
          return apiResponse({ ready: false });
        }
      }),
  ]);
