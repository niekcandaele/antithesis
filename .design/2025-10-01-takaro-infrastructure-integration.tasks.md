# Implementation Tasks: Takaro Infrastructure Integration

## Overview

Integrating core Takaro infrastructure components (TenantScoped, DTO, Health, Database, Redis) to enable multi-tenancy, data persistence, caching, and production-ready monitoring. This implementation follows a TDD approach with 6 phases, each building incrementally with full test coverage and documentation.

**Approach**: Start with Docker environment and config, then add core infrastructure (TenantScoped, DTO, Health), database layer, Redis, and finally integrate everything with comprehensive testing.

## Phase 1: Docker Environment & Configuration

**Goal**: Set up development environment with PostgreSQL, Redis containers and extend config for new infrastructure
**Demo**: "At standup, I can show: Docker Compose starts PostgreSQL and Redis, app connects to both services, config loaded from environment variables"

### Tasks

- [x] 1.1: Create docker-compose.yml with PostgreSQL 17 and Redis 7
  - **Output**: docker-compose.yml with PostgreSQL, Redis, and app service configuration
  - **Files**: `docker-compose.yml` (modified)
  - **Verify**: `docker compose up -d` starts all services, `docker compose ps` shows all healthy
  - **Details**:
    - PostgreSQL 17.4 container with health check (`pg_isready`)
    - Redis 7.4-alpine container with health check (`redis-cli ping`)
    - Persistent volumes for both services
    - App service depends on healthy PostgreSQL and Redis

- [x] 1.2: Extend config schema for database and Redis settings
  - **Depends on**: 1.1
  - **Output**: Config supports DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, DB_POOL_SIZE, REDIS_HOST, REDIS_PORT, REDIS_USERNAME, REDIS_PASSWORD, DTO_AUTO_VALIDATE
  - **Files**: `src/lib/config.ts` (modified)
  - **Verify**: Config parses database and Redis env vars correctly
  - **JSDoc**: Add documentation for each new config field with examples

- [x] 1.3: Install database and Redis dependencies
  - **Depends on**: 1.2
  - **Output**: Dependencies added: kysely@0.28.7, pg@8.16.3, redis@5.8.2, @types/pg@8.15.5, kysely-codegen@0.19.0
  - **Files**: `package.json` (modified)
  - **Verify**: `npm install` succeeds, check package versions are latest stable
  - **Details**: Verified versions are latest stable (not 'latest' tag)

- [x] 1.4: Add npm scripts for migrations and type generation
  - **Depends on**: 1.3
  - **Output**: Scripts added: `migrate`, `db:codegen`
  - **Files**: `package.json` (modified)
  - **Verify**: Scripts appear in package.json
  - **Details**:
    - `migrate`: "tsx src/lib/db/migrate-cli.ts"
    - `db:codegen`: "kysely-codegen --out-file src/lib/db/types.ts"

- [x] 1.5: Write unit tests for config validation
  - **Depends on**: 1.2
  - **Output**: Tests verify database and Redis config parsing
  - **Files**: `src/lib/config.test.ts` (modified)
  - **Verify**: Tests pass, coverage includes new config fields
  - **Test Cases**:
    - Database config fields parse correctly
    - Redis config fields parse correctly
    - DTO_AUTO_VALIDATE defaults to true
    - DB_POOL_SIZE has environment-aware defaults

### Phase 1 Checkpoint

- [x] Run lint: `npm run lint`
- [x] Run format: `npm run format`
- [x] Run build: `npm run build`
- [x] Run tests: `npm test` (14 tests passing)
- [x] Manual verification: `docker compose up -d`, verify all services healthy
- [x] **Demo ready**: Show Docker Compose running PostgreSQL and Redis, config loading from .env

## Phase 2: Core Infrastructure (TenantScoped, DTO, Health)

**Goal**: Implement foundational classes for multi-tenancy, data validation, and health monitoring
**Demo**: "At standup, I can show: TenantScoped service with automatic logging metadata, DTO auto-validation, Health endpoints returning status"

### Tasks

- [ ] 2.1: Create TenantId branded type and guard function
  - **Output**: TenantId type and isTenantId() type guard
  - **Files**: `src/lib/types.ts` (new)
  - **Verify**: TypeScript compiles, type guard works correctly
  - **JSDoc**: Document TenantId branded type pattern with usage example
  - **Details**: Branded type prevents accidental use of raw strings

