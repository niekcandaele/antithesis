import { roleRepository } from '../db/role.repository.js';
import type { RoleEntity } from '../db/role.repository.js';

/**
 * Code-defined role names
 * These are the only roles that should exist in the system
 */
export const ROLE_NAMES = {
  ADMIN: 'admin',
  USER: 'user',
  VIEWER: 'viewer',
} as const;

/**
 * Service for managing application roles
 *
 * Handles role seeding and role-related business logic.
 * Roles are code-defined and seeded at application startup.
 */
export class RoleService {
  /**
   * Seed initial roles into the database
   *
   * This method is idempotent - it can be safely called multiple times.
   * Existing roles are not modified, missing roles are created.
   *
   * @returns Array of seeded role entities
   */
  async seedRoles(): Promise<RoleEntity[]> {
    const rolesToSeed = Object.values(ROLE_NAMES);
    const seededRoles: RoleEntity[] = [];

    for (const roleName of rolesToSeed) {
      const role = await roleRepository.upsertByName(roleName);
      seededRoles.push(role);
    }

    return seededRoles;
  }

  /**
   * Get role by name
   */
  async getRoleByName(name: string): Promise<RoleEntity | undefined> {
    return roleRepository.findByName(name);
  }

  /**
   * Get all roles
   */
  async getAllRoles(): Promise<RoleEntity[]> {
    return roleRepository.findAll();
  }
}

export const roleService = new RoleService();
