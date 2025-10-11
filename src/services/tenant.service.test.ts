/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/require-await */
import { describe, test, beforeEach, mock } from 'node:test';
import assert from 'node:assert';
import { tenantService } from './tenant.service.js';
import { tenantRepository } from '../db/tenant.repository.js';
import { ConflictError } from '../lib/http/errors.js';

describe('TenantService - Database-Only Tenant Management', () => {
  beforeEach(() => {
    // Reset mocks before each test
    mock.restoreAll();
  });

  test('createTenant: success path - creates tenant in database only', async () => {
    // Mock tenant repository methods
    const originalFindBySlug = tenantRepository.findBySlug;
    const originalCreate = tenantRepository.create;

    tenantRepository.findBySlug = mock.fn(async () => undefined); // No existing tenant

    const mockTenantEntity = {
      id: 'tenant-123',
      name: 'Test Organization',
      slug: 'test-org',
      externalReferenceId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    tenantRepository.create = mock.fn(async () => mockTenantEntity);

    // Execute
    const result = await tenantService.createTenant({
      name: 'Test Organization',
      slug: 'test-org',
    });

    // Assertions
    assert.strictEqual(result.id, 'tenant-123');
    assert.strictEqual(result.name, 'Test Organization');
    assert.strictEqual(result.slug, 'test-org');

    // Verify tenant was created
    assert.strictEqual(
      (tenantRepository.create as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
      1,
    );

    // Restore
    tenantRepository.findBySlug = originalFindBySlug;
    tenantRepository.create = originalCreate;
  });

  test('createTenant: failure path - slug conflict prevents tenant creation', async () => {
    // Mock existing tenant with same slug
    const originalFindBySlug = tenantRepository.findBySlug;
    const existingTenant = {
      id: 'existing-tenant-123',
      name: 'Existing Organization',
      slug: 'test-org',
      externalReferenceId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    tenantRepository.findBySlug = mock.fn(async () => existingTenant);

    // Execute and expect ConflictError
    await assert.rejects(
      async () => {
        await tenantService.createTenant({
          name: 'Test Organization',
          slug: 'test-org',
        });
      },
      (error: Error) => {
        assert.ok(error instanceof ConflictError);
        assert.strictEqual(error.message, 'Tenant with this slug already exists');
        return true;
      },
    );

    // Verify slug check was performed
    assert.strictEqual(
      (tenantRepository.findBySlug as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
      1,
    );

    // Restore
    tenantRepository.findBySlug = originalFindBySlug;
  });
});