- [ ] 2.2: Implement TenantScoped base class
  - **Depends on**: 2.1
  - **Output**: TenantScoped class with tenantId property and scoped logger
  - **Files**: `src/lib/TenantScoped.ts` (new)
  - **Verify**: Class instantiates, logger includes tenantId metadata
  - **JSDoc**: Document constructor, properties, include inheritance example
  - **Details**: Logger initialized with `logger(className, { tenantId })`

- [ ] 2.3: Write unit tests for TenantScoped
  - **Depends on**: 2.2
  - **Output**: Tests for TenantScoped class
  - **Files**: `src/lib/TenantScoped.test.ts` (new)
  - **Verify**: Tests pass, 80%+ coverage
  - **Test Cases**:
    - Constructor sets tenantId correctly
    - Logger namespace uses class name
    - Logger includes tenantId in metadata
    - Test: "tenant scoped service retains tenant info in logs and ctx"

- [ ] 2.4: Implement DTO base class with Zod validation
  - **Output**: DTO class with config-based auto-validation, toJSON/fromJSON methods
  - **Files**: `src/lib/DTO.ts` (new)
  - **Verify**: DTO validates data, respects DTO_AUTO_VALIDATE config
  - **JSDoc**: Document constructor, validate(), toJSON(), fromJSON() with examples
  - **Details**:
    - Auto-validate in constructor if config.DTO_AUTO_VALIDATE is true
    - Support Zod v4 JSON schema conversion via getJsonSchema()
    - Throw ValidationError on invalid data

- [ ] 2.5: Write unit tests for DTO
  - **Depends on**: 2.4
  - **Output**: Tests for DTO validation and serialization
  - **Files**: `src/lib/DTO.test.ts` (new)
  - **Verify**: Tests pass, 80%+ coverage
  - **Test Cases**:
    - Validation succeeds with valid data
    - Validation throws ValidationError with invalid data
    - Auto-validation respects DTO_AUTO_VALIDATE config
    - toJSON/fromJSON round-trip preserves data
    - Zod schema integration works

- [ ] 2.6: Implement Health singleton with separate hook registries
  - **Output**: Health class with registerHealthHook(), registerReadinessHook(), checkHealth(), checkReadiness()
  - **Files**: `src/lib/health.ts` (new)
  - **Verify**: Hooks register/unregister, checks execute correctly
  - **JSDoc**: Document all methods with usage examples for liveness vs readiness
  - **Details**:
    - Separate Maps for healthHooks and readinessHooks
    - checkHealth() executes only health hooks
    - checkReadiness() executes both health and readiness hooks

- [ ] 2.7: Write unit tests for Health
  - **Depends on**: 2.6
  - **Output**: Tests for Health hook management
  - **Files**: `src/lib/health.test.ts` (new)
  - **Verify**: Tests pass, 80%+ coverage
  - **Test Cases**:
    - Separate health and readiness hook registration
    - checkHealth() returns true when all health hooks succeed
    - checkReadiness() returns true when all (health + readiness) hooks succeed
    - checkReadiness() returns false if any hook fails
    - Async hook execution works correctly

- [ ] 2.8: Create health controller with /healthz and /readyz endpoints
  - **Depends on**: 2.6
  - **Output**: Health controller with two endpoints using apiResponse() wrapper
  - **Files**: `src/controllers/health.ts` (new)
  - **Verify**: Endpoints return 200 or 503 with apiResponse format
  - **JSDoc**: Document controller and endpoints
  - **Details**:
    - /healthz calls checkHealth()
    - /readyz calls checkReadiness()
    - Use apiResponse() for consistency
    - Hide endpoints from OpenAPI via .hideFromOpenAPI()

- [ ] 2.9: Write integration tests for health endpoints
  - **Depends on**: 2.8
  - **Output**: Tests for health endpoint behavior
  - **Files**: `src/controllers/health.test.ts` (new)
  - **Verify**: Tests pass, endpoints return correct status codes
  - **Test Cases**:
    - /healthz returns 200 with apiResponse({healthy: true}) when all checks pass
    - /healthz returns 503 with apiResponse({healthy: false}) when check fails
    - /readyz checks both health and readiness hooks
    - apiResponse() wrapper is used

