#!/usr/bin/env node

/**
 * CLI script for running database migrations manually
 *
 * This script is intended for production environments where migrations
 * should not run automatically on application start.
 *
 * Usage:
 * ```bash
 * npm run migrate
 * ```
 *
 * Or directly:
 * ```bash
 * tsx src/lib/db/migrate-cli.ts
 * ```
 */

import { runMigrationsManually } from './migrations.js';
import { closeDb } from './index.js';

async function main() {
  try {
    await runMigrationsManually();
    await closeDb();
    process.exit(0);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Migration failed:', error);
    await closeDb();
    process.exit(1);
  }
}

void main();
