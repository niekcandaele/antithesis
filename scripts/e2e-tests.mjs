#!/usr/bin/env node
/**
 * E2E Test Orchestration Script
 *
 * Manages full E2E testing lifecycle:
 * 1. Clean up old containers/volumes
 * 2. Bring up datastores (PostgreSQL, Redis)
 * 3. Bring up Keycloak and initialize
 * 4. Build/pull production Docker image
 * 5. Run database migrations
 * 6. Start application
 * 7. Run Playwright E2E tests
 * 8. Capture logs and clean up
 *
 * Environment variables:
 *   DOCKER_TAG - Docker image tag to use (e.g., pr-123, main, v1.0.0)
 *   GITHUB_REPOSITORY - GitHub repo (e.g., owner/repo) for image pull
 *   CI - Set to 'true' in CI environment
 */

import { randomUUID } from 'crypto';
import { upMany, logs, upAll, down, run, pullAll } from 'docker-compose';
import { $ } from 'zx';
import { writeFile, mkdir } from 'fs/promises';

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntilHealthyHttp(url, maxRetries = 60) {
  try {
    const { stdout } = await $`curl -s -o /dev/null -w "%{http_code}" ${url}`;
    if (stdout.trim() === '200') {
      return;
    }
  } catch (err) {
    // Ignore curl errors during retries
  }

  if (maxRetries > 0) {
    await sleep(1000);
    await waitUntilHealthyHttp(url, maxRetries - 1);
  } else {
    throw new Error(`Failed to connect to ${url} after 60 retries`);
  }
}

// Generate random credentials for test environment
const POSTGRES_PASSWORD = randomUUID();
const KEYCLOAK_ADMIN_PASSWORD = randomUUID();
const KEYCLOAK_CLIENT_SECRET = randomUUID();
const SESSION_SECRET = randomUUID();

// Determine Docker tag and repository
const DOCKER_TAG = process.env.DOCKER_TAG || 'local';
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY || 'local/antithesis';
const IS_CI = process.env.CI === 'true';

console.log('🚀 Starting E2E test environment...');
console.log(`   Docker Tag: ${DOCKER_TAG}`);
console.log(`   Repository: ${GITHUB_REPOSITORY}`);
console.log(`   CI Mode: ${IS_CI}`);

process.env = {
  ...process.env,
  POSTGRES_USER: 'antithesis-test',
  POSTGRES_DB: 'antithesis-test-db',
  POSTGRES_PASSWORD,
  KEYCLOAK_URL: 'http://127.0.0.1:8080',
  KEYCLOAK_ADMIN_PASSWORD,
  KEYCLOAK_CLIENT_SECRET,
  KEYCLOAK_ALLOW_HTTP: 'true',
  SESSION_SECRET,
  DOCKER_TAG,
  GITHUB_REPOSITORY,
};

const composeOpts = {
  log: true,
  composeOptions: ['-f', 'docker-compose.test.yml'],
  env: {
    ...process.env,
  },
};

async function cleanUp() {
  console.log('🧹 Cleaning up old containers and volumes...');
  await down({
    ...composeOpts,
    commandOptions: ['--remove-orphans', '--volumes'],
  });
}

