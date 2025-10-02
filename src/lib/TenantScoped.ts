import type { Logger } from 'winston';
import { logger } from './logger.js';
import type { TenantId } from './types.js';

/**
 * Base class for tenant-scoped services
 *
 * Provides automatic tenant context and scoped logging with tenantId metadata.
 * All logs from extending classes will automatically include the tenantId.
 *
 * @example
 * ```typescript
 * class MyService extends TenantScoped {
 *   constructor(tenantId: TenantId) {
 *     super(tenantId);
 *   }
 *
 *   async doSomething() {
 *     // Logger automatically includes tenantId metadata
 *     this.log.info('Processing request');
 *     // Output: { namespace: 'MyService', tenantId: 'tenant-123', message: 'Processing request' }
 *   }
 * }
 * ```
 */
export abstract class TenantScoped {
  /** The tenant ID for this scoped instance */
  protected readonly tenantId: TenantId;

  /** Logger with class name namespace and tenantId metadata */
  protected readonly log: Logger;

  /**
   * Creates a tenant-scoped instance
   *
   * @param tenantId - The tenant ID to scope this instance to
   */
  constructor(tenantId: TenantId) {
    this.tenantId = tenantId;
    this.log = logger(this.constructor.name, { tenantId });
  }
}
