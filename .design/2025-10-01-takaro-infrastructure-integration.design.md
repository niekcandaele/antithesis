# Design: Takaro Infrastructure Integration

## Layer 1: Problem & Requirements

### Problem Statement

The Antithesis application needs infrastructure components from the Takaro ecosystem to support multi-tenancy, data persistence, caching, and standardized patterns. Currently, the codebase lacks:

- Multi-tenant scoping mechanism for services and components
- Standardized DTO (Data Transfer Object) pattern with Zod-based validation
- Health check system with endpoint support for readiness and liveness probes
- Database infrastructure with Kysely ORM for PostgreSQL
- Reusable base Model pattern for database entities
- Query builder utilities for common operations (filtering, pagination, sorting)
- Redis client management for caching and session storage

These components are essential for integrating Antithesis into the broader Takaro ecosystem and enabling data persistence with production-ready patterns.

### Current State

**What Exists:**

- HTTP framework with Zod validation for endpoint inputs/outputs (src/lib/http/endpoint.ts:100-122)
- OpenAPI spec generation from Zod schemas (src/lib/http/oas.ts:75-109)
- Logger function that accepts namespace parameter (src/lib/logger.ts:45-47)
- Error handling with HttpError base class (src/lib/http/errors.ts:1-59)
- Config system using Zod schema validation (src/lib/config.ts:6-20)

**Pain Points:**

- No multi-tenancy infrastructure - services cannot scope operations to specific tenants
- Endpoint validation doesn't follow standardized DTO pattern used in Takaro
- No health check system for monitoring service availability
- Missing standard /healthz and /readyz endpoints expected in production deployments
- No database infrastructure - cannot persist data beyond in-memory storage
- No Redis client management - cannot implement caching or distributed state
- No standardized query patterns - risk of inconsistent filtering/pagination across features

### Requirements

#### Functional

- REQ-001: The system SHALL provide a TenantScoped base class that accepts a TenantId branded type and provides scoped logging with automatic tenantId metadata
- REQ-001a: The system SHALL provide an isTenantId() TypeScript guard function for TenantId validation
- REQ-002: The system SHALL provide a DTO base class using Zod for validation with configurable auto-validation behavior
- REQ-002a: DTO auto-validation SHALL be controlled by DTO_AUTO_VALIDATE config (default: true)
- REQ-003: WHEN a DTO is validated THEN it SHALL throw ValidationError with Zod issues on failure
- REQ-004: The DTO class SHALL support JSON serialization with toJSON() and fromJSON() methods
- REQ-005: The system SHALL provide a Health singleton with separate registries for health and readiness hooks
- REQ-005a: Health SHALL provide registerHealthHook() for liveness checks
- REQ-005b: Health SHALL provide registerReadinessHook() for readiness checks
- REQ-006: WHEN /healthz endpoint is called THEN only health hooks SHALL execute and return status
- REQ-007: WHEN /readyz endpoint is called THEN both health AND readiness hooks SHALL execute and return status
- REQ-007a: Health endpoints SHALL use apiResponse() wrapper for consistency
- REQ-008: The OpenAPI specification SHALL include complete schema information from DTO classes using Zod v4 JSON schema conversion
- REQ-009: DTO validation errors SHALL be formatted consistently with existing error handling
- REQ-010: The system SHALL provide Kysely-based database infrastructure for PostgreSQL
- REQ-011: Database migrations SHALL be stored in src/db/migrations/ and run automatically in development
- REQ-011a: In production, migrations SHALL be triggered via npm run migrate command
- REQ-011b: Kysely type generation SHALL use kysely-codegen and be committed to version control
- REQ-012: The system SHALL provide BaseModel and TenantScopedModel classes for database entities
- REQ-013: TenantScopedModel SHALL automatically filter queries by tenantId
- REQ-014: The system SHALL provide query builder utilities for filtering, pagination, and sorting
- REQ-015: Query builder SHALL support filters, search (ILIKE), greaterThan, lessThan, pagination (default 20, max 100), and sorting
- REQ-016: The system SHALL provide Redis client management with connection caching and automatic app name prefixing
- REQ-016a: Redis SHALL provide getClient(name) for non-tenant-scoped clients
- REQ-016b: Redis SHALL provide getTenantScopedClient(tenantId, name) that prefixes keys with tenantId
- REQ-017: Redis clients SHALL automatically register health checks on connection
- REQ-018: Database and Redis configuration SHALL be managed via environment variables with configurable connection pooling
- REQ-019: All public classes, functions, and methods SHALL have JSDoc comments with descriptions and examples
- REQ-020: Each implementation phase SHALL include unit tests achieving minimum 80% code coverage
- REQ-021: JSDoc examples SHALL demonstrate real-world usage patterns for the API

#### Non-Functional

