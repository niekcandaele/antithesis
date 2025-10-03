/**
 * Type for health check hooks
 * Returns true if healthy, false or throws if unhealthy
 */
export type HealthHook = () => Promise<boolean> | boolean;

/**
 * Health check system with separate liveness and readiness registries
 *
 * Follows Kubernetes health check patterns:
 * - Health hooks (liveness): Check if the application is alive
 * - Readiness hooks: Check if the application is ready to serve traffic
 *
 * @example
 * ```typescript
 * // Register liveness check
 * health.registerHealthHook('app-alive', async () => {
 *   // Check if app is functioning
 *   return true;
 * });
 *
 * // Register readiness check
 * health.registerReadinessHook('database', async () => {
 *   await db.ping();
 *   return true;
 * });
 *
 * // Check health (liveness only)
 * const isHealthy = await health.checkHealth();
 *
 * // Check readiness (both health and readiness)
 * const isReady = await health.checkReadiness();
 * ```
 */
export class Health {
  /** Registry for health/liveness checks */
  private readonly healthHooks = new Map<string, HealthHook>();

  /** Registry for readiness checks */
  private readonly readinessHooks = new Map<string, HealthHook>();

  /**
   * Register a health/liveness check hook
   *
   * @param name - Unique name for the hook
   * @param hook - The health check function
   *
   * @example
   * ```typescript
   * health.registerHealthHook('memory', async () => {
   *   const usage = process.memoryUsage();
   *   return usage.heapUsed < usage.heapTotal * 0.9;
   * });
   * ```
   */
  registerHealthHook(name: string, hook: HealthHook): void {
    this.healthHooks.set(name, hook);
  }

  /**
   * Register a readiness check hook
   *
   * @param name - Unique name for the hook
   * @param hook - The readiness check function
   *
   * @example
   * ```typescript
   * health.registerReadinessHook('database', async () => {
   *   try {
   *     await db.raw('SELECT 1');
   *     return true;
   *   } catch {
   *     return false;
   *   }
   * });
   * ```
   */
  registerReadinessHook(name: string, hook: HealthHook): void {
    this.readinessHooks.set(name, hook);
  }

  /**
   * Unregister a health/liveness check hook
   *
   * @param name - Name of the hook to remove
   */
  unregisterHealthHook(name: string): void {
    this.healthHooks.delete(name);
  }

  /**
   * Unregister a readiness check hook
   *
   * @param name - Name of the hook to remove
   */
  unregisterReadinessHook(name: string): void {
    this.readinessHooks.delete(name);
  }

  /**
   * Execute all health/liveness checks
   *
   * @returns True if all health checks pass, false otherwise
   *
   * @example
   * ```typescript
   * const isHealthy = await health.checkHealth();
   * if (!isHealthy) {
   *   console.log('Application is not healthy');
   * }
   * ```
   */
  async checkHealth(): Promise<boolean> {
    try {
      const results = await Promise.all(
        Array.from(this.healthHooks.values()).map((hook) => Promise.resolve(hook())),
      );
      return results.every((r) => r);
    } catch {
      return false;
    }
  }

  /**
   * Execute all health and readiness checks
   *
   * @returns True if all checks pass (both health and readiness), false otherwise
   *
   * @example
   * ```typescript
   * const isReady = await health.checkReadiness();
   * if (!isReady) {
   *   console.log('Application is not ready to serve traffic');
   * }
   * ```
   */
  async checkReadiness(): Promise<boolean> {
    try {
      const allHooks = [
        ...Array.from(this.healthHooks.values()),
        ...Array.from(this.readinessHooks.values()),
      ];
      const results = await Promise.all(allHooks.map((hook) => Promise.resolve(hook())));
      return results.every((r) => r);
    } catch {
      return false;
    }
  }
}

/**
 * Singleton health check instance
 */
export const health = new Health();
