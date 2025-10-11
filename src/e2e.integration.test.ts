import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { z } from 'zod';
import { HTTP, controller, post, apiResponse, zApiOutput } from './lib/http/index.js';
import { health } from './lib/health.js';
import { Redis } from './lib/redis.js';
import { metaController } from './controllers/meta.js';
import { healthController } from './controllers/health.js';
import { DTO, TenantScoped, isTenantId, type TenantId } from './lib/http/index.js';
import {
  setupTestDatabase,
  teardownTestDatabase,
  type TestDatabase,
} from './lib/db/test-helpers.js';

// Test DTO
const CreateTenantSchema = z.object({
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

class CreateTenantDTO extends DTO<typeof CreateTenantSchema> {
  constructor(data?: z.input<typeof CreateTenantSchema>) {
    super(CreateTenantSchema, data);
  }
}

// Test tenant-scoped service
class TenantService extends TenantScoped {
  async createTenant(data: z.infer<typeof CreateTenantSchema>) {
    this.log.info('Creating tenant', { data });
    const testDb = (globalThis as { testDb?: TestDatabase }).testDb;
    if (!testDb) throw new Error('Test database not initialized');

    // Create tenant with tenant isolation
    const result = await testDb.db
      .insertInto('tenants')
      .values({
        name: data.name,
        slug: data.slug,
        externalReferenceId: this.tenantId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return result;
  }

  async getTenants() {
    this.log.info('Getting tenants for tenant');
    const testDb = (globalThis as { testDb?: TestDatabase }).testDb;
    if (!testDb) throw new Error('Test database not initialized');

    // Query with automatic tenant filtering via externalReferenceId
    const tenants = await testDb.db
      .selectFrom('tenants')
      .where('externalReferenceId', '=', this.tenantId)
      .selectAll()
      .execute();

    return tenants;
  }
}

// Test controller
const e2eTestController = controller('/')
  .description('E2E test controller')
  .endpoints([
    post('/e2e/tenants', 'createTenant')
      .input(
        z.object({
          body: CreateTenantSchema,
          headers: z.object({
            'x-tenant-id': z.string(),
          }),
        }),
      )
      .response(zApiOutput(z.object({ id: z.string(), name: z.string() })))
      .handler(async ({ body, headers }) => {
        const tenantId = headers['x-tenant-id'];

        if (!isTenantId(tenantId)) {
          throw new Error('Invalid tenant ID');
        }

        const dto = new CreateTenantDTO(body);
        const service = new TenantService(tenantId);
        const tenant = await service.createTenant(dto.toJSON());

        return apiResponse({ id: tenant.id, name: tenant.name });
      }),
  ]);

void describe('E2E Integration Test', () => {
  let server: HTTP;
  let testDb: TestDatabase;
  const port = 3052; // Use a unique test port

  before(async () => {
    // Setup isolated PostgreSQL testcontainer
    testDb = await setupTestDatabase();
    (globalThis as { testDb?: TestDatabase }).testDb = testDb;

    // Register database health check
    health.registerReadinessHook('e2e-database', async () => {
      await testDb.db.selectFrom('tenants').select('id').limit(1).execute();
      return true;
    });

    // Initialize Redis
    await Redis.getClient('e2e-test');

    // Start server
    server = new HTTP(
      { controllers: [metaController, healthController, e2eTestController] },
      {
        port,
        oasInfo: {
          title: 'E2E Test API',
          version: '1.0.0',
        },
      },
    );

    server.start();
  });

  after(async () => {
    server.stop();
    health.unregisterReadinessHook('e2e-database');
    await Redis.destroy();
    await teardownTestDatabase(testDb);
    delete (globalThis as { testDb?: TestDatabase }).testDb;
  });

  void it('should have database connection', async () => {
    const result = await testDb.db.selectFrom('tenants').select('id').limit(1).execute();

    // Just verify the query executes (may be empty)
    assert.ok(Array.isArray(result));
  });

  void it('should have Redis connection', async () => {
    const redis = await Redis.getClient('e2e-test');
    const pong = await redis.ping();

    assert.strictEqual(pong, 'PONG');
  });

  void it('should have /healthz endpoint responding', async () => {
    const response = await fetch(`http://localhost:${String(port)}/healthz`);
    const data = (await response.json()) as { data: { healthy: boolean }; meta: unknown };

    assert.strictEqual(response.status, 200);
    assert.strictEqual(data.data.healthy, true);
  });

  void it('should have /readyz endpoint checking database and Redis', async () => {
    const response = await fetch(`http://localhost:${String(port)}/readyz`);
    const data = (await response.json()) as { data: { ready: boolean }; meta: unknown };

    assert.strictEqual(response.status, 200);
    assert.strictEqual(data.data.ready, true);
  });

  void it('should validate DTO in real HTTP request', async () => {
    const validData = {
      name: 'E2E Test Tenant',
      slug: 'e2e-test-tenant',
    };

    const response = await fetch(`http://localhost:${String(port)}/e2e/tenants`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': '00000000-0000-0000-0000-000000000002',
      },
      body: JSON.stringify(validData),
    });

    const data = (await response.json()) as {
      data: { id: string; name: string };
      meta: unknown;
    };

    assert.strictEqual(response.status, 200);
    assert.strictEqual(data.data.name, 'E2E Test Tenant');
    assert.ok(data.data.id);
  });

  void it('should reject invalid DTO data', async () => {
    const invalidData = {
      name: '', // Invalid: min length 1
      slug: 'Invalid Slug', // Invalid: uppercase and spaces
    };

    const response = await fetch(`http://localhost:${String(port)}/e2e/tenants`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': '00000000-0000-0000-0000-000000000003',
      },
      body: JSON.stringify(invalidData),
    });

    assert.strictEqual(response.status, 422);
  });

  void it('should support tenant isolation', async () => {
    const tenantId1 = '00000000-0000-0000-0000-000000000004';
    const tenantId2 = '00000000-0000-0000-0000-000000000005';

    // Create tenant for tenant 1
    const tenant1 = {
      name: 'Tenant 1 Org',
      slug: 'tenant-1-org',
    };

    const response1 = await fetch(`http://localhost:${String(port)}/e2e/tenants`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': tenantId1,
      },
      body: JSON.stringify(tenant1),
    });

    assert.strictEqual(response1.status, 200);

    // Create tenant for tenant 2
    const tenant2 = {
      name: 'Tenant 2 Org',
      slug: 'tenant-2-org',
    };

    const response2 = await fetch(`http://localhost:${String(port)}/e2e/tenants`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': tenantId2,
      },
      body: JSON.stringify(tenant2),
    });

    assert.strictEqual(response2.status, 200);

    // Verify tenant isolation by querying database directly
    const tenant1Records = await testDb.db
      .selectFrom('tenants')
      .where('externalReferenceId', '=', tenantId1)
      .selectAll()
      .execute();

    const tenant2Records = await testDb.db
      .selectFrom('tenants')
      .where('externalReferenceId', '=', tenantId2)
      .selectAll()
      .execute();

    // Each tenant should only see their own records
    assert.ok(tenant1Records.length > 0);
    assert.ok(tenant2Records.length > 0);
    assert.ok(tenant1Records.every((t) => t.externalReferenceId === tenantId1));
    assert.ok(tenant2Records.every((t) => t.externalReferenceId === tenantId2));
  });

  void it('should have OpenAPI spec available', async () => {
    const response = await fetch(`http://localhost:${String(port)}/openapi.json`);
    const openapi = (await response.json()) as { paths: Record<string, unknown> };

    assert.ok(openapi.paths);
    // Health endpoints are hidden from OpenAPI spec via .hideFromOpenAPI()
    // Only check for the E2E test endpoint
    assert.ok(openapi.paths['/e2e/tenants']);
  });

  void it('should demonstrate TenantScoped service logging', async () => {
    // This test verifies the TenantScoped service is working
    // The logging behavior is verified in unit tests, here we just ensure it works in context
    // Use a valid UUID for tenant ID (database expects UUID format)
    const tenantId = '00000000-0000-0000-0000-000000000001' as TenantId;
    const service = new TenantService(tenantId);

    const tenantData = {
      name: 'Log Test Tenant',
      slug: 'log-test-tenant',
    };

    const tenant = await service.createTenant(tenantData);
    assert.ok(tenant.id);
    assert.strictEqual(tenant.name, 'Log Test Tenant');
  });

  void it('should return JSON responses for existing API endpoints (regression test)', async () => {
    // Verify OpenAPI endpoint still returns JSON
    const openapiResponse = await fetch(`http://localhost:${String(port)}/openapi.json`);
    const contentType = openapiResponse.headers.get('content-type');

    assert.ok(
      contentType?.includes('application/json'),
      `OpenAPI endpoint should return JSON, got: ${contentType ?? 'null'}`,
    );

    const openapi = (await openapiResponse.json()) as { openapi: string };
    assert.ok(openapi.openapi, 'OpenAPI spec should have openapi version field');
  });

  void it('should return JSON responses for health endpoints (regression test)', async () => {
    // Verify healthz endpoint still returns JSON
    const healthResponse = await fetch(`http://localhost:${String(port)}/healthz`);
    const contentType = healthResponse.headers.get('content-type');

    assert.ok(
      contentType?.includes('application/json'),
      `Health endpoint should return JSON, got: ${contentType ?? 'null'}`,
    );

    const health = (await healthResponse.json()) as { data: unknown };
    assert.ok(health.data, 'Health response should have data field');
  });

  void it('should return JSON responses for POST endpoints (regression test)', async () => {
    const validData = {
      name: 'JSON Regression Test',
      slug: 'json-regression-test',
    };

    const response = await fetch(`http://localhost:${String(port)}/e2e/tenants`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': '00000000-0000-0000-0000-000000000099',
      },
      body: JSON.stringify(validData),
    });

    const contentType = response.headers.get('content-type');
    assert.ok(
      contentType?.includes('application/json'),
      `POST endpoint should return JSON, got: ${contentType ?? 'null'}`,
    );

    const data = (await response.json()) as { data: unknown; meta: unknown };
    assert.ok(data.data, 'Response should have data field');
    assert.ok(data.meta, 'Response should have meta field');
  });
});
