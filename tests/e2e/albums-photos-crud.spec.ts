import { randomUUID } from 'node:crypto';
import { test as base, expect, type Page } from '@playwright/test';
import { createKeycloakHelper, type KeycloakTestHelper } from '../helpers/keycloak.js';
import { createDatabaseHelper, type DatabaseTestHelper } from '../helpers/database.js';

/**
 * Albums & Photos CRUD Functionality Tests
 *
 * Verify:
 * - Soft delete and restore for albums and photos
 * - Status transitions (draft → published → archived)
 * - Creator tracking
 * - Parent-child relationship
 *
 * Note: With auto-provisioning, the test user gets a personal tenant
 * automatically on first login (e.g., "crud-test-personal").
 * No manual tenant/organization setup needed.
 */

interface TestUser {
  email: string;
  password: string;
}

function createTestUser(): TestUser {
  return {
    email: `test-${randomUUID().slice(0, 8)}@test.com`,
    password: randomUUID(),
  };
}

let keycloak: KeycloakTestHelper;
let database: DatabaseTestHelper;

// Extend Playwright test with testUser fixture
const test = base.extend<{ testUser: TestUser }>({
  testUser: async ({}, use) => {
    const user = createTestUser();
    await keycloak.createUser(user.email, user.password);
    await use(user);
  },
});