- Performance: Health checks should complete within 5 seconds
- Performance: Database queries should use connection pooling
- Performance: Redis connections should be cached and reused
- Security: No sensitive information in health check responses
- Security: Database credentials must not be logged or exposed
- Usability: DTOs should have TypeScript type inference from Zod schemas
- Usability: Query builder API should be intuitive and type-safe
- Compatibility: Must integrate cleanly with existing HTTP framework and OpenAPI generation
- Reliability: Database migrations should be idempotent and versioned
- Documentation: JSDoc must include parameter descriptions, return types, and usage examples
- Documentation: Public APIs must have examples showing common use cases
- Quality: Unit tests must cover success cases, error cases, and edge cases
- Quality: Test coverage should be measurable and reported

### Constraints

- Must use Zod (already dependency) instead of class-validator/class-transformer
- Must use Kysely (not Objection.js) for database ORM
- Cannot break existing endpoint validation system
- Must maintain compatibility with existing OpenAPI spec generation
- Logger namespace pattern must remain consistent (src/lib/logger.ts:45-47)
- Terminology change: "domain" → "tenant" throughout
- PostgreSQL-specific (no multi-database support needed)
- Development environment runs in Docker (docker-compose.yml must include PostgreSQL and Redis)

### Success Criteria

- TenantScoped class can be extended by services for tenant-scoped operations
- DTOs validate successfully with Zod and generate correct OpenAPI schemas
- Health endpoints return proper HTTP status codes (200 for healthy, 503 for unhealthy)
- Database connection established and migrations run successfully
- Query builder correctly filters, paginates, and sorts data
- Redis client connects and registers health check automatically
- Docker Compose starts PostgreSQL, Redis, and application successfully
- Existing tests continue to pass
- New integration tests demonstrate database and Redis usage

## Layer 2: Functional Specification

### User Workflows

1. **Define Tenant-Scoped Service**
   - Developer creates class extending TenantScoped
   - Constructor receives tenantId parameter
   - Logger automatically namespaced with class name
   - Service methods operate within tenant context

2. **Create Data Transfer Object**
   - Developer defines DTO class extending BaseDTO
   - Constructor receives Zod schema
   - Instance automatically validates on creation
   - JSON serialization/deserialization available via methods
   - TypeScript types inferred from schema

3. **Register Health Check**
   - Service registers async health check function
   - Health singleton manages registered checks
   - Check executes when /healthz or /readyz called
   - Returns true for healthy, false or throws for unhealthy

4. **Monitor Service Health**
   - Operator calls GET /healthz for liveness probe
   - System executes all registered health checks
   - Returns 200 OK with {healthy: true} on success
   - Returns 503 Service Unavailable with {healthy: false} on failure

5. **Define Database Model**
   - Developer creates class extending BaseModel or TenantScopedModel
   - Define table name and schema
   - Models automatically include id, createdAt, updatedAt
   - TenantScopedModel automatically filters by tenantId

6. **Query Database with Filtering**
   - Service uses query builder utilities
   - Applies filters, pagination, sorting via QueryParams
   - Query builder constructs type-safe Kysely queries
   - Returns paginated results

7. **Connect to Redis**
   - Service calls Redis.getClient(name) with unique name
   - Redis manager creates or reuses cached connection
   - Health check automatically registered for connection
   - Service uses client for caching/sessions

8. **Run Database Migrations**
   - Developer creates migration file in src/db/migrations/
   - Migration runs automatically on application start
   - Database schema updated to latest version
   - Idempotent migrations prevent duplicate runs

### External Interfaces

**TenantId Type & Guard:**

```typescript
// Branded type for type safety
type TenantId = string & { readonly __brand: 'TenantId' };

// Type guard function
function isTenantId(value: unknown): value is TenantId {
  return typeof value === 'string' && value.length > 0;
}

// Usage
const rawId = 'tenant-123';
if (isTenantId(rawId)) {
  const tenantId: TenantId = rawId;
  // Can now use tenantId safely
}
```

**TenantScoped API:**

```typescript
class MyService extends TenantScoped {
  constructor(tenantId: TenantId) {
    super(tenantId);
    // this.tenantId available (TenantId type)
    // this.log available with class name namespace AND tenantId metadata
  }

  someMethod() {
    // All logs automatically include tenantId
    this.log.info('Processing request'); // { namespace: 'MyService', tenantId: 'tenant-123', message: 'Processing request' }
  }
}
```

**DTO API:**

```typescript
const UserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  age: z.number().int().positive().optional()
});

class UserDTO extends DTO {
  constructor(data?: z.input<typeof UserSchema>) {
    super(UserSchema, data);
    // If config.DTO_AUTO_VALIDATE is true (default), validates automatically
    // Throws ValidationError if data is invalid
  }
}

// Usage in endpoint with Zod v4 JSON schema conversion
.input(z.object({
  body: UserSchema
}))
.response(zApiOutput(UserSchema))
.handler(async ({ body }) => {
  const user = new UserDTO(body); // Auto-validates by default (config.DTO_AUTO_VALIDATE)
  // Can also explicitly validate if auto-validation disabled
  // await user.validate();
  return apiResponse(user.toJSON());
})

// OpenAPI integration uses Zod v4 JSON schema conversion
// Custom glue code bridges Zod JSON schemas with @asteasolutions/zod-to-openapi
```

