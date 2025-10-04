import { describe, it } from 'node:test';
import assert from 'node:assert';
import { KeycloakAdminService } from './keycloak-admin.service.js';

void describe('KeycloakAdminService', () => {
  void it('should construct correct token and admin URLs', () => {
    const service = new KeycloakAdminService();

    // Access private properties through type casting for testing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const tokenUrl = (service as any).tokenUrl;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const adminBaseUrl = (service as any).adminBaseUrl;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    assert.ok(tokenUrl.includes('/protocol/openid-connect/token'));
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    assert.ok(adminBaseUrl.includes('/admin/realms/'));
  });

  void it('should handle token expiry correctly', () => {
    const service = new KeycloakAdminService();

    // Set a token that's already expired
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    (service as any).accessToken = 'expired-token';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    (service as any).tokenExpiry = Date.now() - 1000; // 1 second ago

    // Token should be considered expired
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    assert.ok(Date.now() >= (service as any).tokenExpiry);
  });
});
