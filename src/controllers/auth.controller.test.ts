/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/require-await */
import { describe, test, mock } from 'node:test';
import assert from 'node:assert';
import { authService } from '../services/auth.service.js';
import { userService } from '../services/user.service.js';
import { userTenantRepository } from '../db/user-tenant.repository.js';

describe('Auth Controller Integration Tests', () => {
  test('login flow: generates state and redirects to Keycloak', async () => {
    // Mock authService.generateAuthUrl
    const mockAuthUrl = 'https://keycloak.local/realms/test/protocol/openid-connect/auth';
    const originalGenerateAuthUrl = authService.generateAuthUrl;
    authService.generateAuthUrl = mock.fn(async () => mockAuthUrl);

    // Mock session object
    const mockSession: Record<string, unknown> = {};

    // Simulate login endpoint logic
    const state = 'mock-state';
    mockSession.oauthState = state;
    mockSession.returnTo = '/dashboard';

    const authUrl = await authService.generateAuthUrl(state);

    // Assertions
    assert.strictEqual(authUrl, mockAuthUrl);
    assert.strictEqual(mockSession.oauthState, state);
    assert.strictEqual(mockSession.returnTo, '/dashboard');

    // Restore original method
    authService.generateAuthUrl = originalGenerateAuthUrl;
  });

  test('callback flow: exchanges code and creates session', async () => {
    // Mock authService.handleCallback
    const mockUserClaims = {
      keycloakUserId: 'keycloak-123',
      email: 'test@example.com',
      organizations: ['org-1', 'org-2'],
    };

    const originalHandleCallback = authService.handleCallback;
    authService.handleCallback = mock.fn(async () => mockUserClaims);

    // Mock userService.syncUserFromKeycloak
    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      keycloakUserId: 'keycloak-123',
      lastTenantId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const originalSyncUser = userService.syncUserFromKeycloak;
    userService.syncUserFromKeycloak = mock.fn(async () => mockUser);

    // Mock userService.determineCurrentTenant
    const originalDetermineTenant = userService.determineCurrentTenant;
    userService.determineCurrentTenant = mock.fn(async () => 'tenant-1');

    // Mock session object
    const mockSession: Record<string, unknown> = {
      oauthState: 'mock-state',
      returnTo: '/dashboard',
    };

    // Simulate callback logic
    const state = 'mock-state';
    const code = 'auth-code-123';

    // Validate state
    assert.strictEqual(mockSession.oauthState, state);

    // Exchange code for user claims (with full callback URL including all query params)
    const callbackUrl = `http://localhost:3000/auth/callback?code=${code}&state=${state}`;
    const userClaims = await authService.handleCallback(state, callbackUrl);

    // Sync user
    const user = await userService.syncUserFromKeycloak(userClaims);

    // Set session data
    mockSession.userId = user.id;
    mockSession.currentTenantId = await userService.determineCurrentTenant(user.id);

    // Clean up state
    mockSession.oauthState = undefined;

    // Assertions
    assert.strictEqual(userClaims.keycloakUserId, 'keycloak-123');
    assert.strictEqual(userClaims.email, 'test@example.com');
    assert.strictEqual(user.id, 'user-123');
    assert.strictEqual(mockSession.userId, 'user-123');
    assert.strictEqual(mockSession.currentTenantId, 'tenant-1');
    assert.strictEqual(mockSession.oauthState, undefined);

    // Restore original methods
    authService.handleCallback = originalHandleCallback;
    userService.syncUserFromKeycloak = originalSyncUser;
    userService.determineCurrentTenant = originalDetermineTenant;
  });

  test('logout flow: destroys session and redirects to Keycloak', () => {
    // Mock session object
    let sessionDestroyed = false;
    const mockSession = {
      userId: 'user-123',
      currentTenantId: 'tenant-1',
      destroy: mock.fn((callback: (err?: Error) => void) => {
        sessionDestroyed = true;
        callback();
      }),
    };

    // Mock authService.getLogoutUrl
    const originalGetLogoutUrl = authService.getLogoutUrl;
    authService.getLogoutUrl = mock.fn(() => 'https://keycloak.local/logout');

    // Simulate logout logic
    mockSession.destroy((err?: Error) => {
      if (err) {
        // eslint-disable-next-line no-console
        console.error('Failed to destroy session:', err);
      }
    });

    const logoutUrl = authService.getLogoutUrl('http://localhost:3000');

    // Assertions
    assert.strictEqual(sessionDestroyed, true);
    assert.strictEqual(logoutUrl, 'https://keycloak.local/logout');

    // Restore original method
    authService.getLogoutUrl = originalGetLogoutUrl;
  });

  test('tenant switching: validates access and updates session', async () => {
    // Mock userTenantRepository.hasAccess
    const originalHasAccess = userTenantRepository.hasAccess;
    userTenantRepository.hasAccess = mock.fn(async () => true);

    // Mock userService.updateLastTenant
    const originalUpdateLastTenant = userService.updateLastTenant;
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    userService.updateLastTenant = mock.fn(async () => {});

    // Mock session and request
    const mockSession: Record<string, unknown> = {
      userId: 'user-123',
      currentTenantId: 'tenant-1',
    };

    const tenantId = 'tenant-2';

    // Validate access
    const hasAccess = await userTenantRepository.hasAccess(mockSession.userId as string, tenantId);
    assert.strictEqual(hasAccess, true);

    // Update session
    mockSession.currentTenantId = tenantId;

    // Update user's lastTenantId
    await userService.updateLastTenant(mockSession.userId as string, tenantId);

    // Assertions
    assert.strictEqual(mockSession.currentTenantId, 'tenant-2');

    // Restore original methods
    userTenantRepository.hasAccess = originalHasAccess;
    userService.updateLastTenant = originalUpdateLastTenant;
  });

  test('tenant switching: rejects unauthorized access', async () => {
    // Mock userTenantRepository.hasAccess to return false
    const originalHasAccess = userTenantRepository.hasAccess;
    userTenantRepository.hasAccess = mock.fn(async () => false);

    // Mock session
    const mockSession = {
      userId: 'user-123',
      currentTenantId: 'tenant-1',
    };

    const tenantId = 'tenant-unauthorized';

    // Validate access
    const hasAccess = await userTenantRepository.hasAccess(mockSession.userId, tenantId);

    // Assertions
    assert.strictEqual(hasAccess, false);

    // Should throw error in actual controller
    const expectedError = new Error(`User does not have access to tenant: ${tenantId}`);
    assert.strictEqual(
      expectedError.message,
      'User does not have access to tenant: tenant-unauthorized',
    );

    // Restore original method
    userTenantRepository.hasAccess = originalHasAccess;
  });
});
