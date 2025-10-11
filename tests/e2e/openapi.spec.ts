import { test, expect } from '@playwright/test';
import { config } from '../../src/lib/config.js';

/**
 * OpenAPI Specification E2E Tests
 *
 * Verify that OpenAPI spec endpoints are accessible and return valid JSON:
 * - Public API (port 3000) should have /openapi.json
 * - Admin API (port 3001) should have /openapi.json
 * - Meta API (port 3002) should NOT have /openapi.json (only health checks)
 */

// Get API URLs from config system
const publicApiUrl = config.PUBLIC_API_URL;
const adminApiUrl = config.ADMIN_API_URL;
const metaApiUrl = config.META_API_URL;

test.describe('OpenAPI Specification', () => {
  test('Public API: GET /openapi.json returns valid OpenAPI JSON', async ({ request }) => {
    const response = await request.get(`${publicApiUrl}/openapi.json`);

    // Check status
    expect(response.status()).toBe(200);

    // Check content type
    expect(response.headers()['content-type']).toContain('application/json');

    // Verify it's valid JSON
    const json = await response.json();

    // Verify OpenAPI structure
    expect(json).toHaveProperty('openapi');
    expect(json).toHaveProperty('info');
    expect(json).toHaveProperty('paths');

    // Verify it's the Public API spec
    expect(json.info.title).toBe('Antithesis Public API');
  });

  test('Admin API: GET /openapi.json returns valid OpenAPI JSON', async ({ request }) => {
    const response = await request.get(`${adminApiUrl}/openapi.json`);

    // Check status
    expect(response.status()).toBe(200);

    // Check content type
    expect(response.headers()['content-type']).toContain('application/json');

    // Verify it's valid JSON
    const json = await response.json();

    // Verify OpenAPI structure
    expect(json).toHaveProperty('openapi');
    expect(json).toHaveProperty('info');
    expect(json).toHaveProperty('paths');

    // Verify it's the Admin API spec
    expect(json.info.title).toBe('Antithesis Admin API');
  });

  test('Meta API: /openapi.json should not exist', async ({ request }) => {
    const response = await request.get(`${metaApiUrl}/openapi.json`);

    // Meta API doesn't have metaController, so this should 404
    expect(response.status()).toBe(404);
  });
});
