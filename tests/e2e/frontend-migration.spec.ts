import { randomUUID } from 'node:crypto';
import { test as base, expect, type Page } from '@playwright/test';
import { createKeycloakHelper, type KeycloakTestHelper } from '../helpers/keycloak.js';
import { createDatabaseHelper, type DatabaseTestHelper } from '../helpers/database.js';

/**
 * Frontend Migration Tests - htmx Integration
 *
 * Verify:
 * - htmx form submission without page reload
 * - htmx pagination ("Load More" functionality)
 * - htmx error handling with inline messages
 * - htmx live search filtering
 *
 * These tests verify the Phase 8 htmx implementation from the Bulma+htmx migration.
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

test.describe('Frontend Migration - htmx Integration', () => {
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

    return user.email;
  }

  test('htmx form submission without page reload', async ({ page, testUser }) => {
    await loginViaUI(page, testUser);

    // Navigate to album creation form
    await page.goto('/albums/new');
    const initialUrl = page.url();

    // Fill in form fields
    await page.fill('input[name="name"]', 'htmx Test Album');
    await page.fill(
      'textarea[name="description"]',
      'Testing htmx form submission without page reload',
    );

    // Set up network request listener to verify htmx AJAX request
    const htmxRequestPromise = page.waitForRequest(
      (request) =>
        request.url().includes('/albums') &&
        request.method() === 'POST' &&
        request.headers()['hx-request'] === 'true',
    );

    // Submit form
    await page.click('button[type="submit"]');

    // Verify htmx request was made
    const htmxRequest = await htmxRequestPromise;
    expect(htmxRequest.headers()['hx-request']).toBe('true');

    // Wait for success notification to appear
    await expect(page.locator('.notification.is-success')).toBeVisible({ timeout: 5000 });

    // Verify success message content
    await expect(page.locator('.notification.is-success')).toContainText('htmx Test Album');
    await expect(page.locator('.notification.is-success')).toContainText('created successfully');

    // Verify URL didn't change (no full page reload/redirect)
    expect(page.url()).toBe(initialUrl);
  });

  test('htmx pagination - Load More button', async ({ page, testUser }) => {
    await loginViaUI(page, testUser);

    // Get user info for seeding
    const userInfo = await database.getUserInfo(testUser.email);
    if (!userInfo) throw new Error('User not found after login');

    // Seed 25 test albums directly in database (much faster than UI automation)
    await database.seedAlbums(25, 'Pagination Test Album', userInfo.tenantId, userInfo.userId);

    // Navigate to albums list
    await page.goto('/albums');

    // Count initial albums displayed (should be 20 on first page)
    const initialAlbums = await page.locator('#album-list .column').count();
    expect(initialAlbums).toBeGreaterThanOrEqual(20);

    // Verify "Load More" button exists
    const loadMoreButton = page.locator('button:has-text("Load More")');
    await expect(loadMoreButton).toBeVisible();

    // Set up network request listener for htmx pagination request
    const htmxPaginationPromise = page.waitForRequest(
      (request) =>
        request.url().includes('/albums/fragments') &&
        request.method() === 'GET' &&
        request.headers()['hx-request'] === 'true',
    );

    // Click "Load More" button
    await loadMoreButton.click();

    // Verify htmx pagination request was made
    const htmxPaginationRequest = await htmxPaginationPromise;
    expect(htmxPaginationRequest.headers()['hx-request']).toBe('true');
    expect(htmxPaginationRequest.url()).toContain('page=2');

    // Wait for new albums to be appended by waiting for album count to increase
    await expect(async () => {
      const currentCount = await page.locator('#album-list .column').count();
      expect(currentCount).toBeGreaterThan(initialAlbums);
    }).toPass({ timeout: 5000 });

    // Count albums after loading more
    const finalAlbums = await page.locator('#album-list .column').count();

    // Verify more albums were appended
    expect(finalAlbums).toBeGreaterThan(initialAlbums);
  });

  test('htmx error handling with inline messages', async ({ page, testUser }) => {
    await loginViaUI(page, testUser);

    // Navigate to album creation form
    await page.goto('/albums/new');
    const initialUrl = page.url();

    // Submit form with empty/invalid data (name is required)
    // Form has novalidate attribute, so client-side validation is disabled
    await page.fill('input[name="name"]', ''); // Empty name
    await page.click('button[type="submit"]');

    // Wait for error notification to appear
    await expect(page.locator('.notification.is-danger')).toBeVisible({ timeout: 5000 });

    // Verify error message is displayed
    await expect(page.locator('.notification.is-danger')).toContainText(/error|invalid|required/i);

    // Verify URL didn't change (no full page reload)
    expect(page.url()).toBe(initialUrl);

    // Verify form is still visible (not replaced entirely)
    await expect(page.locator('form')).toBeVisible();
  });

  test('htmx live search filtering', async ({ page, testUser }) => {
    await loginViaUI(page, testUser);

    // Get user info for seeding
    const userInfo = await database.getUserInfo(testUser.email);
    if (!userInfo) throw new Error('User not found after login');

    // Seed test albums directly in database (much faster than UI automation)
    const testAlbums = [
      'Apple Album',
      'Banana Album',
      'Cherry Album',
      'Apple Pie Album',
      'Grape Album',
    ];
    await database.seedAlbumsWithNames(testAlbums, userInfo.tenantId, userInfo.userId);

    // Navigate to albums list
    await page.goto('/albums');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Get initial album count
    const initialCount = await page.locator('#album-list .column').count();
    expect(initialCount).toBeGreaterThan(0);

    // Find the search input
    const searchInput = page.locator('input[name="q"]');
    await expect(searchInput).toBeVisible();

    // Set up network request listener for htmx search request
    const htmxSearchPromise = page.waitForRequest(
      (request) =>
        request.url().includes('/albums/fragments') &&
        request.url().includes('q=Apple') &&
        request.method() === 'GET' &&
        request.headers()['hx-request'] === 'true',
      { timeout: 10000 },
    );

    // Type in search input (htmx has 500ms debounce)
    // Use type() instead of fill() to trigger keyup events for htmx
    await searchInput.clear();
    await searchInput.type('Apple');

    // Verify htmx search request was made
    const htmxSearchRequest = await htmxSearchPromise;
    expect(htmxSearchRequest.headers()['hx-request']).toBe('true');

    // Wait for search results to update by waiting for expected content to appear
    await expect(page.locator('#album-list')).toContainText('Apple Album', { timeout: 5000 });

    // Verify filtered results (should show only albums with "Apple" in name)
    await expect(page.locator('#album-list')).toContainText('Apple Pie Album');

    // Verify non-matching albums are not visible
    await expect(page.locator('#album-list')).not.toContainText('Banana Album');
    await expect(page.locator('#album-list')).not.toContainText('Cherry Album');

    // Clear search to restore full list
    const htmxClearSearchPromise = page.waitForRequest(
      (request) =>
        request.url().includes('/albums/fragments') &&
        request.url().includes('q=') &&
        request.method() === 'GET' &&
        request.headers()['hx-request'] === 'true',
      { timeout: 10000 },
    );

    await searchInput.clear();
    await searchInput.press('Backspace'); // Trigger keyup event

    // Wait for clear search request
    await htmxClearSearchPromise;

    // Wait for results to restore by waiting for non-Apple albums to reappear
    await expect(page.locator('#album-list')).toContainText('Banana Album', { timeout: 5000 });

    // Verify all albums are visible again
    const finalCount = await page.locator('#album-list .column').count();
    expect(finalCount).toBeGreaterThanOrEqual(initialCount);
  });
});