### Phase 2 Checkpoint

- [ ] Run lint: `npm run lint`
- [ ] Run format: `npm run format`
- [ ] Run build: `npm run build`
- [ ] Run tests: `npm test`
- [ ] Manual verification: Import classes, verify TypeScript types work
- [ ] **Demo ready**: Show TenantScoped service logging with tenant metadata, DTO auto-validation, health check endpoints

## Phase 3: Database Layer (Kysely, Migrations, Query Builder)

**Goal**: Implement PostgreSQL integration with Kysely ORM, migrations, and query utilities
**Demo**: "At standup, I can show: Database connects, migrations run, query builder filters/paginates data, tenant isolation works"

### Tasks

- [ ] 3.1: Create Kysely database connection module
  - **Output**: Database connection with configurable pool size
  - **Files**: `src/lib/db/index.ts` (new)
  - **Verify**: getDb() returns Kysely instance, pool connects to PostgreSQL
  - **JSDoc**: Document getDb() with connection example
  - **Details**:
    - Connection pooling with config.DB_POOL_SIZE
    - Idle timeout: 30s, connection timeout: 10s
    - Singleton pattern for database instance

- [ ] 3.2: Create migration runner with environment-aware execution
  - **Depends on**: 3.1
  - **Output**: Migration system that auto-runs in dev, manual in prod
  - **Files**: `src/lib/db/migrations.ts` (new)
  - **Verify**: Migrations run in development, skip in production
  - **JSDoc**: Document runMigrations() with migration file structure example
  - **Details**:
    - Use Kysely FileMigrationProvider
    - Only auto-run if NODE_ENV === 'development'
    - Reads from src/db/migrations/

- [ ] 3.3: Create CLI script for manual production migrations
  - **Depends on**: 3.2
  - **Output**: Standalone CLI for running migrations
  - **Files**: `src/lib/db/migrate-cli.ts` (new)
  - **Verify**: `npm run migrate` executes migrations
  - **JSDoc**: Document CLI usage
  - **Details**: Imports and calls runMigrations() directly

- [ ] 3.4: Create BaseModel interfaces and helpers
  - **Depends on**: 3.1
  - **Output**: BaseModel interface and timestamp helpers
  - **Files**: `src/lib/db/BaseModel.ts` (new)
  - **Verify**: Interfaces compile, helper functions work
  - **JSDoc**: Document interfaces and helper functions
  - **Details**:
    - BaseModel interface: id, createdAt, updatedAt
    - withTimestamps() helper function

- [ ] 3.5: Create TenantScopedModel helper
  - **Depends on**: 3.4
  - **Output**: withTenantScope() helper for query filtering
  - **Files**: `src/lib/db/TenantScopedModel.ts` (new)
  - **Verify**: Helper adds tenantId filter to queries
  - **JSDoc**: Document withTenantScope() with usage example
  - **Details**: Applies `where('tenantId', '=', tenantId)` to query

- [ ] 3.6: Implement query builder with pagination limits
  - **Output**: buildQuery() function with filters, ILIKE search, pagination (default 20, max 100)
  - **Files**: `src/lib/db/queryBuilder.ts` (new)
  - **Verify**: Query builder applies filters, pagination, sorting correctly
  - **JSDoc**: Document QueryParams interface and buildQuery() with examples
  - **Details**:
    - Filters: IN queries
    - Search: ILIKE for case-insensitive
    - Pagination: default 20, max 100
    - GreaterThan/LessThan comparisons
    - Sorting with direction

- [ ] 3.7: Write unit tests for query builder
  - **Depends on**: 3.6
  - **Output**: Tests for query builder logic
  - **Files**: `src/lib/db/queryBuilder.test.ts` (new)
  - **Verify**: Tests pass, 80%+ coverage
  - **Test Cases**:
    - Filter application (IN queries)
    - ILIKE search (case-insensitive)
    - Greater than/less than comparisons
    - Pagination offset/limit calculations (default 20, max 100)
    - Sorting with direction
    - Edge cases: empty filters, null values, invalid sort fields

