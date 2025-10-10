import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { z } from 'zod';
import { HTTP, controller, post, apiResponse, zApiOutput } from './index.js';
import { DTO } from '../DTO.js';
import { metaController } from '../../controllers/meta.js';

// Test DTO schema
const UserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  age: z.number().int().positive().optional(),
});

// Test DTO class
class UserDTO extends DTO<typeof UserSchema> {
  constructor(data?: z.input<typeof UserSchema>) {
    super(UserSchema, data);
  }
}

// Test controller using DTO
const testDtoController = controller('/')
  .description('Test controller for DTO validation')
  .endpoints([
    post('/test-dto', 'createUser')
      .input(
        z.object({
          body: UserSchema,
        }),
      )
      .response(zApiOutput(UserSchema))
      .handler(({ body }) => {
        // Validate using DTO
        const user = new UserDTO(body);
        return Promise.resolve(apiResponse(user.toJSON()));
      }),
  ]);

void describe('DTO Integration Test', () => {
  let server: HTTP;
  const port = 3053; // Use a unique test port

  before(() => {
    server = new HTTP(
      { controllers: [metaController, testDtoController] },
      {
        port,
        oasInfo: {
          title: 'DTO Test API',
          version: '1.0.0',
        },
      },
    );

    server.start();
  });

  after(() => {
    server.stop();
  });

  void it('should accept valid DTO data and return 200', async () => {
    const validData = {
      name: 'John Doe',
      email: 'john@example.com',
      age: 30,
    };

    const response = await fetch(`http://localhost:${String(port)}/test-dto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validData),
    });

    const data = (await response.json()) as {
      data: { name: string; email: string; age: number };
      meta: unknown;
    };

    assert.strictEqual(response.status, 200);
    assert.strictEqual(data.data.name, 'John Doe');
    assert.strictEqual(data.data.email, 'john@example.com');
    assert.strictEqual(data.data.age, 30);
    assert.ok(data.meta); // Verify apiResponse wrapper
  });

  void it('should reject invalid DTO data with 422', async () => {
    const invalidData = {
      name: '', // Invalid: min length 1
      email: 'not-an-email', // Invalid: not an email
      age: -5, // Invalid: must be positive
    };

    const response = await fetch(`http://localhost:${String(port)}/test-dto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invalidData),
    });

    assert.strictEqual(response.status, 422);
  });

  void it('should reject missing required fields with 422', async () => {
    const incompleteData = {
      email: 'john@example.com',
      // Missing 'name' field
    };

    const response = await fetch(`http://localhost:${String(port)}/test-dto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(incompleteData),
    });

    assert.strictEqual(response.status, 422);
  });

  void it('should accept optional fields as undefined', async () => {
    const dataWithoutAge = {
      name: 'Jane Doe',
      email: 'jane@example.com',
      // age is optional
    };

    const response = await fetch(`http://localhost:${String(port)}/test-dto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dataWithoutAge),
    });

    const data = (await response.json()) as {
      data: { name: string; email: string; age?: number };
      meta: unknown;
    };

    assert.strictEqual(response.status, 200);
    assert.strictEqual(data.data.name, 'Jane Doe');
    assert.strictEqual(data.data.email, 'jane@example.com');
    assert.strictEqual(data.data.age, undefined);
  });

  void it('should have OpenAPI spec with DTO schema', async () => {
    const response = await fetch(`http://localhost:${String(port)}/openapi.json`);
    const openapi = (await response.json()) as {
      paths: Record<string, unknown>;
      components?: { schemas?: Record<string, unknown> };
    };

    assert.ok(openapi.paths);
    assert.ok(openapi.paths['/test-dto']);

    // Verify the endpoint exists in OpenAPI spec
    const testDtoPath = openapi.paths['/test-dto'] as Record<string, unknown>;
    assert.ok(testDtoPath.post);
  });
});