**Health API:**

```typescript
// Register liveness check (for /healthz)
health.registerHealthHook('app-alive', async () => {
  // Check if app is functioning
  return true;
});

// Register readiness check (for /readyz)
health.registerReadinessHook('database', async () => {
  await db.ping();
  return true;
});

// Unregister
health.unregisterHealthHook('app-alive');
health.unregisterReadinessHook('database');

// Manual checks
const isHealthy = await health.checkHealth(); // Returns boolean, only health hooks
const isReady = await health.checkReadiness(); // Returns boolean, health + readiness hooks
```

**Health Endpoints:**

- GET /healthz → 200 with apiResponse({healthy: true}) or 503 with apiResponse({healthy: false})
- GET /readyz → 200 with apiResponse({ready: true}) or 503 with apiResponse({ready: false})

**Database Model API:**

```typescript
interface Database {
  // Auto-generated from migrations
  users: {
    id: string;
    tenantId: string;
    name: string;
    email: string;
    createdAt: string;
    updatedAt: string;
  };
}

class BaseModel {
  id: string;
  createdAt: string;
  updatedAt: string;
}

class TenantScopedModel extends BaseModel {
  tenantId: string;

  // Query automatically filtered by tenantId
  static findByTenant(db: Kysely<Database>, tenantId: string) {
    return db.selectFrom('table').where('tenantId', '=', tenantId);
  }
}

// Usage
const db = getDb();
const user = await db
  .selectFrom('users')
  .where('tenantId', '=', tenantId)
  .where('email', '=', email)
  .selectAll()
  .executeTakeFirst();
```

**Query Builder API:**

```typescript
interface QueryParams<T> {
  filters?: Record<string, unknown[] | string[] | boolean | null>;
  search?: Record<string, unknown[] | string[] | boolean | null>;
  greaterThan?: Partial<T>;
  lessThan?: Partial<T>;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  extend?: string[];
}

// Usage
const params: QueryParams<User> = {
  filters: { role: ['admin', 'user'] },
  search: { name: 'john' },
  page: 1,
  limit: 20,
  sortBy: 'createdAt',
  sortDirection: 'desc',
};

const results = await buildQuery(db.selectFrom('users'), params).selectAll().execute();
```

**Redis API:**

```typescript
// Get or create cached client (app-name prefixed, NOT tenant-scoped)
const client = await Redis.getClient('session-store');
// Keys automatically prefixed: "antithesis:session-store:key"
await client.set('key', 'value', { EX: 3600 });
const value = await client.get('key'); // Retrieves "antithesis:session-store:key"

// Get tenant-scoped client (app-name AND tenant-id prefixed)
const tenantClient = await Redis.getTenantScopedClient(tenantId, 'cache');
// Keys automatically prefixed: "antithesis:tenant-123:cache:key"
await tenantClient.set('user-data', JSON.stringify(userData));

// Cleanup
await Redis.destroy(); // Disconnect all clients
```

**Migration API:**

```typescript
// src/db/migrations/001_create_users.ts
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>) {
  await db.schema
    .createTable('users')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('tenantId', 'uuid', (col) => col.notNull())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('email', 'text', (col) => col.notNull().unique())
    .addColumn('createdAt', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updatedAt', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema.createIndex('users_tenant_id_idx').on('users').column('tenantId').execute();
}

export async function down(db: Kysely<any>) {
  await db.schema.dropTable('users').execute();
}
```

### Alternatives Considered

| Option                            | Pros                              | Cons                                           | Why Not Chosen                                      |
| --------------------------------- | --------------------------------- | ---------------------------------------------- | --------------------------------------------------- |
| Keep class-validator              | Proven in Takaro, decorator-based | Additional dependency, less TS-native than Zod | Zod already integrated, better type inference       |
| Single /health endpoint           | Simpler                           | Doesn't distinguish liveness vs readiness      | Kubernetes best practice uses separate endpoints    |
| DTO as factory function           | Simpler, functional               | Less discoverable, no inheritance benefits     | Class-based matches Takaro patterns                 |
| Store tenant in AsyncLocalStorage | Implicit context                  | More magic, harder to trace                    | Explicit parameter more maintainable                |
| Use Objection.js (like Takaro)    | Proven in Takaro                  | Heavier, less type-safe than Kysely            | Kysely better TS experience, lighter weight         |
| TypeORM or Prisma                 | Popular, batteries-included       | Opinionated, migration complexity              | Kysely more flexible, better raw SQL control        |
| Per-tenant databases              | Complete isolation                | Complex deployment, harder migrations          | Single database with tenantId simpler for now       |
| ioredis instead of node-redis     | Feature-rich, cluster support     | Heavier API                                    | node-redis v4+ has modern API, sufficient for needs |