- [ ] 3.8: Create example migration
  - **Depends on**: 3.2
  - **Output**: Example migration creating users table
  - **Files**: `src/db/migrations/001_create_example_table.ts` (new)
  - **Verify**: Migration runs successfully via npm run migrate
  - **Details**:
    - Include tenantId column
    - Include id, createdAt, updatedAt columns
    - up() and down() functions

- [ ] 3.9: Generate Kysely types from database schema
  - **Depends on**: 3.8
  - **Output**: Auto-generated Kysely types
  - **Files**: `src/lib/db/types.ts` (new, generated)
  - **Verify**: `npm run db:codegen` generates types successfully
  - **Details**: Run after migration to generate types from schema

- [ ] 3.10: Write integration tests for database
  - **Depends on**: 3.8, 3.9
  - **Output**: Tests for database operations
  - **Files**: `src/lib/db/db.test.ts` (new)
  - **Verify**: Tests pass, database operations work correctly
  - **Test Cases**:
    - Connection establishment
    - Migration execution
    - CRUD operations
    - Tenant isolation verification (cannot query other tenant's data)
    - Query builder integration with real database

### Phase 3 Checkpoint

- [ ] Run lint: `npm run lint`
- [ ] Run format: `npm run format`
- [ ] Run build: `npm run build`
- [ ] Run tests: `npm test`
- [ ] Run migrations: `npm run migrate`
- [ ] Generate types: `npm run db:codegen`
- [ ] Manual verification: Connect to database, verify tables created, query data
- [ ] **Demo ready**: Show database connection, migrations running, query builder filtering/paginating, tenant isolation

## Phase 4: Redis Layer

**Goal**: Implement Redis client management with app-name and tenant-scoped variants
**Demo**: "At standup, I can show: Redis connects, key namespacing works (app-only and app+tenant), health checks register automatically"

### Tasks

- [ ] 4.1: Implement Redis class with dual client methods
  - **Output**: Redis singleton with getClient() and getTenantScopedClient()
  - **Files**: `src/lib/redis.ts` (new)
  - **Verify**: Both methods return cached clients, key prefixing works
  - **JSDoc**: Document both methods with examples showing key prefixing
  - **Details**:
    - getClient(name): prefix with `${APP_NAME}:${name}:`
    - getTenantScopedClient(tenantId, name): prefix with `${APP_NAME}:${tenantId}:${name}:`
    - Auto-register readiness hooks for each client
    - Client caching by composite key

- [ ] 4.2: Write unit tests for Redis client caching
  - **Depends on**: 4.1
  - **Output**: Tests for Redis client management
  - **Files**: `src/lib/redis.test.ts` (new)
  - **Verify**: Tests pass, 80%+ coverage
  - **Test Cases**:
    - Client caching (returns same instance)
    - Multiple clients with different names
    - Configuration merging
    - getClient() vs getTenantScopedClient() key prefixing behavior

- [ ] 4.3: Write integration tests for Redis
  - **Depends on**: 4.1
  - **Output**: Tests for Redis operations
  - **Files**: `src/lib/redis.integration.test.ts` (new)
  - **Verify**: Tests pass, Redis operations work
  - **Test Cases**:
    - Connection establishment
    - Basic operations (get/set)
    - Health check registration via registerReadinessHook()
    - Client cleanup on destroy()
    - Key prefixing verification (check actual Redis keys)

### Phase 4 Checkpoint

- [ ] Run lint: `npm run lint`
- [ ] Run format: `npm run format`
- [ ] Run build: `npm run build`
- [ ] Run tests: `npm test`
- [ ] Manual verification: Connect to Redis, verify key prefixes, check health hook registration
- [ ] **Demo ready**: Show Redis connection, key namespacing (global vs tenant-scoped), health checks

## Phase 5: Integration & Application Wiring

**Goal**: Wire all components together, register health checks, export public APIs
**Demo**: "At standup, I can show: Full app with database and Redis, health endpoints showing all checks, DTO working in endpoints with OpenAPI spec"

### Tasks

- [ ] 5.1: Initialize database in main application
  - **Output**: Database initialized on app start with migrations (dev only)
  - **Files**: `src/index.ts` (modify)
  - **Verify**: App starts, database connects, migrations run in dev
  - **Details**:
    - Import and call getDb()
    - Run migrations if NODE_ENV === 'development'
    - Add error handling for connection failures

- [ ] 5.2: Register database health check
  - **Depends on**: 5.1
  - **Output**: Database health check registered as readiness hook
  - **Files**: `src/index.ts` (modify)
  - **Verify**: /readyz endpoint checks database connection
  - **Details**: Use `health.registerReadinessHook('database', async () => db.raw('SELECT 1'))`

- [ ] 5.3: Initialize Redis client and register health check
  - **Depends on**: 5.1
  - **Output**: Redis client initialized, health check auto-registered
  - **Files**: `src/index.ts` (modify)
  - **Verify**: /readyz endpoint checks Redis connection
  - **Details**: Call Redis.getClient() during startup, health hook auto-registers

- [ ] 5.4: Register health controller
  - **Depends on**: 5.2, 5.3
  - **Output**: Health controller added to app
  - **Files**: `src/index.ts` (modify)
  - **Verify**: /healthz and /readyz endpoints accessible
  - **Details**: Add healthController to controllers array

- [ ] 5.5: Export public API from lib/http/index.ts
  - **Output**: DTO, TenantScoped, TenantId, health exported
  - **Files**: `src/lib/http/index.ts` (modify)
  - **Verify**: All types and classes are importable
  - **JSDoc**: Add re-export documentation
  - **Details**: Export from new modules for public API

- [ ] 5.6: Write integration test for DTO in endpoints
  - **Output**: Test endpoint using DTO with OpenAPI spec verification
  - **Files**: `src/lib/http/dto.test.ts` (new)
  - **Verify**: Test passes, OpenAPI spec includes DTO schema
  - **Test Cases**:
    - Create endpoint with DTO input validation
    - Test valid DTO data (200 response)
    - Test invalid DTO data (422 validation error)
    - Verify OpenAPI spec includes DTO schema with Zod JSON schema conversion

- [ ] 5.7: Write E2E test for full workflow
  - **Output**: End-to-end test of entire system
  - **Files**: `src/e2e.test.ts` (new)
  - **Verify**: Test passes, entire workflow works
  - **Test Cases**:
    - Start server with Docker Compose
    - Database connection and migrations complete
    - Redis connection established
    - Health endpoints responding (/healthz, /readyz)
    - DTO validation in real HTTP requests
    - Tenant-scoped operations work

### Phase 5 Checkpoint

- [ ] Run lint: `npm run lint`
- [ ] Run format: `npm run format`
- [ ] Run build: `npm run build`
- [ ] Run tests: `npm test`
- [ ] Start app: `docker compose up`
- [ ] Manual verification:
  - Visit /healthz and /readyz endpoints
  - Verify database and Redis health checks
  - Check /openapi.json for DTO schemas
  - Test DTO endpoint with valid/invalid data
- [ ] **Demo ready**: Show full application with all components working, health checks, DTO validation, tenant isolation

## Phase 6: Final Validation & Documentation

**Goal**: Verify all requirements met, documentation complete, test coverage adequate
**Demo**: "At standup, I can show: All requirements met (checklist), 80%+ test coverage, comprehensive JSDoc, production-ready system"

### Tasks

- [ ] 6.1: Review and verify all JSDoc documentation
  - **Output**: All public APIs have complete JSDoc with examples
  - **Files**: All source files (review)
  - **Verify**: Every public class, function, method has JSDoc
  - **Details**:
    - Check parameter descriptions
    - Check return types
    - Check usage examples demonstrate real-world usage

- [ ] 6.2: Generate and review test coverage report
  - **Output**: Coverage report showing 80%+ coverage
  - **Files**: N/A (report generation)
  - **Verify**: Coverage meets 80% threshold
  - **Details**: Run coverage tool, identify any gaps

- [ ] 6.3: Verify all requirements from design document
  - **Output**: Requirements checklist completed
  - **Files**: N/A (verification)
  - **Verify**: All REQ-001 through REQ-021 satisfied
  - **Details**: Go through each requirement and verify implementation

- [ ] 6.4: Run full test suite in Docker environment
  - **Output**: All tests pass in Docker
  - **Files**: N/A (testing)
  - **Verify**: `docker compose up` followed by tests all pass
  - **Details**: Ensure Docker environment is production-like

- [ ] 6.5: Manual verification checklist
  - **Output**: Manual testing completed
  - **Files**: N/A (manual testing)
  - **Verify**: All manual tests pass
  - **Details**:
    - Docker Compose starts all services
    - Database migrations run (dev mode)
    - Health endpoints return correct status
    - Redis key prefixing works
    - DTO validation works in endpoints
    - Tenant isolation works
    - OpenAPI spec includes all schemas

- [ ] 6.6: Update documentation if needed
  - **Output**: Any README or documentation updates
  - **Files**: README.md or docs/ (if needed)
  - **Verify**: Documentation reflects new infrastructure
  - **Details**: Add sections for database setup, migrations, Redis usage

### Phase 6 Checkpoint

- [ ] Run lint: `npm run lint`
- [ ] Run format: `npm run format`
- [ ] Run build: `npm run build`
- [ ] Run tests: `npm test` (with coverage)
- [ ] Verify coverage: 80%+ threshold met
- [ ] Manual verification: All items from checklist pass
- [ ] **Demo ready**: Show production-ready system with all requirements met, comprehensive testing, complete documentation

## Final Verification

- [ ] All requirements from design doc met (REQ-001 through REQ-021)
- [ ] All obsolete code removed (none for this additive feature)
- [ ] Tests comprehensive (80%+ coverage achieved)
- [ ] Documentation complete (JSDoc on all public APIs)
- [ ] Docker Compose starts all services successfully
- [ ] Health endpoints operational (/healthz, /readyz)
- [ ] Database migrations work (auto in dev, manual in prod)
- [ ] Redis client management functional
- [ ] Query builder filters, paginates, sorts correctly
- [ ] Tenant isolation verified
- [ ] OpenAPI spec includes DTO schemas
- [ ] Production-ready and maintainable

## Relevant Files

(This section will be updated as files are created/modified during implementation)

### Core Infrastructure

- `src/lib/types.ts` - TenantId branded type and type guard
- `src/lib/TenantScoped.ts` - Base class for tenant-scoped services with automatic logging
- `src/lib/DTO.ts` - Base class for Data Transfer Objects with Zod validation
- `src/lib/health.ts` - Health check singleton with separate liveness/readiness registries

### Database Layer

- `src/lib/db/index.ts` - Kysely database connection and initialization
- `src/lib/db/migrations.ts` - Migration runner (environment-aware)
- `src/lib/db/migrate-cli.ts` - CLI script for manual production migrations
- `src/lib/db/BaseModel.ts` - Base model interface and timestamp helpers
- `src/lib/db/TenantScopedModel.ts` - Tenant-scoped query helper
- `src/lib/db/queryBuilder.ts` - Query builder with filtering, pagination, sorting
- `src/lib/db/types.ts` - Auto-generated Kysely types (via kysely-codegen)

### Redis Layer

- `src/lib/redis.ts` - Redis client management with app and tenant-scoped variants

### Controllers & API

- `src/controllers/health.ts` - Health check endpoints (/healthz, /readyz)

### Configuration & Environment

- `src/lib/config.ts` - Extended with database and Redis configuration
- `docker-compose.yml` - PostgreSQL and Redis containers

### Application Entry

- `src/index.ts` - Application initialization with database, Redis, and health checks

### Tests

- `src/lib/config.test.ts` - Config validation tests
- `src/lib/TenantScoped.test.ts` - TenantScoped class tests
- `src/lib/DTO.test.ts` - DTO validation and serialization tests
- `src/lib/health.test.ts` - Health check system tests
- `src/controllers/health.test.ts` - Health endpoint integration tests
- `src/lib/db/queryBuilder.test.ts` - Query builder unit tests
- `src/lib/db/db.test.ts` - Database integration tests
- `src/lib/redis.test.ts` - Redis client management unit tests
- `src/lib/redis.integration.test.ts` - Redis integration tests
- `src/lib/http/dto.test.ts` - DTO endpoint integration tests
- `src/e2e.test.ts` - End-to-end workflow tests

### Dependencies

- `package.json` - Added kysely, pg, redis, types, and scripts
