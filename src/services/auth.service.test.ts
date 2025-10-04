import { describe, it } from 'node:test';
import assert from 'node:assert';
import { AuthService } from './auth.service.js';

void describe('AuthService', () => {
  void it('should extract organizations from UserInfo response', () => {
    const service = new AuthService();

    // Access the private method through type casting
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    const extractOrganizations = (service as any).extractOrganizations.bind(service);

    // Test with organizations array
    const userInfo1 = { organizations: ['org-1', 'org-2'] };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    assert.deepStrictEqual(extractOrganizations(userInfo1), ['org-1', 'org-2']);

    // Test with organization_ids array
    const userInfo2 = { organization_ids: ['org-3', 'org-4'] };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    assert.deepStrictEqual(extractOrganizations(userInfo2), ['org-3', 'org-4']);

    // Test with groups with org- prefix
    const userInfo3 = { groups: ['org-5', 'org-6', 'other-group'] };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    assert.deepStrictEqual(extractOrganizations(userInfo3), ['5', '6']);

    // Test with empty response
    const userInfo4 = {};
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    assert.deepStrictEqual(extractOrganizations(userInfo4), []);
  });

  void it('should generate correct logout URL', () => {
    const service = new AuthService();
    const logoutUrl = service.getLogoutUrl('http://localhost:3000');

    assert.ok(logoutUrl.includes('/protocol/openid-connect/logout'));
    assert.ok(logoutUrl.includes('redirect_uri='));
  });
});