## Layer 3: Technical Specification

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   HTTP Application                       │
│  (src/lib/http/app.ts)                                  │
└────────────────┬────────────────────────────────────────┘
                 │
                 ├─────────────────────────────────────────┐
                 │                                         │
     ┌───────────▼──────────┐            ┌────────────────▼──────────┐
     │  Health Controller   │            │  Business Controllers      │
     │  /healthz, /readyz   │            │  (use DTOs + Tenant)       │
     └───────────┬──────────┘            └────────────┬───────────────┘
                 │                                     │
     ┌───────────▼──────────┐            ┌────────────▼───────────────┐
     │   Health Singleton   │            │   TenantScoped Service     │
     │  (manages hooks)     │            │   - Logger with namespace  │
     └───────┬───┬──────────┘            │   - TenantId context       │
             │   │                       └────────────┬───────────────┘
   ┌─────────┘   └────────┐                          │
   │                      │              ┌────────────▼───────────────┐
   │                      │              │    DTO Base Class          │
   │                      │              │  - Zod validation          │
   │                      │              │  - JSON serialization      │
   │                      │              └────────────────────────────┘
   │                      │                          │
   ▼                      ▼                          ▼
┌────────┐          ┌──────────┐         ┌──────────────────────┐
│Database│          │  Redis   │         │  Database Layer      │
│Health  │          │  Health  │         │  - Kysely DB         │
│Check   │          │  Check   │         │  - BaseModel         │
└────────┘          └──────────┘         │  - TenantScopedModel │
                                         │  - Query Builder     │
                                         │  - Migrations        │
                                         └──────────────────────┘
                                                    │
                          ┌─────────────────────────┼─────────────────────┐
                          ▼                         ▼                     ▼
                    ┌──────────┐            ┌────────────┐         ┌──────────┐
                    │PostgreSQL│            │   Redis    │         │  Config  │
                    │Container │            │  Container │         │ (env vars)│
                    └──────────┘            └────────────┘         └──────────┘
