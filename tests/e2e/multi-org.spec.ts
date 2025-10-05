import { test, expect, type Page } from '@playwright/test';
import { createKeycloakHelper, type KeycloakTestHelper } from '../helpers/keycloak.js';
import { createDatabaseHelper, type DatabaseTestHelper } from '../helpers/database.js';

/**
 * Multi-Organization & Tenant Switching Tests
 *
 * Verify:
 * - User in multiple orgs can switch tenants
 * - New user gets auto-provisioned tenant
 * - Cannot switch to unauthorized tenant
 */

let keycloak: KeycloakTestHelper;
let database: DatabaseTestHelper;

test.describe('Multi-Organization & Tenant Switching', () => {
  test.beforeEach(async () => {
    // Clean database before each test
    database = createDatabaseHelper();
    await database.cleanup();
  });

  test.afterEach(async () => {
    if (keycloak) {
      await keycloak.cleanup();
    }
    if (database) {
      await database.close();
    }
  });

  async function loginViaUI(page: Page, email: string, password: string) {
    await page.goto('/auth/login');
    await page.waitForURL(/sso\.next\.takaro\.dev/, { timeout: 30000 });

    // Step 1: Fill in username and click Sign In button
    await page.fill('input[name="username"]', email);
    await page.click('button:has-text("Sign In")');

    // Step 2: Wait for password field to appear, then fill and submit
    await page.waitForSelector('input[name="password"]', { timeout: 30000 });
    await page.fill('input[name="password"]', password);
    await page.click('button:has-text("Sign In")');

    // Wait for redirect back to app
    await page.waitForURL(/devbox:3000/, { timeout: 30000 });
  }

  test('User in multiple orgs can switch tenants', async ({ page }) => {
    keycloak = createKeycloakHelper();

    // Create multi-org user
    const user = await keycloak.createUser('multi-org@test.com', 'TestPassword123!');

    // Create two organizations
    const orgA = await keycloak.createOrganization('Multi Org A');
    const orgB = await keycloak.createOrganization('Multi Org B');

    // Assign user to both organizations
    await keycloak.assignUserToOrg(user.id, orgA.id);
    await keycloak.assignUserToOrg(user.id, orgB.id);

    // Login
    await loginViaUI(page, 'multi-org@test.com', 'TestPassword123!');

    // Wait for tenant selector to load (user has multiple orgs)
    await page.waitForSelector('[data-testid="tenant-selector"]', { timeout: 10000 });

    // User should see tenant selector (since they have multiple orgs)
    await expect(page.locator('[data-testid="tenant-selector"]')).toBeVisible();

    // Create album in current tenant
    // WORKAROUND: CSS bug where tenant selector overlaps content
    // Navigate directly instead of clicking
    await page.goto('/albums/new');
    await page.fill('input[name="name"]', 'Album in First Tenant');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/albums\/[a-f0-9-]+/);

    // Navigate to albums list before switching tenants
    // (to avoid 404 when page reloads with album ID that doesn't exist in new tenant)
    await page.goto('/albums');

    // Switch to other tenant
    await page.click('[data-testid="tenant-selector"]');
    await page.click('[data-testid="tenant-option"]:not([data-selected="true"])');

    // Wait for page reload after tenant switch
    await page.waitForURL(/devbox:3000/);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Album in First Tenant')).not.toBeVisible();

    // Create album in second tenant
    await page.goto('/albums/new');
    await page.fill('input[name="name"]', 'Album in Second Tenant');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/albums\/[a-f0-9-]+/);

    // Verify album appears
    await page.goto('/albums');
    await expect(page.locator('text=Album in Second Tenant')).toBeVisible();

    // Switch back to first tenant - click the one that's NOT currently selected
    await page.click('[data-testid="tenant-selector"]');
    await page.click('[data-testid="tenant-option"]:not([data-selected="true"])');
    await page.waitForURL(/devbox:3000/);
    await page.waitForLoadState('networkidle');

    // Verify first album is back (already on albums page from reload)
    await expect(page.locator('text=Album in First Tenant')).toBeVisible();
    await expect(page.locator('text=Album in Second Tenant')).not.toBeVisible();
  });

  test('New user gets auto-provisioned tenant', async ({ page }) => {
    keycloak = createKeycloakHelper();

    // Create new user WITHOUT assigning to any organization
    const user = await keycloak.createUser('new-user@test.com', 'TestPassword123!');

    // Login - should trigger auto-provisioning
    await loginViaUI(page, 'new-user@test.com', 'TestPassword123!');

    // User should be successfully logged in (not stuck at login)
    await page.waitForURL(/devbox:3000/);
    await expect(page).not.toHaveURL(/\/auth\/login/);

    // User should be able to create albums (has tenant context)
    await page.goto('/albums');
    await page.waitForLoadState('networkidle');
    // Click create album button
    await page.click('a[href="/albums/new"]');
    await page.fill('input[name="name"]', 'Auto-Provisioned Album');
    await page.click('button[type="submit"]');

    // Should succeed
    await page.waitForURL(/\/albums\/[a-f0-9-]+/);
    await expect(page.locator('h1', { hasText: 'Auto-Provisioned Album' })).toBeVisible();
  });

  test('Cannot switch to unauthorized tenant', async ({ page, request }) => {
    keycloak = createKeycloakHelper();

    // Create two users with separate organizations
    const userA = await keycloak.createUser('user-a@test.com', 'TestPassword123!');
    const userB = await keycloak.createUser('user-b@test.com', 'TestPassword123!');

    const orgA = await keycloak.createOrganization('Org A');
    const orgB = await keycloak.createOrganization('Org B');

    await keycloak.assignUserToOrg(userA.id, orgA.id);
    await keycloak.assignUserToOrg(userB.id, orgB.id);

    // Login as User A
    await loginViaUI(page, 'user-a@test.com', 'TestPassword123!');

    // Get User A's current tenant ID
    const tenantsResponse = await page.request.get('/auth/tenants');
    const tenantsData = await tenantsResponse.json();
    const userATenantId = tenantsData.currentTenantId;

    // Get User B's tenant ID by logging in as them
    await page.goto('/auth/logout');
    await page.waitForLoadState('networkidle');
    // Clear all cookies to ensure complete logout
    await page.context().clearCookies();
    await page.waitForTimeout(500);

    await loginViaUI(page, 'user-b@test.com', 'TestPassword123!');
    await page.waitForURL(/devbox:3000/, { timeout: 30000 });

    const tenantsBResponse = await page.request.get('/auth/tenants');
    const tenantsBData = await tenantsBResponse.json();
    const userBTenantId = tenantsBData.currentTenantId;

    // Logout and login back as User A
    await page.goto('/auth/logout');
    await page.waitForLoadState('networkidle');
    // Clear all cookies to ensure complete logout
    await page.context().clearCookies();
    await page.waitForTimeout(500);

    await loginViaUI(page, 'user-a@test.com', 'TestPassword123!');
    await page.waitForURL(/devbox:3000/, { timeout: 30000 });

    // Attempt to switch to User B's tenant via API
    const switchResponse = await page.request.put('/auth/tenant', {
      data: {
        tenantId: userBTenantId,
      },
    });

    // Should fail (403 Forbidden or 422 validation error)
    expect([403, 422]).toContain(switchResponse.status());

    // Verify User A is still in their own tenant
    const currentTenantsResponse = await page.request.get('/auth/tenants');
    const currentTenantsData = await currentTenantsResponse.json();
    expect(currentTenantsData.currentTenantId).toBe(userATenantId);
  });

  test('Tenant selector shows correct tenant name', async ({ page }) => {
    keycloak = createKeycloakHelper();

    const user = await keycloak.createUser('selector-test@test.com', 'TestPassword123!');
    // Create 2 orgs so tenant selector renders (only shows when user has multiple tenants)
    const org1 = await keycloak.createOrganization('My Test Organization');
    const org2 = await keycloak.createOrganization('Other Organization');

    await keycloak.assignUserToOrg(user.id, org1.id);
    await keycloak.assignUserToOrg(user.id, org2.id);

    await loginViaUI(page, 'selector-test@test.com', 'TestPassword123!');

    // Wait for tenant selector to load
    await page.waitForSelector('[data-testid="tenant-selector"]', { timeout: 10000 });

    // Check that tenant selector shows organization name
    await expect(
      page.locator('[data-testid="tenant-selector"]:has-text("My Test Organization")'),
    ).toBeVisible();
  });
});
