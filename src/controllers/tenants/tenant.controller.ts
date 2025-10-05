import { z } from 'zod';
import { controller, get, post, put, del, apiResponse, zApiOutput } from '../../lib/http/index.js';
import { tenantService } from '../../services/tenant.service.js';
import {
  CreateTenantSchema,
  UpdateTenantSchema,
  TenantResponseSchema,
  ListTenantsQuerySchema,
} from './tenant.dto.js';

/**
 * Tenant controller
 *
 * Provides REST API endpoints for tenant management:
 * - GET /tenants - List all tenants with pagination
 * - GET /tenants/:id - Get a specific tenant by ID
 * - POST /tenants - Create a new tenant
 * - PUT /tenants/:id - Update a tenant
 * - DELETE /tenants/:id - Delete a tenant
 */
export const tenantController = controller('tenants')
  .description('Tenant management endpoints')
  .endpoints([
    /**
     * List all tenants with optional filtering and pagination
     */
    get('/', 'listTenants')
      .description('List all tenants with pagination and filtering')
      .input(
        z
          .object({
            query: ListTenantsQuerySchema,
          })
          .openapi('ListTenantsInput'),
      )
      .response(zApiOutput(z.array(TenantResponseSchema).openapi('TenantList')))
      .handler(async (inputs) => {
        const { page, limit, sortBy, sortDirection, search } = inputs.query;

        const tenants = await tenantService.getAllTenants({
          page,
          limit,
          sortBy,
          sortDirection,
          search: search ? { name: search } : undefined,
        });

        return apiResponse(tenants);
      }),

    /**
     * Get a specific tenant by ID
     */
    get('/:id', 'getTenant')
      .description('Get a tenant by ID')
      .input(
        z
          .object({
            params: z
              .object({
                id: z.string().uuid('Invalid tenant ID'),
              })
              .openapi('GetTenantParams'),
          })
          .openapi('GetTenantInput'),
      )
      .response(zApiOutput(TenantResponseSchema))
      .handler(async (inputs) => {
        const tenant = await tenantService.getTenantById(inputs.params.id);
        return apiResponse(tenant);
      }),

    /**
     * Create a new tenant
     */
    post('/', 'createTenant')
      .description('Create a new tenant')
      .input(
        z
          .object({
            body: CreateTenantSchema,
          })
          .openapi('CreateTenantInput'),
      )
      .response(zApiOutput(TenantResponseSchema))
      .handler(async (inputs) => {
        const tenant = await tenantService.createTenant(inputs.body);
        return apiResponse(tenant);
      }),

    /**
     * Update a tenant
     */
    put('/:id', 'updateTenant')
      .description('Update a tenant')
      .input(
        z
          .object({
            params: z
              .object({
                id: z.string().uuid('Invalid tenant ID'),
              })
              .openapi('UpdateTenantParams'),
            body: UpdateTenantSchema,
          })
          .openapi('UpdateTenantInput'),
      )
      .response(zApiOutput(TenantResponseSchema))
      .handler(async (inputs) => {
        const tenant = await tenantService.updateTenant(inputs.params.id, inputs.body);
        return apiResponse(tenant);
      }),

    /**
     * Delete a tenant
     */
    del('/:id', 'deleteTenant')
      .description('Delete a tenant')
      .input(
        z
          .object({
            params: z
              .object({
                id: z.string().uuid('Invalid tenant ID'),
              })
              .openapi('DeleteTenantParams'),
          })
          .openapi('DeleteTenantInput'),
      )
      .response(zApiOutput(z.object({ deleted: z.boolean() }).openapi('DeleteTenantResponse')))
      .handler(async (inputs) => {
        await tenantService.deleteTenant(inputs.params.id);
        return apiResponse({ deleted: true });
      }),
  ]);
