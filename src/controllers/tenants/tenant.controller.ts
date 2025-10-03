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
    get('/tenants', 'listTenants')
      .description('List all tenants with pagination and filtering')
      .input(
        z.object({
          query: ListTenantsQuerySchema,
        }),
      )
      .response(zApiOutput(z.array(TenantResponseSchema)))
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
    get('/tenants/:id', 'getTenant')
      .description('Get a tenant by ID')
      .input(
        z.object({
          params: z.object({
            id: z.string().uuid('Invalid tenant ID'),
          }),
        }),
      )
      .response(zApiOutput(TenantResponseSchema))
      .handler(async (inputs) => {
        const tenant = await tenantService.getTenantById(inputs.params.id);
        return apiResponse(tenant);
      }),

    /**
     * Create a new tenant
     */
    post('/tenants', 'createTenant')
      .description('Create a new tenant')
      .input(
        z.object({
          body: CreateTenantSchema,
        }),
      )
      .response(zApiOutput(TenantResponseSchema))
      .handler(async (inputs) => {
        const tenant = await tenantService.createTenant(inputs.body);
        return apiResponse(tenant);
      }),

    /**
     * Update a tenant
     */
    put('/tenants/:id', 'updateTenant')
      .description('Update a tenant')
      .input(
        z.object({
          params: z.object({
            id: z.string().uuid('Invalid tenant ID'),
          }),
          body: UpdateTenantSchema,
        }),
      )
      .response(zApiOutput(TenantResponseSchema))
      .handler(async (inputs) => {
        const tenant = await tenantService.updateTenant(inputs.params.id, inputs.body);
        return apiResponse(tenant);
      }),

    /**
     * Delete a tenant
     */
    del('/tenants/:id', 'deleteTenant')
      .description('Delete a tenant')
      .input(
        z.object({
          params: z.object({
            id: z.string().uuid('Invalid tenant ID'),
          }),
        }),
      )
      .response(zApiOutput(z.object({ deleted: z.boolean() })))
      .handler(async (inputs) => {
        await tenantService.deleteTenant(inputs.params.id);
        return apiResponse({ deleted: true });
      }),
  ]);
