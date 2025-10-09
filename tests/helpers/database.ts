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
  const connectionString = `postgresql://${config.DB_USER}:${config.DB_PASSWORD}@${config.DB_HOST}:${config.DB_PORT}/${config.DB_NAME}`;

  return new DatabaseTestHelper({
    connectionString,
  });
}
