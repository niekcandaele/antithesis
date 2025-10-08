import { test, expect, type Page } from '@playwright/test';
import { createKeycloakHelper, type KeycloakTestHelper } from '../helpers/keycloak.js';
import { createDatabaseHelper, type DatabaseTestHelper } from '../helpers/database.js';

/**
 * Tenant Isolation E2E Tests
 *
 * Verify that tenant data is properly isolated:
 * - User A cannot see User B's albums
 * - User A cannot access User B's album by direct URL
 * - User A cannot add photos to User B's albums
 * - User A cannot access User B's photos
 *
 * Note: With auto-provisioning, each user gets their own personal tenant
 * automatically on first login (e.g., "tenant-a-personal", "tenant-b-personal").
 * No manual tenant/organization setup needed.
 */

let keycloak: KeycloakTestHelper;
let database: DatabaseTestHelper;
let userAId: string;
let userBId: string;

test.describe('Tenant Isolation', () => {
  test.beforeAll(async () => {
    // Clean database before tests
    database = createDatabaseHelper();
    await database.cleanup();

    keycloak = createKeycloakHelper();

    // Create two test users in Keycloak
    // Their personal tenants will be auto-provisioned on first login
    const userA = await keycloak.createUser('tenant-a@test.com', 'TestPassword123!');
    const userB = await keycloak.createUser('tenant-b@test.com', 'TestPassword123!');
    userAId = userA.id;
    userBId = userB.id;
  });

  test.afterAll(async () => {
    // Cleanup test data
    await keycloak.cleanup();
    await database.close();
  });

  /**
   * Helper function to login via the UI
   * Handles Keycloak's two-step login flow
   */
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

  test('User A creates album - visible to A only', async ({ page }) => {
    // Login as User A
    await loginViaUI(page, 'tenant-a@test.com', 'TestPassword123!');

    // Navigate to albums page
    await page.goto('/albums');

    // Create an album
    await page.click('a[href="/albums/new"]');
    await page.fill('input[name="name"]', 'User A Test Album');
    await page.fill('textarea[name="description"]', 'This album belongs to User A');
    await page.click('button[type="submit"]');

    // Verify album appears in list
    await page.goto('/albums');
    await expect(page.locator('text=User A Test Album')).toBeVisible();
  });

  test('User B cannot see User A album', async ({ page }) => {
    // Login as User B
    await loginViaUI(page, 'tenant-b@test.com', 'TestPassword123!');

    // Navigate to albums page
    await page.goto('/albums');

    // Verify User A's album is NOT visible
    await expect(page.locator('text=User A Test Album')).not.toBeVisible();
  });

  test('User B cannot access User A album by direct URL', async ({ page, context }) => {
    // First, login as User A and create an album, capturing its ID
    await loginViaUI(page, 'tenant-a@test.com', 'TestPassword123!');
    await page.goto('/albums');

    // Create an album and get its ID from the URL after creation
    await page.click('a[href="/albums/new"]');
    await page.fill('input[name="name"]', 'Protected Album');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/albums\/[a-f0-9-]+/);

    const albumUrl = page.url();
    const albumId = albumUrl.split('/albums/')[1];

    // Logout User A
    await page.goto('/auth/logout');
    await page.waitForLoadState('networkidle');
    // Clear cookies to ensure complete logout
    await page.context().clearCookies();
    await page.waitForTimeout(500);

    // Login as User B
    await loginViaUI(page, 'tenant-b@test.com', 'TestPassword123!');

    // Attempt to access User A's album by direct URL
    await page.goto(`/albums/${albumId}`);

    // Should get 404 or error page, NOT the album details
    await expect(page.locator('text=Protected Album')).not.toBeVisible();
    // Verify we see an error message or 404 (target heading to avoid strict mode)
    await expect(
      page.locator('h1, h2').filter({ hasText: /Not Found|Forbidden|Access Denied/i }),
    ).toBeVisible();
  });

  test('User A cannot add photos to User B album', async ({ page }) => {
    // Login as User B and create an album
    await loginViaUI(page, 'tenant-b@test.com', 'TestPassword123!');
    await page.goto('/albums');
    await page.click('a[href="/albums/new"]');
    await page.fill('input[name="name"]', 'User B Album');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/albums\/[a-f0-9-]+/);

    const userBAlbumUrl = page.url();
    const userBAlbumId = userBAlbumUrl.split('/albums/')[1];

    // Logout User B
    await page.goto('/auth/logout');
    await page.waitForLoadState('networkidle');
    // Clear cookies to ensure complete logout
    await page.context().clearCookies();
    await page.waitForTimeout(500);

    // Login as User A
    await loginViaUI(page, 'tenant-a@test.com', 'TestPassword123!');

    // Attempt to add a photo to User B's album via direct URL
    await page.goto(`/albums/${userBAlbumId}/photos/new`);

    // Should get error, not the photo upload form
    await expect(
      page.locator('text=/Cannot GET|Not Found|Forbidden|Access Denied/i'),
    ).toBeVisible();
  });

  test('User A cannot access User B photos', async ({ page }) => {
    // Login as User B and create an album with a photo
    await loginViaUI(page, 'tenant-b@test.com', 'TestPassword123!');
    await page.goto('/albums');
    await page.click('a[href="/albums/new"]');
    await page.fill('input[name="name"]', 'User B Photo Album');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/albums\/[a-f0-9-]+/);

    // Add a photo to the album
    await page.click('a[href*="/photos/new"]');
    await page.fill('input[name="title"]', 'User B Photo');
    await page.fill('input[name="url"]', 'https://example.com/photo-b.jpg');
    await page.click('button[type="submit"]');

    // Wait for redirect back to album detail page (photos redirect to album, not to photo detail)
    await page.waitForURL(/\/albums\/[a-f0-9-]+/);

    // Find the photo edit link to extract photo ID
    const photoEditLink = await page.locator('a[href*="/photos/"][href*="/edit"]').first();
    const editHref = await photoEditLink.getAttribute('href');
    const photoId = editHref?.split('/photos/')[1]?.split('/')[0];

    // Logout User B
    await page.goto('/auth/logout');
    await page.waitForLoadState('networkidle');
    // Clear cookies to ensure complete logout
    await page.context().clearCookies();
    await page.waitForTimeout(500);

    // Login as User A
    await loginViaUI(page, 'tenant-a@test.com', 'TestPassword123!');

    // Attempt to access User B's photo by direct URL
    await page.goto(`/photos/${photoId}`);

    // Should get error, not the photo details
    await expect(page.locator('text=User B Photo')).not.toBeVisible();
    // Verify error message (target heading to avoid strict mode)
    await expect(
      page.locator('h1, h2').filter({ hasText: /Not Found|Forbidden|Access Denied/i }),
    ).toBeVisible();
  });
});
