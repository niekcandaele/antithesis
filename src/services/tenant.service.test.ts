/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/require-await */
import { describe, test, beforeEach, mock } from 'node:test';
import assert from 'node:assert';
import { tenantService } from './tenant.service.js';
import { keycloakAdminService } from './keycloak-admin.service.js';
import { tenantRepository } from '../db/tenant.repository.js';
import { ConflictError } from '../lib/http/errors.js';

describe('TenantService - Keycloak Organization Integration', () => {
  beforeEach(() => {
    // Reset mocks before each test
    mock.restoreAll();
  });

  test('createTenant: success path - creates Keycloak organization and tenant', async () => {
    // Mock Keycloak organization creation
    const mockKeycloakOrg = {
      id: 'keycloak-org-123',
      name: 'Test Organization',
      enabled: true,
    };

    const originalCreateOrg = keycloakAdminService.createOrganization;
    keycloakAdminService.createOrganization = mock.fn(async () => mockKeycloakOrg);

    // Mock tenant repository methods
    const originalFindBySlug = tenantRepository.findBySlug;
    const originalCreate = tenantRepository.create;

    tenantRepository.findBySlug = mock.fn(async () => undefined); // No existing tenant

    const mockTenantEntity = {
      id: 'tenant-123',
      name: 'Test Organization',
      slug: 'test-org',
      externalReferenceId: null,
      keycloakOrganizationId: 'keycloak-org-123',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    tenantRepository.create = mock.fn(async (data) => {
      assert.strictEqual(data.keycloakOrganizationId, 'keycloak-org-123');
      return mockTenantEntity;
    });

    // Execute
    const result = await tenantService.createTenant({
      name: 'Test Organization',
      slug: 'test-org',
    });

    // Assertions
    assert.strictEqual(result.id, 'tenant-123');
    assert.strictEqual(result.name, 'Test Organization');
    assert.strictEqual(result.slug, 'test-org');
    assert.strictEqual(result.keycloakOrganizationId, 'keycloak-org-123');

    // Verify Keycloak organization was created
    assert.strictEqual(
      (keycloakAdminService.createOrganization as unknown as ReturnType<typeof mock.fn>).mock.calls
        .length,
      1,
    );
    assert.strictEqual(
      (keycloakAdminService.createOrganization as unknown as ReturnType<typeof mock.fn>).mock
        .calls[0].arguments[0],
      'Test Organization',
    );

    // Verify tenant was created with Keycloak organization ID
    assert.strictEqual(
      (tenantRepository.create as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
      1,
    );

    // Restore
    keycloakAdminService.createOrganization = originalCreateOrg;
    tenantRepository.findBySlug = originalFindBySlug;
    tenantRepository.create = originalCreate;
  });

  test('createTenant: failure path - Keycloak error prevents tenant creation', async () => {
    // Mock Keycloak organization creation to fail
    const originalCreateOrg = keycloakAdminService.createOrganization;
    const keycloakError = new Error('Keycloak Admin API error: 500 Internal Server Error');
    keycloakAdminService.createOrganization = mock.fn(async () => {
      throw keycloakError;
    });

    // Mock tenant repository methods
    const originalFindBySlug = tenantRepository.findBySlug;
    const originalCreate = tenantRepository.create;

    tenantRepository.findBySlug = mock.fn(async () => undefined); // No existing tenant
    tenantRepository.create = mock.fn(async () => {
      throw new Error('Should not be called');
    });

    // Execute and expect error
    await assert.rejects(
      async () => {
        await tenantService.createTenant({
          name: 'Test Organization',
          slug: 'test-org',
        });
      },
      (error: Error) => {
        assert.strictEqual(error.message, keycloakError.message);
        return true;
      },
    );

    // Verify Keycloak organization creation was attempted
    assert.strictEqual(
      (keycloakAdminService.createOrganization as unknown as ReturnType<typeof mock.fn>).mock.calls
        .length,
      1,
    );

    // Verify tenant was NOT created (fail-fast)
    assert.strictEqual(
      (tenantRepository.create as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
      0,
    );

    // Restore
    keycloakAdminService.createOrganization = originalCreateOrg;
    tenantRepository.findBySlug = originalFindBySlug;
    tenantRepository.create = originalCreate;
  });

  test('createTenant: slug uniqueness check happens before Keycloak call', async () => {
    // Mock existing tenant with same slug
    const originalFindBySlug = tenantRepository.findBySlug;
    const existingTenant = {
      id: 'existing-tenant-123',
      name: 'Existing Organization',
      slug: 'test-org',
      externalReferenceId: null,
      keycloakOrganizationId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    tenantRepository.findBySlug = mock.fn(async () => existingTenant);

    // Mock Keycloak organization creation (should NOT be called)
    const originalCreateOrg = keycloakAdminService.createOrganization;
    keycloakAdminService.createOrganization = mock.fn(async () => {
      throw new Error('Should not be called');
    });

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

    // Verify Keycloak organization was NOT created (fail-fast)
    assert.strictEqual(
      (keycloakAdminService.createOrganization as unknown as ReturnType<typeof mock.fn>).mock.calls
        .length,
      0,
    );

    // Restore
    tenantRepository.findBySlug = originalFindBySlug;
    keycloakAdminService.createOrganization = originalCreateOrg;
  });
});
