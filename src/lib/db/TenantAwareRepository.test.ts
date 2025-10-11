import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import { TenantAwareRepository } from './TenantAwareRepository.js';
import { HTTP } from '../http/app.js';
import { controller } from '../http/controller.js';
import { get } from '../http/endpoint.js';
import { getServerContext } from '../http/serverContext.js';
import { BadRequestError } from '../http/errors.js';

// Test implementation of TenantAwareRepository
class TestRepository extends TenantAwareRepository {
  // Expose protected methods for testing
  public testGetTenantId(): string {
    return this.getTenantId();
  }

  public testHasTenantContext(): boolean {
    return this.hasTenantContext();
  }
}

void describe('TenantAwareRepository', () => {
  let httpServer: HTTP | undefined;
  const repository = new TestRepository();

  after(() => {
    httpServer?.stop();
  });

  void it('getTenantId() should throw BadRequestError when no tenant context', async () => {
    const results: { error?: Error } = {};

    const testController = controller('/')
      .description('Test controller')
      .endpoints([
        get('/no-tenant', 'noTenant').handler(async () => {
          const ctx = getServerContext();
          // Context exists but tenantId is undefined
          assert.ok(ctx);
          assert.strictEqual(ctx.tenantId, undefined);

          // Try to get tenantId - should throw
          try {
            repository.testGetTenantId();
          } catch (error) {
            results.error = error as Error;
          }

          await Promise.resolve(); // Make it actually async
          return { success: true };
        }),
      ]);

    httpServer = new HTTP(
      { controllers: [testController] },
      { port: 3057, oasInfo: { title: 'Test', version: '1.0.0' } },
    );
    httpServer.start();

    const response = await fetch('http://localhost:3057/no-tenant');
    assert.strictEqual(response.status, 200);

    assert.ok(results.error);
    assert.ok(results.error instanceof BadRequestError);
    assert.strictEqual(results.error.message, 'Tenant context required for this operation');

    httpServer.stop();
    httpServer = undefined;
  });

  void it('getTenantId() should return tenantId when context exists', async () => {
    const results: { tenantId?: string } = {};

    const testController = controller('/')
      .description('Test controller')
      .endpoints([
        get('/with-tenant', 'withTenant').handler(async () => {
          const ctx = getServerContext();
          // Manually set tenantId for test
          ctx.tenantId = 'test-tenant-123';

          // Get tenantId - should succeed
          results.tenantId = repository.testGetTenantId();

          await Promise.resolve();
          return { success: true };
        }),
      ]);

    httpServer = new HTTP(
      { controllers: [testController] },
      { port: 3058, oasInfo: { title: 'Test', version: '1.0.0' } },
    );
    httpServer.start();

    const response = await fetch('http://localhost:3058/with-tenant');
    assert.strictEqual(response.status, 200);

    assert.strictEqual(results.tenantId, 'test-tenant-123');

    httpServer.stop();
    httpServer = undefined;
  });

  void it('hasTenantContext() should return false when no context', async () => {
    const results: { hasContext?: boolean } = {};

    const testController = controller('/')
      .description('Test controller')
      .endpoints([
        get('/check-no-context', 'checkNoContext').handler(async () => {
          const ctx = getServerContext();
          // Context exists but tenantId is undefined
          assert.strictEqual(ctx.tenantId, undefined);

          results.hasContext = repository.testHasTenantContext();

          await Promise.resolve();
          return { success: true };
        }),
      ]);

    httpServer = new HTTP(
      { controllers: [testController] },
      { port: 3059, oasInfo: { title: 'Test', version: '1.0.0' } },
    );
    httpServer.start();

    const response = await fetch('http://localhost:3059/check-no-context');
    assert.strictEqual(response.status, 200);

    assert.strictEqual(results.hasContext, false);

    httpServer.stop();
    httpServer = undefined;
  });

  void it('hasTenantContext() should return true when context exists', async () => {
    const results: { hasContext?: boolean } = {};

    const testController = controller('/')
      .description('Test controller')
      .endpoints([
        get('/check-with-context', 'checkWithContext').handler(async () => {
          const ctx = getServerContext();
          ctx.tenantId = 'test-tenant-456';

          results.hasContext = repository.testHasTenantContext();

          await Promise.resolve();
          return { success: true };
        }),
      ]);

    httpServer = new HTTP(
      { controllers: [testController] },
      { port: 3060, oasInfo: { title: 'Test', version: '1.0.0' } },
    );
    httpServer.start();

    const response = await fetch('http://localhost:3060/check-with-context');
    assert.strictEqual(response.status, 200);

    assert.strictEqual(results.hasContext, true);

    httpServer.stop();
    httpServer = undefined;
  });
});
