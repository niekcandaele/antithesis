import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Health } from './health.js';

void describe('Health', () => {
  void it('should register and execute health hooks separately', () => {
    const health = new Health();

    let healthCalled = false;
    let readinessCalled = false;

    health.registerHealthHook('test-health', () => {
      healthCalled = true;
      return true;
    });

    health.registerReadinessHook('test-readiness', () => {
      readinessCalled = true;
      return true;
    });

    // Reset flags
    healthCalled = false;
    readinessCalled = false;

    // checkHealth should only call health hooks
    void health.checkHealth();
    assert.strictEqual(healthCalled, true);
    assert.strictEqual(readinessCalled, false);
  });

  void it('should return true when all health hooks succeed', async () => {
    const health = new Health();

    health.registerHealthHook('hook1', () => true);
    health.registerHealthHook('hook2', () => Promise.resolve(true));

    const result = await health.checkHealth();
    assert.strictEqual(result, true);
  });

  void it('should return true when all health and readiness hooks succeed', async () => {
    const health = new Health();

    health.registerHealthHook('health1', () => true);
    health.registerReadinessHook('ready1', () => Promise.resolve(true));

    const result = await health.checkReadiness();
    assert.strictEqual(result, true);
  });

  void it('should return false if any hook in checkReadiness fails', async () => {
    const health = new Health();

    health.registerHealthHook('health-pass', () => true);
    health.registerReadinessHook('ready-fail', () => false);

    const result = await health.checkReadiness();
    assert.strictEqual(result, false);
  });

  void it('should handle async hook execution correctly', async () => {
    const health = new Health();

    let asyncExecuted = false;

    health.registerHealthHook('async-hook', async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      asyncExecuted = true;
      return true;
    });

    const result = await health.checkHealth();
    assert.strictEqual(result, true);
    assert.strictEqual(asyncExecuted, true);
  });

  void it('should unregister health hooks', async () => {
    const health = new Health();

    health.registerHealthHook('to-remove', () => false);
    health.unregisterHealthHook('to-remove');

    // Should return true since no hooks are registered
    const result = await health.checkHealth();
    assert.strictEqual(result, true);
  });

  void it('should unregister readiness hooks', async () => {
    const health = new Health();

    health.registerReadinessHook('to-remove', () => false);
    health.unregisterReadinessHook('to-remove');

    // Should return true since no hooks are registered
    const result = await health.checkReadiness();
    assert.strictEqual(result, true);
  });

  void it('should return false if hook throws an error', async () => {
    const health = new Health();

    health.registerHealthHook('throwing-hook', () => {
      throw new Error('Hook failed');
    });

    const result = await health.checkHealth();
    assert.strictEqual(result, false);
  });

  void it('checkReadiness should execute both health and readiness hooks', async () => {
    const health = new Health();

    let healthExecuted = false;
    let readinessExecuted = false;

    health.registerHealthHook('health', () => {
      healthExecuted = true;
      return true;
    });

    health.registerReadinessHook('readiness', () => {
      readinessExecuted = true;
      return true;
    });

    await health.checkReadiness();

    assert.strictEqual(healthExecuted, true);
    assert.strictEqual(readinessExecuted, true);
  });
});
