/**
 * Database helper utilities for E2E tests
 *
 * Provides functions to clean up test data between test runs
 */

import { Pool } from 'pg';
import { config } from '../../src/lib/config.js';

interface DatabaseConfig {
  connectionString: string;
}

export class DatabaseTestHelper {
  private pool: Pool;

  constructor(config: DatabaseConfig) {
    this.pool = new Pool({
      connectionString: config.connectionString,
    });
  }

  /**
   * Clean all test data from the database
   * Truncates tables in correct order to handle foreign key constraints
   */
  async cleanup(): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Truncate in order to handle foreign key constraints
      // CASCADE will also truncate dependent tables (user_tenants, user_roles)
      await client.query('TRUNCATE users, albums, photos, tenants RESTART IDENTITY CASCADE;');
    } finally {
      client.release();
    }
  }

  /**
   * Get user and tenant information by email
   *
   * @param email User email
   * @returns User ID and tenant ID
   */
  async getUserInfo(email: string): Promise<{ userId: string; tenantId: string } | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT u.id as user_id, u.primary_tenant_id as tenant_id
         FROM users u
         WHERE u.email = $1`,
        [email],
      );

      if (result.rows.length === 0) {
        return null;
      }

      return {
        userId: result.rows[0].user_id,
        tenantId: result.rows[0].tenant_id,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Seed test albums directly into the database
   * Much faster than creating albums via UI automation
   *
   * @param count Number of albums to create
   * @param namePrefix Prefix for album names (will be numbered)
   * @param tenantId Tenant ID for the albums
   * @param userId User ID who creates the albums
   * @returns Array of created album IDs
   */
  async seedAlbums(
    count: number,
    namePrefix: string,
    tenantId: string,
    userId: string,
  ): Promise<string[]> {
    const client = await this.pool.connect();
    try {
      const albumIds: string[] = [];

      for (let i = 0; i < count; i++) {
        const result = await client.query(
          `INSERT INTO albums (tenant_id, name, description, status, created_by_user_id, created_at, updated_at, is_deleted)
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), false)
           RETURNING id`,
          [tenantId, `${namePrefix} ${i + 1}`, `Test album ${i + 1}`, 'published', userId],
        );
        albumIds.push(result.rows[0].id);
      }

      return albumIds;
    } finally {
      client.release();
    }
  }

  /**
   * Seed albums with custom names directly into the database
   * Much faster than creating albums via UI automation
   *
   * @param albumNames Array of album names to create
   * @param tenantId Tenant ID for the albums
   * @param userId User ID who creates the albums
   * @returns Array of created album IDs
   */
  async seedAlbumsWithNames(
    albumNames: string[],
    tenantId: string,
    userId: string,
  ): Promise<string[]> {
    const client = await this.pool.connect();
    try {
      const albumIds: string[] = [];

      for (const albumName of albumNames) {
        const result = await client.query(
          `INSERT INTO albums (tenant_id, name, description, status, created_by_user_id, created_at, updated_at, is_deleted)
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), false)
           RETURNING id`,
          [tenantId, albumName, `Test album: ${albumName}`, 'published', userId],
        );
        albumIds.push(result.rows[0].id);
      }

      return albumIds;
    } finally {
      client.release();
    }
  }

  /**
   * Close database connection pool
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}

/**
 * Create a database helper instance with default configuration
 *
 * Uses postgres superuser for test cleanup operations that require elevated privileges (TRUNCATE CASCADE).
 * In production, the application uses the non-superuser antithesis_app account for RLS enforcement.
 */
export function createDatabaseHelper(): DatabaseTestHelper {
  // Use the same config system as the application
  const connectionString = `postgresql://${config.DB_ADMIN_USER}:${config.DB_ADMIN_PASSWORD}@${config.DB_HOST}:${config.DB_PORT}/${config.DB_NAME}`;

  return new DatabaseTestHelper({
    connectionString,
  });
}
