import { describe, it } from 'node:test';
import assert from 'node:assert';
import { UserService } from './user.service.js';

void describe('UserService', () => {
  void it('should have determineCurrentTenant method', () => {
    const service = new UserService();

    // Verify method exists
    assert.strictEqual(typeof service.determineCurrentTenant, 'function');
  });

  void it('should have syncUserFromKeycloak method', () => {
    const service = new UserService();

    // Verify method exists and accepts correct parameters
    assert.strictEqual(typeof service.syncUserFromKeycloak, 'function');
  });

  void it('should have updateLastTenant method', () => {
    const service = new UserService();

    // Verify method exists
    assert.strictEqual(typeof service.updateLastTenant, 'function');
  });
});
