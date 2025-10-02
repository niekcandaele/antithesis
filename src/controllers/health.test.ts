import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { HTTP } from '../lib/http/index.js';
import { healthController } from './health.js';
import { health } from '../lib/health.js';

void describe('Health Controller', () => {
  let server: HTTP;
  const port = 3050; // Use a fixed test port

  before(() => {
    server = new HTTP(
      { controllers: [healthController] },
      {
        port,
        oasInfo: {
          title: 'Test API',
          version: '1.0.0',
        },
      },
    );

    server.start();
  });

  after(() => {
    server.stop();
  });

  void it('should return 200 with apiResponse({healthy: true}) when all checks pass', async () => {
    // Register a passing health check
    health.registerHealthHook('test-pass', () => true);

    const response = await fetch(`http://localhost:${String(port)}/healthz`);
    const data = (await response.json()) as { data: { healthy: boolean }; meta: unknown };

    assert.strictEqual(response.status, 200);
    assert.strictEqual(data.data.healthy, true);
    assert.ok(data.meta); // Verify apiResponse wrapper is used

    // Cleanup
    health.unregisterHealthHook('test-pass');
  });

  void it('should return 503 with apiResponse({healthy: false}) when check fails', async () => {
    // Register a failing health check
    health.registerHealthHook('test-fail', () => false);

    const response = await fetch(`http://localhost:${String(port)}/healthz`);
    const data = (await response.json()) as { data: { healthy: boolean }; meta: unknown };

    assert.strictEqual(response.status, 503);
    assert.strictEqual(data.data.healthy, false);
    assert.ok(data.meta); // Verify apiResponse wrapper is used

    // Cleanup
    health.unregisterHealthHook('test-fail');
  });

  void it('/readyz should check both health and readiness hooks', async () => {
    // Register both types of hooks
    health.registerHealthHook('health-check', () => true);
    health.registerReadinessHook('readiness-check', () => true);

    const response = await fetch(`http://localhost:${String(port)}/readyz`);
    const data = (await response.json()) as { data: { ready: boolean }; meta: unknown };

    assert.strictEqual(response.status, 200);
    assert.strictEqual(data.data.ready, true);

    // Cleanup
    health.unregisterHealthHook('health-check');
    health.unregisterReadinessHook('readiness-check');
  });

  void it('/readyz should return 503 if readiness check fails', async () => {
    // Health passes but readiness fails
    health.registerHealthHook('health-ok', () => true);
    health.registerReadinessHook('readiness-fail', () => false);

    const response = await fetch(`http://localhost:${String(port)}/readyz`);
    const data = (await response.json()) as { data: { ready: boolean }; meta: unknown };

    assert.strictEqual(response.status, 503);
    assert.strictEqual(data.data.ready, false);

    // Cleanup
    health.unregisterHealthHook('health-ok');
    health.unregisterReadinessHook('readiness-fail');
  });

  void it('should use apiResponse() wrapper', async () => {
    const response = await fetch(`http://localhost:${String(port)}/healthz`);
    const data = (await response.json()) as { data: unknown; meta: { serverTime: string } };

    // Verify apiResponse structure
    assert.ok(data.data);
    assert.ok(data.meta);
    assert.ok(data.meta.serverTime);
  });
});
