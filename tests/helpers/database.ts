/**
 * Database helper utilities for E2E tests
 *
 * Provides functions to clean up test data between test runs
 */

import { Pool } from 'pg';

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
      await client.query('TRUNCATE albums, photos, tenants RESTART IDENTITY CASCADE;');
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
 */
export function createDatabaseHelper(): DatabaseTestHelper {
  const connectionString =
    process.env.DATABASE_URL || 'postgresql://antithesis:antithesis@localhost:5432/antithesis';

  return new DatabaseTestHelper({
    connectionString,
  });
}
