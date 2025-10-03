import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { z } from 'zod';
import { HTTP, controller, post, apiResponse, zApiOutput } from './lib/http/index.js';
import { getDb, closeDb } from './lib/db/index.js';
import { runMigrations } from './lib/db/migrations.js';
import { health } from './lib/health.js';
import { Redis } from './lib/redis.js';
import { metaController } from './controllers/meta.js';
import { healthController } from './controllers/health.js';
import { DTO, TenantScoped, isTenantId, type TenantId } from './lib/http/index.js';

// Test DTO
const CreateUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});

class CreateUserDTO extends DTO<typeof CreateUserSchema> {
  constructor(data?: z.input<typeof CreateUserSchema>) {
    super(CreateUserSchema, data);
  }
}

// Test tenant-scoped service
class UserService extends TenantScoped {
  async createUser(data: z.infer<typeof CreateUserSchema>) {
    this.log.info('Creating user', { data });
    const db = getDb();

    // Create user with tenant isolation
    const result = await db
      .insertInto('users')
      .values({
        tenantId: this.tenantId,
        name: data.name,
        email: data.email,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return result;
  }

  async getUsers() {
    this.log.info('Getting users for tenant');
    const db = getDb();

    // Query with automatic tenant filtering
    const users = await db
      .selectFrom('users')
      .where('tenantId', '=', this.tenantId)
      .selectAll()
      .execute();

    return users;
  }
}

// Test controller
const e2eTestController = controller('e2e-test')
  .description('E2E test controller')
  .endpoints([
    post('/e2e/users', 'createUser')
      .input(
        z.object({
          body: CreateUserSchema,
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

        const dto = new CreateUserDTO(body);
        const service = new UserService(tenantId);
        const user = await service.createUser(dto.toJSON());

        return apiResponse({ id: user.id, name: user.name });
      }),
  ]);

void describe('E2E Integration Test', () => {
  let server: HTTP;
  const port = 3052; // Use a unique test port

  before(async () => {
    // Initialize database
    const db = getDb();
    await runMigrations();

    // Register database health check
    health.registerReadinessHook('e2e-database', async () => {
      await db.selectFrom('users').select('id').limit(1).execute();
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
    await closeDb();
  });

  void it('should have database connection', async () => {
    const db = getDb();
    const result = await db.selectFrom('users').select('id').limit(1).execute();

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
      name: 'E2E Test User',
      email: 'e2e@example.com',
    };

    const response = await fetch(`http://localhost:${String(port)}/e2e/users`, {
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
    assert.strictEqual(data.data.name, 'E2E Test User');
    assert.ok(data.data.id);
  });

  void it('should reject invalid DTO data', async () => {
    const invalidData = {
      name: '', // Invalid: min length 1
      email: 'not-an-email', // Invalid
    };

    const response = await fetch(`http://localhost:${String(port)}/e2e/users`, {
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

    // Create user for tenant 1
    const user1 = {
      name: 'Tenant 1 User',
      email: 'tenant1@example.com',
    };

    const response1 = await fetch(`http://localhost:${String(port)}/e2e/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': tenantId1,
      },
      body: JSON.stringify(user1),
    });

    assert.strictEqual(response1.status, 200);

    // Create user for tenant 2
    const user2 = {
      name: 'Tenant 2 User',
      email: 'tenant2@example.com',
    };

    const response2 = await fetch(`http://localhost:${String(port)}/e2e/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': tenantId2,
      },
      body: JSON.stringify(user2),
    });

    assert.strictEqual(response2.status, 200);

    // Verify tenant isolation by querying database directly
    const db = getDb();
    const tenant1Users = await db
      .selectFrom('users')
      .where('tenantId', '=', tenantId1)
      .selectAll()
      .execute();

    const tenant2Users = await db
      .selectFrom('users')
      .where('tenantId', '=', tenantId2)
      .selectAll()
      .execute();

    // Each tenant should only see their own users
    assert.ok(tenant1Users.length > 0);
    assert.ok(tenant2Users.length > 0);
    assert.ok(tenant1Users.every((u) => u.tenantId === tenantId1));
    assert.ok(tenant2Users.every((u) => u.tenantId === tenantId2));
  });

  void it('should have OpenAPI spec available', async () => {
    const response = await fetch(`http://localhost:${String(port)}/openapi.json`);
    const openapi = (await response.json()) as { paths: Record<string, unknown> };

    assert.ok(openapi.paths);
    // Health endpoints are hidden from OpenAPI spec via .hideFromOpenAPI()
    // Only check for the E2E test endpoint
    assert.ok(openapi.paths['/e2e/users']);
  });

  void it('should demonstrate TenantScoped service logging', async () => {
    // This test verifies the TenantScoped service is working
    // The logging behavior is verified in unit tests, here we just ensure it works in context
    // Use a valid UUID for tenant ID (database expects UUID format)
    const tenantId = '00000000-0000-0000-0000-000000000001' as TenantId;
    const service = new UserService(tenantId);

    const userData = {
      name: 'Log Test User',
      email: 'logtest@example.com',
    };

    const user = await service.createUser(userData);
    assert.ok(user.id);
    assert.strictEqual(user.name, 'Log Test User');
  });
});
