import { NotFoundError, ConflictError } from '../lib/http/errors.js';
import {
  tenantRepository,
  type CreateTenantData,
  type UpdateTenantData,
} from '../db/tenant.repository.js';
import type { QueryParams } from '../lib/db/queryBuilder.js';

/**
 * Plain tenant object returned by service
 */
export interface Tenant {
  id: string;
  name: string;
  slug: string;
  externalReferenceId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Service for tenant business logic
 *
 * Provides business logic layer for tenant operations, including:
 * - Validation of business rules (slug uniqueness, etc.)
 * - Error handling with appropriate HTTP errors
 * - Coordination between repository and controllers
 * - Mapping database entities to plain objects
 */
export class TenantService {
  /**
   * Map database entity to plain object
   */
  private mapToPlain(entity: {
    id: unknown;
    name: unknown;
    slug: unknown;
    externalReferenceId: unknown;
    createdAt: unknown;
    updatedAt: unknown;
  }): Tenant {
    return {
      id: String(entity.id),
      name: String(entity.name),
      slug: String(entity.slug),
      externalReferenceId:
        entity.externalReferenceId === null || entity.externalReferenceId === undefined
          ? null
          : // eslint-disable-next-line @typescript-eslint/no-base-to-string
            String(entity.externalReferenceId),
      createdAt: entity.createdAt instanceof Date ? entity.createdAt.toISOString() : String(entity.createdAt),
      updatedAt: entity.updatedAt instanceof Date ? entity.updatedAt.toISOString() : String(entity.updatedAt),
    };
  }

  /**
   * Get all tenants with optional filtering and pagination
   */
  async getAllTenants(params: QueryParams = {}): Promise<Tenant[]> {
    const entities = await tenantRepository.findAll(params);
    return entities.map((e) => this.mapToPlain(e));
  }

  /**
   * Get a tenant by ID
   * @throws {NotFoundError} If tenant doesn't exist
   */
  async getTenantById(id: string): Promise<Tenant> {
    const tenant = await tenantRepository.findById(id);
    if (!tenant) {
      throw new NotFoundError('Tenant not found');
    }
    return this.mapToPlain(tenant);
  }

  /**
   * Get a tenant by slug
   * @throws {NotFoundError} If tenant doesn't exist
   */
  async getTenantBySlug(slug: string): Promise<Tenant> {
    const tenant = await tenantRepository.findBySlug(slug);
    if (!tenant) {
      throw new NotFoundError('Tenant not found');
    }
    return this.mapToPlain(tenant);
  }

  /**
   * Create a new tenant
   * @throws {ConflictError} If slug already exists
   */
  async createTenant(data: CreateTenantData): Promise<Tenant> {
    // Check if slug already exists
    const existingTenant = await tenantRepository.findBySlug(data.slug);
    if (existingTenant) {
      throw new ConflictError('Tenant with this slug already exists');
    }

    const created = await tenantRepository.create(data);
    return this.mapToPlain(created);
  }

  /**
   * Update a tenant
   * @throws {NotFoundError} If tenant doesn't exist
   * @throws {ConflictError} If new slug already exists
   */
  async updateTenant(id: string, data: UpdateTenantData): Promise<Tenant> {
    // Check if tenant exists
    const existingTenant = await tenantRepository.findById(id);
    if (!existingTenant) {
      throw new NotFoundError('Tenant not found');
    }

    // If updating slug, check it's not already taken
    if (data.slug && data.slug !== existingTenant.slug) {
      const tenantWithSlug = await tenantRepository.findBySlug(data.slug);
      if (tenantWithSlug) {
        throw new ConflictError('Tenant with this slug already exists');
      }
    }

    const updated = await tenantRepository.update(id, data);
    if (!updated) {
      throw new NotFoundError('Tenant not found');
    }

    return this.mapToPlain(updated);
  }

  /**
   * Delete a tenant
   * @throws {NotFoundError} If tenant doesn't exist
   */
  async deleteTenant(id: string): Promise<void> {
    const deleted = await tenantRepository.delete(id);
    if (!deleted) {
      throw new NotFoundError('Tenant not found');
    }
  }

  /**
   * Count total tenants
   */
  async countTenants(params: QueryParams = {}): Promise<number> {
    return tenantRepository.count(params);
  }
}

export const tenantService = new TenantService();