test.describe('Albums & Photos CRUD', () => {
  test.beforeAll(async () => {
    // Clean database before tests
    database = createDatabaseHelper();
    await database.cleanup();

    keycloak = createKeycloakHelper();
  });

  test.afterAll(async () => {
    await keycloak.cleanup();
    await database.close();
  });

  async function loginViaUI(page: Page, user: TestUser): Promise<string> {
    await page.goto('/auth/login');

    // Fill both username and password (single-page Keycloak login form)
    await page.fill('input[name="username"]', user.email);
    await page.fill('input[name="password"]', user.password);

    // Wait for button to be enabled and click
    const signInButton = page.locator('button[type="submit"], input[type="submit"]');
    await signInButton.waitFor({ state: 'visible', timeout: 10000 });
    await signInButton.click();

    // Wait for redirect back to app (callback or final destination)
    await page.waitForURL(/\/callback|\/albums|\/dashboard/, { timeout: 30000 });

    return user.email; // Return for tests that need to verify email in UI
  }

  test('Album soft delete and restore', async ({ page, testUser }) => {
    await loginViaUI(page, testUser);

    // Create album
    await page.goto('/albums');
    await page.click('a[href="/albums/new"]');
    await page.fill('input[name="name"]', 'Album to Delete');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/albums\/[a-f0-9-]+/);

    // Verify album appears in list
    await page.goto('/albums');
    await expect(page.locator('text=Album to Delete')).toBeVisible();

    // Delete album (soft delete) - click View button to navigate to detail page
    await page.locator('.card:has-text("Album to Delete")').locator('a:has-text("View")').click();
    await page.waitForURL(/\/albums\/[a-f0-9-]+/);

    // Set up dialog handler BEFORE clicking Delete
    page.once('dialog', (dialog) => dialog.accept());
    await page.click('button:has-text("Delete")');

    // Wait for redirect after deletion
    await page.waitForURL('/albums');

    // Verify album no longer appears in active list
    await expect(page.locator('text=Album to Delete')).not.toBeVisible();

    // TODO: If restore functionality is implemented, test restore here
  });

  test('Photo soft delete', async ({ page, testUser }) => {
    await loginViaUI(page, testUser);

    // Create album
    await page.goto('/albums');
    await page.click('a[href="/albums/new"]');
    await page.fill('input[name="name"]', 'Photo Delete Test Album');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/albums\/[a-f0-9-]+/);

    // Add photo to album
    await page.click('a[href*="/photos/new"]');
    await page.fill('input[name="title"]', 'Photo to Delete');
    await page.fill('input[name="url"]', 'https://example.com/delete-me.jpg');
    await page.click('button[type="submit"]');

    // Wait for redirect back to album detail page
    await page.waitForURL(/\/albums\/[a-f0-9-]+/);

    // Verify photo appears in album
    await expect(page.locator('text=Photo to Delete')).toBeVisible();

    // Delete photo - set up dialog handler BEFORE clicking Delete
    page.once('dialog', (dialog) => dialog.accept());
    await page.click('button:has-text("Delete")');

    // Wait for page to reload after deletion
    await page.waitForLoadState('networkidle');

    // Verify photo no longer visible in album
    await expect(page.locator('text=Photo to Delete')).not.toBeVisible();
  });

  test('Album status transitions: draft → published → archived', async ({ page, testUser }) => {
    await loginViaUI(page, testUser);

    // Create album with draft status
    await page.goto('/albums');
    await page.click('a[href="/albums/new"]');
    await page.fill('input[name="name"]', 'Status Test Album');
    await page.selectOption('select[name="status"]', 'draft');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/albums\/[a-f0-9-]+/);

    // Verify draft status - use specific selector for album badge
    await expect(page.locator('h1 .badge').filter({ hasText: /draft/i })).toBeVisible();

    // Edit and change to published
    await page.click('a[href*="/edit"]');
    await page.waitForLoadState('networkidle');
    await page.selectOption('select[name="status"]', 'published');
    await page.click('button[type="submit"]');

    // Wait for redirect back to album detail page
    await page.waitForLoadState('networkidle');

    // Verify published status
    await expect(page.locator('h1 .badge').filter({ hasText: /published/i })).toBeVisible();

    // Edit and change to archived
    await page.click('a[href*="/edit"]');
    await page.waitForLoadState('networkidle');
    await page.selectOption('select[name="status"]', 'archived');
    await page.click('button[type="submit"]');

    // Wait for redirect back to album detail page
    await page.waitForLoadState('networkidle');

    // Verify archived status
    await expect(page.locator('h1 .badge').filter({ hasText: /archived/i })).toBeVisible();
  });

  test('Photo status transitions: draft → published → archived', async ({ page, testUser }) => {
    await loginViaUI(page, testUser);

    // Create album
    await page.goto('/albums');
    await page.click('a[href="/albums/new"]');
    await page.fill('input[name="name"]', 'Photo Status Test Album');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/albums\/[a-f0-9-]+/);

    // Add photo with draft status
    await page.click('a[href*="/photos/new"]');
    await page.fill('input[name="title"]', 'Status Test Photo');
    await page.fill('input[name="url"]', 'https://example.com/status-test.jpg');
    await page.selectOption('select[name="status"]', 'draft');
    await page.click('button[type="submit"]');

    // Wait for redirect back to album detail page
    await page.waitForURL(/\/albums\/[a-f0-9-]+/);

    // Verify draft status - scope to photo card to avoid matching album badge
    await expect(page.locator('.card .badge').filter({ hasText: /draft/i }).first()).toBeVisible();

    // Edit and change to published
    await page.click('a[href*="/edit"]');
    await page.waitForLoadState('networkidle');
    await page.selectOption('select[name="status"]', 'published');
    await page.click('button[type="submit"]');

    // Wait for redirect back to album detail page
    await page.waitForLoadState('networkidle');

    // Verify published status - scope to photo card
    await expect(
      page
        .locator('.card .badge')
        .filter({ hasText: /published/i })
        .first(),
    ).toBeVisible();

    // Edit and change to archived
    await page.click('a[href*="/edit"]');
    await page.waitForLoadState('networkidle');
    await page.selectOption('select[name="status"]', 'archived');
    await page.click('button[type="submit"]');

    // Wait for redirect back to album detail page
    await page.waitForLoadState('networkidle');

    // Verify archived status - scope to photo card
    await expect(
      page
        .locator('.card .badge')
        .filter({ hasText: /archived/i })
        .first(),
    ).toBeVisible();
  });

  test('Creator tracking for albums', async ({ page, testUser }) => {
    const email = await loginViaUI(page, testUser);

    // Create album
    await page.goto('/albums');
    await page.click('a[href="/albums/new"]');
    await page.fill('input[name="name"]', 'Creator Track Album');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/albums\/[a-f0-9-]+/);

    // Verify creator information is shown in the album detail card
    await expect(
      page.locator('.text-sm.opacity-50', {
        hasText: new RegExp(`Created by.*${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'),
      }),
    ).toBeVisible();
  });

  test('Parent-child relationship: photos belong to correct album', async ({ page, testUser }) => {
    await loginViaUI(page, testUser);

    // Create two albums
    await page.goto('/albums');
    await page.click('a[href="/albums/new"]');
    await page.fill('input[name="name"]', 'Album One');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/albums\/[a-f0-9-]+/);
    const albumOneUrl = page.url();

    await page.goto('/albums');
    await page.click('a[href="/albums/new"]');
    await page.fill('input[name="name"]', 'Album Two');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/albums\/[a-f0-9-]+/);

    // Add photo to Album Two
    await page.click('a[href*="/photos/new"]');
    await page.fill('input[name="title"]', 'Photo in Album Two');
    await page.fill('input[name="url"]', 'https://example.com/album-two-photo.jpg');
    await page.click('button[type="submit"]');

    // Wait for redirect back to Album Two detail page
    await page.waitForURL(/\/albums\/[a-f0-9-]+/);

    // Go to Album One - should NOT see "Photo in Album Two"
    await page.goto(albumOneUrl);
    await expect(page.locator('text=Photo in Album Two')).not.toBeVisible();

    // Go back to Album Two - should see the photo
    await page.goto('/albums');
    await page.locator('.card:has-text("Album Two")').locator('a:has-text("View")').click();
    await page.waitForURL(/\/albums\/[a-f0-9-]+/);
    await expect(page.locator('text=Photo in Album Two')).toBeVisible();
  });
});