```

**Data Flow:**

1. Request → Health Controller → Health.check() → DB/Redis Health Hooks → Response
2. Request → Business Controller → DTO validates → TenantScoped Service → DB Query → Response
3. App Start → Config Load → DB Connection → Run Migrations → Register Health Checks
4. Service Init → Redis.getClient() → Cache Connection → Register Health Check

### Code Change Analysis

| Component                       | Action | Justification                                                                        |
| ------------------------------- | ------ | ------------------------------------------------------------------------------------ |
| src/lib/types.ts                | Create | TenantId branded type and isTenantId() guard for type safety                         |
| src/lib/TenantScoped.ts         | Create | Port from Takaro DomainScoped with TenantId type and auto-logging                    |
| src/lib/DTO.ts                  | Create | Port from Takaro TakaroDTO with Zod + config-based auto-validation                   |
| src/lib/health.ts               | Create | Separate health/readiness hook registries for K8s compatibility                      |
| src/lib/db/index.ts             | Create | Kysely database connection and initialization                                        |
| src/lib/db/BaseModel.ts         | Create | Base model with id, createdAt, updatedAt (Kysely version of TakaroModel)             |
| src/lib/db/TenantScopedModel.ts | Create | Model with automatic tenantId filtering                                              |
| src/lib/db/migrations.ts        | Create | Environment-aware migration runner (auto dev, manual prod)                           |
| src/lib/db/migrate-cli.ts       | Create | CLI script for manual production migrations                                          |
| src/lib/db/queryBuilder.ts      | Create | Query utilities with ILIKE search, pagination limits (default 20, max 100)           |
| src/lib/redis.ts                | Create | Redis with app-name prefixing and tenant-scoped variant                              |
| src/db/migrations/              | Create | Directory for database migration files                                               |
| src/controllers/health.ts       | Create | Controller for /healthz (health only) and /readyz (health + readiness)               |
| docker-compose.yml              | Create | PostgreSQL and Redis containers for dev environment                                  |
| src/lib/config.ts               | Extend | Add DB pool size, DTO_AUTO_VALIDATE, and Redis configuration                         |
| src/lib/http/index.ts           | Extend | Export DTO, TenantScoped, TenantId types for public API                              |
| src/index.ts                    | Extend | Initialize database, run migrations (dev only), register health/readiness checks     |
| package.json                    | Extend | Add Kysely, pg, redis, kysely-codegen dependencies and scripts (migrate, db:codegen) |

### Code to Remove

None - this is purely additive functionality. All existing code remains unchanged.

### Implementation Approach

#### Components

**src/lib/types.ts**

- TenantId branded type definition
- isTenantId() type guard function
- Example:

  ```
  type TenantId = string & { readonly __brand: 'TenantId' }

  function isTenantId(value: unknown): value is TenantId:
    return typeof value === 'string' && value.length > 0
  ```

**src/lib/TenantScoped.ts**

- Rename from DomainScoped to TenantScoped
- Constructor accepts TenantId branded type (not raw string)
- Protected log initialized with logger(className, { tenantId })
- Pattern: `this.log = logger(this.constructor.name, { tenantId: this.tenantId })`
- Example logic:
  ```
  class TenantScoped:
    constructor(tenantId: TenantId):
      this.tenantId = tenantId
      this.log = logger(this.constructor.name, { tenantId })
  ```

> **Decision**: TenantId is a branded type with type guard
> **Rationale**: Prevents accidental use of unvalidated strings as tenant IDs, reducing risk of data leakage
> **Alternative**: Plain string type was rejected due to lack of compile-time safety

**src/lib/DTO.ts**

- Base class for Data Transfer Objects
- Constructor accepts Zod schema and optional data
- Auto-validates if config.DTO_AUTO_VALIDATE is true (default)
- validate() method: parse data with schema, throw ValidationError on failure
- toJSON() method: return plain object representation
- fromJSON() static method: create instance from plain object
- Schema stored for OpenAPI generation using Zod v4 JSON schema conversion
- Custom glue code for @asteasolutions/zod-to-openapi integration
- Example logic:

  ```
  class DTO<T>:
    constructor(schema, data?):
      this.schema = schema
      if data:
        Object.assign(this, data)

      // Auto-validate if enabled
      if config.DTO_AUTO_VALIDATE:
        this.validate()

    validate():
      try:
        this.schema.parse(this)
      catch zodError:
        throw new ValidationError(zodError.message, zodError.issues)

    toJSON():
      return plain object of this

    getJsonSchema():
      // Use Zod v4 JSON schema conversion
      return this.schema.toJsonSchema()
  ```

> **Decision**: Config-controlled auto-validation, defaulting to true
> **Rationale**: Fail-fast by default prevents invalid DTOs from propagating, while config allows flexibility for testing
> **Alternative**: Always explicit validation was rejected as error-prone (can forget to call validate())

> **Decision**: Use Zod v4 JSON schema conversion for OpenAPI
> **Rationale**: Native Zod feature reduces dependencies on external library quirks
> **Alternative**: Direct @asteasolutions/zod-to-openapi was rejected due to limited Zod v4 support

**src/lib/health.ts**

- Separate registries for health (liveness) and readiness hooks
- Singleton instance exported
- registerHealthHook(name, hook) - stores health hook in healthHooks Map
- registerReadinessHook(name, hook) - stores readiness hook in readinessHooks Map
- unregisterHealthHook(name) - removes health hook
- unregisterReadinessHook(name) - removes readiness hook
- checkHealth() - executes only health hooks, returns true if all succeed
- checkReadiness() - executes both health AND readiness hooks, returns true if all succeed
- Example logic:

  ```
  class Health:
    healthHooks = new Map()      // For /healthz
    readinessHooks = new Map()   // For /readyz

    registerHealthHook(name, fn):
      healthHooks.set(name, fn)

    registerReadinessHook(name, fn):
      readinessHooks.set(name, fn)

    async checkHealth():
      results = await Promise.all(healthHooks.values().map(fn => fn()))
      return results.every(r => r === true)

    async checkReadiness():
      // Check both health AND readiness hooks
      allHooks = [...healthHooks.values(), ...readinessHooks.values()]
      results = await Promise.all(allHooks.map(fn => fn()))
      return results.every(r => r === true)
  ```

> **Decision**: Separate health and readiness hook registries
> **Rationale**: Follows Kubernetes best practices - liveness checks if app is alive, readiness checks if app can serve traffic
> **Alternative**: Single registry was rejected as it doesn't distinguish between app-alive vs ready-to-serve concerns

**src/controllers/health.ts**

- New controller with two endpoints
- GET /healthz - liveness probe (checks only health hooks)
- GET /readyz - readiness probe (checks both health AND readiness hooks)
- Uses apiResponse() wrapper for consistency
- Success: status 200
- Failure: status 503
- Hide from OpenAPI spec using .hideFromOpenAPI()
- Example logic:

  ```
  /healthz endpoint:
    isHealthy = await health.checkHealth()
    if isHealthy:
      res.status(200).send(apiResponse({healthy: true}))
    else:
      res.status(503).send(apiResponse({healthy: false}))

  /readyz endpoint:
    isReady = await health.checkReadiness()
    if isReady:
      res.status(200).send(apiResponse({ready: true}))
    else:
      res.status(503).send(apiResponse({ready: false}))
  ```

> **Decision**: Use apiResponse() wrapper for health endpoints
> **Rationale**: Consistency with all other API endpoints, includes meta.serverTime
> **Alternative**: Plain JSON response was rejected for lack of consistency

**src/lib/db/index.ts**

- Kysely database connection initialization
- Connection pooling with pg driver (configurable pool size)
- Export getDb() function for database access
- Read config from environment variables
- Example logic:

  ```
  let dbInstance: Kysely<Database>

  function getDb():
    if not dbInstance:
      dbInstance = new Kysely({
        dialect: new PostgresDialect({
          pool: new Pool({
            host: config.DB_HOST,
            port: config.DB_PORT,
            database: config.DB_NAME,
            user: config.DB_USER,
            password: config.DB_PASSWORD,
            max: config.DB_POOL_SIZE,            // Configurable (default: 10 dev, 20 prod)
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000
          })
        })
      })
    return dbInstance
  ```

> **Decision**: Configurable connection pool size with sane defaults
> **Rationale**: Different environments have different load requirements
> **Alternative**: Fixed pool size was rejected as inflexible

**src/lib/db/BaseModel.ts**

- TypeScript interfaces for base model fields
- Not an actual class (Kysely uses plain objects)
- Helper functions for timestamps
- Example structure:

  ```
  interface BaseModel:
    id: string
    createdAt: string
    updatedAt: string

  function withTimestamps(data):
    return {
      ...data,
      createdAt: now(),
      updatedAt: now()
    }
  ```

**src/lib/db/TenantScopedModel.ts**

- Helper function to apply tenant filtering
- Works with Kysely query builder
- Example logic:

  ```
  function withTenantScope<T>(query, tenantId):
    return query.where('tenantId', '=', tenantId)

  // Usage
  const query = db.selectFrom('users')
  const scopedQuery = withTenantScope(query, tenantId)
  ```

**src/lib/db/migrations.ts**

- Migrator using Kysely's migration system
- Reads migration files from src/db/migrations/
- Creates migrations table if not exists
- Environment-aware: auto-run in dev, manual in prod
- Kysely type generation with kysely-codegen
- Example logic:

  ```
  async function runMigrations(db):
    migrator = new Migrator({
      db,
      provider: new FileMigrationProvider({
        fs,
        path,
        migrationFolder: 'src/db/migrations'
      })
    })

    // Only auto-run in development
    if config.NODE_ENV === 'development':
      result = await migrator.migrateToLatest()
      if result.error:
        throw result.error

  // For production: npm script
  // package.json: "migrate": "tsx src/lib/db/migrate-cli.ts"
  ```

**package.json scripts**:

- `migrate`: Run migrations manually (for production)
- `db:codegen`: Generate Kysely types from database schema

> **Decision**: Environment-aware migration strategy
> **Rationale**: Auto-run in dev for convenience, manual in prod to prevent race conditions with multiple instances
> **Alternative**: Always auto-run was rejected as risky for production deployments

> **Decision**: Use kysely-codegen for type generation
> **Rationale**: Dramatically improves type safety and developer experience
> **Alternative**: Manual type maintenance was rejected as error-prone and time-consuming

**src/lib/db/queryBuilder.ts**

- Port from Takaro, adapted for Kysely
- QueryParams interface with Zod schema (instead of class-validator)
- buildQuery() function applies filters to Kysely query
- Supports filters, search (ILIKE), greaterThan, lessThan, pagination (default 20, max 100), sorting
- Example logic:

  ```
  function buildQuery<DB, TB>(query, params):
    // Apply pagination limits
    const limit = Math.min(params.limit ?? 20, 100)  // Default 20, max 100
    const page = params.page ?? 1

    if params.filters:
      for each filter in params.filters:
        query = query.where(column, 'in', values)

    if params.search:
      conditions = []
      for each field in params.search:
        // Use ILIKE for case-insensitive search
        conditions.push(sql`${ref(field)} ILIKE ${'%' + value + '%'}`)
      query = query.where(or(conditions))

    if params.greaterThan:
      query = query.where(column, '>', value)

    if params.lessThan:
      query = query.where(column, '<', value)

    if params.sortBy:
      query = query.orderBy(params.sortBy, params.sortDirection ?? 'asc')

    offset = (page - 1) * limit
    query = query.limit(limit).offset(offset)

    return query
  ```

> **Decision**: ILIKE for case-insensitive search, default 20/max 100 pagination
> **Rationale**: ILIKE is more user-friendly than case-sensitive LIKE, pagination limits protect performance
> **Alternative**: LIKE was rejected as less user-friendly, unlimited pagination rejected as dangerous

**src/lib/redis.ts**

- Port from Takaro with key namespacing enhancements
- RedisClass manages connection cache
- getClient(name, options) - NOT tenant-scoped, app-name prefix only
- getTenantScopedClient(tenantId, name, options) - app-name AND tenantId prefix
- Auto-registers health check for each client
- destroy() disconnects all clients
- Read config from environment variables
- Example logic:

  ```
  class RedisClass:
    clients = new Map()

    async getClient(name, options):
      // Keys prefixed with: app-name:client-name:key
      cacheKey = `global:${name}`
      if clients.has(cacheKey):
        return clients.get(cacheKey)

      client = createClient({
        username: config.REDIS_USERNAME,
        password: config.REDIS_PASSWORD,
        socket: {
          host: config.REDIS_HOST,
          port: config.REDIS_PORT
        },
        prefix: `${config.APP_NAME}:${name}:`,  // App name prefix
        ...options
      })

      await client.connect()
      clients.set(cacheKey, client)

      health.registerReadinessHook(`redis-${name}`, async () => {
        await client.ping()
        return true
      })

      return client

    async getTenantScopedClient(tenantId, name, options):
      // Keys prefixed with: app-name:tenantId:client-name:key
      cacheKey = `tenant:${tenantId}:${name}`
      if clients.has(cacheKey):
        return clients.get(cacheKey)

      client = createClient({
        username: config.REDIS_USERNAME,
        password: config.REDIS_PASSWORD,
        socket: {
          host: config.REDIS_HOST,
          port: config.REDIS_PORT
        },
        prefix: `${config.APP_NAME}:${tenantId}:${name}:`,  // App + tenant prefix
        ...options
      })

      await client.connect()
      clients.set(cacheKey, client)

      health.registerReadinessHook(`redis-${tenantId}-${name}`, async () => {
        await client.ping()
        return true
      })

      return client
  ```

> **Decision**: Two Redis client methods with different prefixing strategies
> **Rationale**: Prevents key collisions while supporting both global and tenant-scoped caching
> **Alternative**: Single method was rejected as it doesn't support non-tenant-scoped use cases

**docker-compose.yml**

- PostgreSQL 17 container
- Redis 7 container
- Persistent volumes for data
- Health checks for containers
- Network configuration
- Example structure:

  ```yaml
  services:
    postgres:
      image: postgres:17
      environment:
        POSTGRES_DB: antithesis
        POSTGRES_USER: antithesis
        POSTGRES_PASSWORD: antithesis
      ports:
        - '5432:5432'
      volumes:
        - postgres_data:/var/lib/postgresql/data
      healthcheck:
        test: pg_isready -U antithesis
        interval: 10s
        timeout: 5s
        retries: 5

    redis:
      image: redis:7-alpine
      ports:
        - '6379:6379'
      volumes:
        - redis_data:/data
      healthcheck:
        test: redis-cli ping
        interval: 10s
        timeout: 3s
        retries: 5

    app:
      depends_on:
        postgres:
          condition: service_healthy
        redis:
          condition: service_healthy
  ```

**Integration Test (src/lib/http/dto.test.ts)**

- Create test DTO with Zod schema (name, email, age)
- Register endpoint using DTO for input/output validation
- Verify OpenAPI spec includes detailed schema info
- Test validation errors return 422
- Test successful validation returns data

**Integration Test (src/lib/db/db.test.ts)**

- Test database connection
- Create test migration
- Run migration
- Insert tenant-scoped data
- Query with filters and pagination
- Verify tenant isolation

#### Data Models

**TenantScoped:**

```typescript
{
  tenantId: string; // readonly
  log: Logger; // protected
}
```

**DTO:**

```typescript
{
  schema: ZodSchema;       // private
  [key: string]: unknown;  // dynamic properties from schema
}
```

**Health:**

```typescript
{
  hooks: Map<string, () => Promise<boolean>>; // private
}
```

**Health Response:**

```typescript
{
  healthy: boolean; // or ready: boolean for /readyz
}
```

**Database Interface:**

```typescript
interface Database {
  [tableName: string]: {
    id: string;
    createdAt: string;
    updatedAt: string;
    // ... table-specific columns
  };
}
```

**QueryParams:**

```typescript
{
  filters?: Record<string, unknown[] | string[] | boolean | null>;
  search?: Record<string, unknown[] | string[] | boolean | null>;
  greaterThan?: Record<string, unknown>;
  lessThan?: Record<string, unknown>;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  extend?: string[];
}
```

**Redis Client Cache:**

```typescript
{
  clients: Map<string, RedisClientType>; // name -> client
}
```

#### Security

- Health endpoints expose no sensitive data (only boolean status)
- Validation errors follow existing HttpError pattern (src/lib/http/errors.ts:42-46)
- DTOs validate all inputs before processing
- No authentication required for health endpoints (standard practice)
- Database credentials in environment variables, never logged
- Redis credentials in environment variables, never logged
- Tenant isolation enforced at query level via tenantId filtering
- SQL injection prevented by Kysely's parameterized queries

### Testing Strategy

**Unit Tests:**

- TenantScoped: Constructor sets tenantId and logger namespace
- TenantScoped: Logger includes tenantId in metadata automatically
- TenantScoped: Test "tenant scoped service retains tenant info in logs and ctx"
- TenantId: isTenantId() guard validates correctly
- DTO: Validation succeeds with valid data, throws ValidationError with invalid data
- DTO: Auto-validation respects config.DTO_AUTO_VALIDATE setting
- DTO: toJSON/fromJSON round-trip preserves data
- Health: Separate health and readiness hook registration
- Health: checkHealth() returns true when all health hooks succeed
- Health: checkReadiness() returns true when all health + readiness hooks succeed
- Health: Health endpoints use apiResponse() wrapper
- Query Builder: Correctly applies filters, ILIKE search, pagination (20 default, 100 max), sorting
- Query Builder: Handles edge cases (empty filters, invalid sort fields)
- Redis: getClient() vs getTenantScopedClient() key prefixing

**Integration Tests:**

- Create endpoint with DTO for input/output
- Verify OpenAPI spec includes DTO schema details
- Test endpoint with valid DTO data
- Test endpoint with invalid DTO data (should return 422)
- Test health endpoints return correct status codes
- Test health endpoints with registered hooks
- Database: Connection, migrations, CRUD operations
- Database: Tenant isolation (cannot query other tenant's data)
- Redis: Connection caching, health check registration
- Query Builder: Integration with real database queries

**E2E Tests:**

- Start server with health controller
- Call /healthz, verify 200 response
- Register failing health check
- Call /healthz, verify 503 response
- Docker Compose: Start all services, verify connectivity
- Full workflow: Create tenant, insert data, query with filters, verify results

### Rollout Plan

**Phase 1: Docker & Config**

1. Create docker-compose.yml with PostgreSQL and Redis
2. Add database and Redis config to src/lib/config.ts with JSDoc documentation
3. Add dependencies: kysely, pg, redis, and types
4. Write unit tests for config validation (database/Redis settings)
5. Add JSDoc examples showing how to access config values
6. Verify Docker Compose starts all services
7. Run tests to verify config parsing works correctly

**Phase 2: Core Infrastructure**

1. Add TenantScoped class with JSDoc (description, usage example)
2. Add DTO base class with JSDoc (description, validation example, toJSON/fromJSON examples)
3. Add Health singleton and controller with JSDoc (hook registration, check examples)
4. Write unit tests for TenantScoped:
   - Constructor sets tenantId and logger
   - Logger namespace uses class name
5. Write unit tests for DTO:
   - Validation succeeds with valid data
   - Validation throws ValidationError with invalid data
   - toJSON/fromJSON round-trip
   - Zod schema integration
6. Write unit tests for Health:
   - Hook registration/unregistration
   - check() returns true when all succeed
   - check() returns false when any fail
   - Async hook execution
7. Add JSDoc examples for each class showing real-world usage
8. Run tests to verify 80%+ coverage for this phase

**Phase 3: Database Layer**

1. Create src/lib/db/index.ts with Kysely connection and JSDoc:
   - Document getDb() function with connection example
   - Document database initialization
2. Create src/lib/db/migrations.ts with JSDoc:
   - Document migration file structure
   - Provide example up/down functions
3. Create src/lib/db/BaseModel.ts and TenantScopedModel.ts with JSDoc:
   - Document model interfaces and helper functions
   - Provide query examples with tenant scoping
4. Create src/lib/db/queryBuilder.ts with JSDoc:
   - Document QueryParams interface fields
   - Provide filtering, pagination, sorting examples
5. Create example migration in src/db/migrations/
6. Write unit tests for query builder:
   - Filter application (in, equals)
   - Search with LIKE/ILIKE
   - Greater than/less than comparisons
   - Pagination offset/limit calculations
   - Sorting with direction
   - Edge cases (empty filters, null values)
7. Write integration tests for database:
   - Connection establishment
   - Migration execution
   - CRUD operations
   - Tenant isolation verification
8. Add JSDoc examples for all public database APIs
9. Run tests to verify 80%+ coverage for database layer

**Phase 4: Redis Layer**

1. Create src/lib/redis.ts with JSDoc:
   - Document RedisClass and getClient() method
   - Provide connection examples with options
   - Document destroy() cleanup method
2. Write unit tests for Redis manager:
   - Client caching (returns same instance)
   - Multiple clients with different names
   - Configuration merging
3. Write integration tests for Redis:
   - Connection establishment
   - Basic operations (get/set)
   - Health check registration
   - Client cleanup on destroy()
4. Add JSDoc examples showing:
   - Simple key-value storage
   - Expiration options
   - Multiple client usage
5. Run tests to verify 80%+ coverage for Redis layer

**Phase 5: Integration**

1. Initialize database in src/index.ts with error handling
2. Run migrations on app start
3. Register database and Redis health checks
4. Register health controller in main app
5. Export new classes from lib/http/index.ts with JSDoc re-exports
6. Write integration tests for DTO in endpoints:
   - Create endpoint with DTO input validation
   - Test valid DTO data (200 response)
   - Test invalid DTO data (422 validation error)
   - Verify OpenAPI spec includes DTO schema
7. Write integration tests for health endpoints:
   - /healthz with all checks passing (200)
   - /healthz with failing check (503)
   - /readyz endpoint
8. Write E2E test for full workflow:
   - Start server with Docker Compose
   - Database connection and migrations
   - Redis connection
   - Health endpoints responding
   - DTO validation in real HTTP requests
9. Verify all JSDoc is present for public APIs
10. Run full test suite to verify overall coverage

**Phase 6: Validation**

1. Run all existing tests (should pass)
2. Run new integration tests
3. Generate test coverage report, verify 80%+ overall coverage
4. Review all JSDoc documentation:
   - Every public class has description and example
   - Every public function has parameters, returns, and example
   - Examples demonstrate real-world usage
5. Test in Docker environment: docker compose up
6. Manually verify health endpoints return proper status
7. Verify database connection and migrations ran
8. Verify Redis connection works
9. Verify OpenAPI spec at /openapi.json includes DTO details
10. Run linter to ensure JSDoc formatting is correct
11. Generate API documentation from JSDoc (if tooling available)

**Rollback Strategy:**

- All changes are additive - simply don't use new classes
- Remove health controller from app registration if issues occur
- Stop Docker containers if database/Redis causing issues
- Migrations are versioned - can rollback via down() functions
- No breaking changes to existing code
