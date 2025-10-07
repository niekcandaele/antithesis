import { describe, it } from 'node:test';
import assert from 'node:assert';
import { AuthService } from './auth.service.js';

void describe('AuthService', () => {
  void it('should generate correct logout URL', () => {
    const service = new AuthService();
    const logoutUrl = service.getLogoutUrl('http://localhost:3000');

    assert.ok(logoutUrl.includes('/protocol/openid-connect/logout'));
    assert.ok(logoutUrl.includes('redirect_uri='));
  });
});
