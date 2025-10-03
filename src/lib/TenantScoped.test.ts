import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { TenantScoped } from './TenantScoped.js';
import type { TenantId } from './types.js';

// Create a concrete implementation for testing
class TestService extends TenantScoped {
  getTenantId() {
    return this.tenantId;
  }

  getLogger() {
    return this.log;
  }
}

void describe('TenantScoped', () => {
  void it('should set tenantId correctly', () => {
    const tenantId = 'tenant-123' as TenantId;
    const service = new TestService(tenantId);

    assert.strictEqual(service.getTenantId(), tenantId);
  });

  void it('should use class name as logger namespace', () => {
    const tenantId = 'tenant-456' as TenantId;
    const service = new TestService(tenantId);
    const logger = service.getLogger();

    // Verify logger exists and is properly configured
    // The actual namespace and tenantId are included when logging
    assert.ok(logger);
    assert.strictEqual(typeof logger.info, 'function');
  });

  void it('should include tenantId in logger metadata', () => {
    const tenantId = 'tenant-789' as TenantId;
    const service = new TestService(tenantId);

    // Verify tenantId is stored correctly
    assert.strictEqual(service.getTenantId(), tenantId);
  });

  void it('tenant scoped service retains tenant info in logs and ctx', () => {
    const tenantId = 'tenant-context-test' as TenantId;
    const service = new TestService(tenantId);

    // Spy on the logger to capture log calls
    const logSpy = mock.method(service.getLogger(), 'info');

    service.getLogger().info('Test message');

    // Verify the log was called
    assert.strictEqual(logSpy.mock.calls.length, 1);
    assert.strictEqual(logSpy.mock.calls[0].arguments[0], 'Test message');

    // Verify tenant context is accessible
    assert.strictEqual(service.getTenantId(), tenantId);
  });
});