async function main() {
  await cleanUp();
  await mkdir('./test-results/e2e-logs', { recursive: true });

  console.log('📦 Bringing up datastores (PostgreSQL, Redis)...');
  await upMany(['postgres', 'redis'], composeOpts);
  await sleep(2000);

  console.log('🔐 Bringing up Keycloak...');
  await upMany(['keycloak'], composeOpts);

  console.log('⏳ Waiting for Keycloak to be ready...');
  await waitUntilHealthyHttp('http://127.0.0.1:8080/realms/master', 60);
  console.log('✅ Keycloak is ready');

  // Wait additional time for Keycloak to fully initialize
  await sleep(3000);

  console.log('🔧 Initializing Keycloak (realm, clients, test users)...');
  await $`KEYCLOAK_URL=http://127.0.0.1:8080 KEYCLOAK_ADMIN_PASSWORD=${KEYCLOAK_ADMIN_PASSWORD} KEYCLOAK_CLIENT_SECRET=${KEYCLOAK_CLIENT_SECRET} bash ./infra/keycloak-init.sh`;

  // If in CI, pull image; otherwise, build locally
  if (IS_CI && DOCKER_TAG !== 'local') {
    console.log('📥 Pulling production Docker image...');
    await pullAll({ ...composeOpts, log: false });
  } else {
    console.log('🔨 Building production Docker image locally...');
    await $`docker build -t ghcr.io/${GITHUB_REPOSITORY}:${DOCKER_TAG} -f Dockerfile .`;
  }

  console.log('🗄️  Running database migrations...');
  await run('app', 'npm run migrate', composeOpts);

  console.log('🚀 Starting application...');
  await upAll(composeOpts);

  console.log('⏳ Waiting for application to be ready...');
  await Promise.all([
    waitUntilHealthyHttp('http://127.0.0.1:13000/openapi.json', 60),
    waitUntilHealthyHttp('http://127.0.0.1:13002/healthz', 60),
  ]);
  console.log('✅ Application is ready');

  let failed = false;

  try {
    console.log('🎭 Running Playwright E2E tests...');

    // Build test environment configuration
    // Pass env vars directly to child process so they're available before config loads
    const testEnv = {
      ...process.env,
      // Keycloak configuration
      KEYCLOAK_URL: 'http://127.0.0.1:8080',
      KEYCLOAK_REALM: 'antithesis',
      KEYCLOAK_ADMIN_USER: 'admin',
      KEYCLOAK_ADMIN_PASSWORD: KEYCLOAK_ADMIN_PASSWORD,
      KEYCLOAK_ALLOW_HTTP: 'true',
      KEYCLOAK_CLIENT_ID: 'antithesis-app',
      KEYCLOAK_CLIENT_SECRET: KEYCLOAK_CLIENT_SECRET,
      SESSION_SECRET: SESSION_SECRET,

      // Database configuration for host-based tests
      DB_HOST: '127.0.0.1',
      DB_PORT: '15432',
      DB_NAME: process.env.POSTGRES_DB,
      DB_USER: process.env.POSTGRES_USER,
      DB_PASSWORD: POSTGRES_PASSWORD,
      DB_ADMIN_USER: process.env.POSTGRES_USER,
      DB_ADMIN_PASSWORD: POSTGRES_PASSWORD,

      // API URLs for tests
      PUBLIC_API_URL: 'http://127.0.0.1:13000',
      ADMIN_API_URL: 'http://127.0.0.1:13001',
      META_API_URL: 'http://127.0.0.1:13002',
    };

    // Run tests with proper environment
    await $({ env: testEnv })`npm run test:e2e`;

    console.log('✅ E2E tests passed!');
  } catch (error) {
    console.error('❌ E2E tests failed');
    failed = true;
  }

  console.log('📝 Capturing docker logs...');
  try {
    // Ensure directory exists before writing logs
    await mkdir('./test-results/e2e-logs', { recursive: true });

    const logsResult = await logs(['app', 'keycloak', 'postgres', 'redis'], {
      ...composeOpts,
      log: false,
    });

    await writeFile('./test-results/e2e-logs/docker-logs.txt', logsResult.out);
    await writeFile('./test-results/e2e-logs/docker-logs-err.txt', logsResult.err);
    console.log('✅ Docker logs captured successfully');
  } catch (error) {
    console.warn('⚠️  Failed to capture docker logs:', error.message);
    // Don't fail the entire test run just because log capture failed
  }

  await cleanUp();

  if (failed) {
    console.error('❌ E2E tests failed - check test-results/ for details');
    process.exit(1);
  }

  console.log('🎉 E2E tests completed successfully!');
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
