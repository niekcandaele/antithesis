# Design: Tenant-Aware CRUD Skeleton

## Layer 1: Problem & Requirements

### Problem Statement

The application needs a robust, developer-friendly tenant-aware data isolation system where multi-tenancy is enforced automatically at the database layer. Currently, developers must manually add tenant scoping to every query, which is error-prone and can lead to data leaks across tenants. The system needs a reference implementation (Albums & Photos CRUD with parent-child relationship) that demonstrates the pattern for future features.

### Current State

**Authentication & Tenant Resolution:**

- Keycloak OIDC authentication extracts user organizations from UserInfo endpoint (src/services/auth.service.ts:119-120)
- Session stores `currentTenantId` (src/lib/http/middleware/auth.middleware.ts:9)
- No automatic tenant injection into server context
- Tenant resolution happens at auth callback but isn't propagated to request context

**Database Layer:**

- Kysely query builder with PostgreSQL (src/lib/db/index.ts)
- Manual tenant scoping via `withTenantScope()` helper (src/lib/db/TenantScopedModel.ts:48-54)
- Repository pattern with standard CRUD operations
- No automatic tenant filtering - must be called explicitly

**Pain Points:**

1. Developers must remember to call `withTenantScope()` on every query
2. No compile-time guarantees that tenant scoping is applied
3. Tenant context not available in AsyncLocalStorage (ServerContext only has `oas`)
4. Easy to accidentally query across all tenants

### Requirements

#### Functional

- REQ-001: The system SHALL automatically inject tenantId into SELECT queries without developer intervention
- REQ-002: The system SHALL automatically inject tenantId into INSERT operations without developer intervention
- REQ-003: WHEN a user authenticates THEN their active tenantId SHALL be resolved from JWT claims (primary) or session (fallback) and stored in server context
- REQ-004: The system SHALL provide Albums and Photos entities with parent-child relationship, including name/title, description, status, creator, and soft delete fields as realistic reference implementation
- REQ-005: The system SHALL provide a frontend UI for Albums & Photos CRUD operations with tenant selector for multi-org users
- REQ-006: The system SHALL prevent cross-tenant data access at the database query level
- REQ-007: WHEN no tenant context is available for a tenant-scoped method THEN the system SHALL throw 400 Bad Request with clear error message
- REQ-008: The system SHALL support Playwright E2E tests verifying tenant isolation with helper utilities for Keycloak user/org management
- REQ-009: WHEN a user is not part of any tenant THEN the system SHALL automatically create a tenant for that user
- REQ-010: The system SHALL provide `NOT_TENANT_SCOPED_` prefixed methods for admin/global operations that explicitly bypass tenant filtering
- REQ-011: WHEN a user switches tenants THEN the system SHALL validate the user belongs to the target tenant before allowing the switch

#### Non-Functional

- **Performance**: Tenant scoping adds <5ms latency per query (no explicit monitoring for this phase)
- **Security**: Zero-trust - all queries scoped by default, explicit opt-out required via `NOT_TENANT_SCOPED_` prefix
- **Usability**: Developers write standard queries without tenant awareness for normal operations
- **Testability**: Tenant context can be mocked in tests; E2E tests use programmatic Keycloak setup with helper utilities

### Constraints

- Must work with existing Kysely query builder
- Must preserve AsyncLocalStorage-based request context pattern
- Cannot break existing controllers and repositories
- Must support multi-organization users (user belongs to multiple tenants)
- Playwright not currently installed - will need setup

### Success Criteria

1. Albums & Photos CRUD works with automatic tenant scoping including status, creator, soft delete, and parent-child relationships
2. E2E tests verify tenant A cannot access tenant B's albums or photos using Keycloak helper utilities
3. Developer writes zero tenant-specific code in new feature repositories (except `NOT_TENANT_SCOPED_` methods)
4. All SELECT/INSERT/UPDATE/DELETE queries automatically scoped with composite indexes for performance
5. Clear 400 error when tenant context missing for scoped methods
6. Users without tenants automatically get a tenant created
7. Tenant switching validates user membership before allowing switch
8. Hybrid JWT/session-based tenant resolution works for web and API clients

## Layer 2: Functional Specification

### User Workflows

#### 1. **Developer Creates New Tenant-Aware Feature**

- Developer creates repository extending TenantAwareRepository base class
- Developer writes standard Kysely queries (SELECT, INSERT, UPDATE)
- System automatically injects tenantId filter/value
- No manual tenant scoping required

#### 2. **User Manages Albums and Photos (Reference Implementation)**

- User navigates to /albums → System loads albums for their active tenant only
- User creates album → System auto-fills tenantId from context
- User views album → System verifies album belongs to their tenant
- User adds photos to album → Both album and photos are tenant-scoped
- User in tenant A cannot see/edit albums or photos from tenant B

#### 3. **Multi-Tenant User Switches Context**

- User with multiple organization memberships sees tenant selector in navigation
- User selects tenant from dropdown showing all their valid tenants
- System validates user belongs to target tenant before switch
- System updates session.currentTenantId on successful validation
- Subsequent requests use new tenant context
- All queries automatically scope to new tenant

#### 4. **New User Without Tenant Gets Auto-Provisioned**

- User completes Keycloak authentication
- System detects user has no organization memberships
- System automatically creates new tenant for user
- User is assigned to newly created tenant
- User can immediately start using the application

### External Interfaces

**API Endpoints:**

```
# Albums
GET    /albums              - List albums for active tenant
GET    /albums/:id          - Get single album (tenant-scoped)
POST   /albums              - Create album (auto-inject tenantId)
PUT    /albums/:id          - Update album (verify tenant ownership)
DELETE /albums/:id          - Delete album (verify tenant ownership)

# Photos (nested under albums)
GET    /albums/:albumId/photos     - List photos in album (tenant-scoped)
GET    /photos/:id                 - Get single photo (tenant-scoped)
POST   /albums/:albumId/photos     - Add photo to album (auto-inject tenantId & albumId)
PUT    /photos/:id                 - Update photo (verify tenant ownership)
DELETE /photos/:id                 - Delete photo (verify tenant ownership)
```

**Request Flow:**

```
Request → Auth Middleware → Tenant Resolution (JWT/Session Hybrid) → Server Context (AsyncLocalStorage)
                                                                               ↓
                                                                    Repository Query → Auto-scoped
```

**Tenant Switch Endpoint:**

```
POST /api/tenant/switch
Body: { tenantId: "uuid" }
Validation: Verify user belongs to target tenant
Response: 200 OK or 403 Forbidden
```

**Frontend (EJS + DaisyUI):**

- Albums list page with grid/card view (including cover photos, status badges, photo count)
- Album detail page showing photos in grid layout
- Photo upload and management within album
- Create/Edit forms for albums and photos
- Delete confirmation dialog (soft delete for both)
- Inline validation with Zod schemas
- Tenant selector in navigation bar for multi-org users
- Display of current tenant name

### Alternatives Considered

| Option                                      | Pros                                                 | Cons                                                     | Why Not Chosen                                        |
| ------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------- |
| **Row-Level Security (RLS)**                | Database-enforced, foolproof                         | Requires PostgreSQL setup, harder to test, opaque errors | Too complex for initial implementation, can add later |
| **Query Wrapper Functions**                 | Simple wrapper around queries                        | Still requires developer to remember, not automatic      | Doesn't meet "deep baked-in" requirement              |
| **Kysely Plugin System**                    | Powerful, flexible                                   | Complex to implement, unfamiliar pattern                 | Over-engineered for current needs                     |
| **Tenant-Aware Base Repository** (Selected) | Familiar OOP pattern, TypeScript-friendly, automatic | Requires inheritance, slight boilerplate                 | Best balance of safety and simplicity                 |
| **Proxy-based Query Interception**          | Truly transparent                                    | Hard to debug, magic behavior                            | Too implicit, fails fail-fast principle               |

## Layer 3: Technical Specification

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Request                              │
└────────────────────────────┬────────────────────────────────┘
                             ↓
                   ┌─────────────────────┐
                   │  Auth Middleware    │
                   │  - populateUser     │
                   └─────────┬───────────┘
                             ↓
                   ┌─────────────────────┐
                   │ Tenant Resolution   │  ← NEW
                   │ - Extract from      │
                   │   Keycloak org      │
                   │ - Set in context    │
                   └─────────┬───────────┘
                             ↓
                   ┌─────────────────────┐
                   │  Server Context     │  ← EXTENDED
                   │  AsyncLocalStorage  │
                   │  + tenantId         │
                   └─────────┬───────────┘
                             ↓
                   ┌─────────────────────┐
                   │    Controller       │
                   │  (tenant-agnostic)  │
                   └─────────┬───────────┘
                             ↓
                   ┌─────────────────────┐
                   │  TenantAwareRepo    │  ← NEW BASE CLASS
                   │  - Auto-injects     │
                   │    tenant filters   │
                   └─────────┬───────────┘
                             ↓
                   ┌─────────────────────┐
                   │   Kysely Query      │
                   │   + WHERE tenant=X  │
                   │   + VALUES(tenant)  │
                   └─────────────────────┘
```

**Data Flow:**

1. Request hits auth middleware → user loaded
2. Tenant resolution middleware → active tenantId from user's organizations
3. Context set via AsyncLocalStorage → available to all downstream code
4. Repository operations → automatically inject tenant from context
5. Database queries → all scoped to single tenant

### Code Change Analysis

| Component                                               | Action | Justification                                                                                                  |
| ------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------- |
| **ServerContext** (src/lib/http/serverContext.ts)       | Extend | Add `tenantId` field to context interface, existing AsyncLocalStorage pattern supports this                    |
| **TenantResolutionMiddleware** (new)                    | Create | Required to extract tenantId from session/user and inject into context                                         |
| **TenantAwareRepository** (new)                         | Create | Base class for automatic tenant scoping - no existing equivalent                                               |
| **AlbumsRepository** (new)                              | Create | Reference implementation showing tenant-aware pattern for parent entity                                        |
| **PhotosRepository** (new)                              | Create | Reference implementation showing tenant-aware pattern for child entity                                         |
| **AlbumsService** (new)                                 | Create | Business logic for albums CRUD                                                                                 |
| **PhotosService** (new)                                 | Create | Business logic for photos CRUD                                                                                 |
| **AlbumsController** (new)                              | Create | REST endpoints for albums, follows existing controller pattern at src/controllers/tenants/tenant.controller.ts |
| **PhotosController** (new)                              | Create | REST endpoints for photos including nested routes                                                              |
| **Albums Migration** (new)                              | Create | Database schema for albums with tenantId column                                                                |
| **Photos Migration** (new)                              | Create | Database schema for photos with tenantId and albumId columns                                                   |
| **Albums & Photos Frontend** (new)                      | Create | EJS views following pattern at views/pages/dashboard.ejs                                                       |
| **Playwright Setup** (new)                              | Create | E2E test infrastructure - not currently present                                                                |
| **withTenantScope()** (src/lib/db/TenantScopedModel.ts) | Remove | Obsolete - replaced by automatic scoping in base repository                                                    |

### Code to Remove

- **withTenantScope() function** (src/lib/db/TenantScopedModel.ts:48-54)
  - Why obsolete: Manual scoping replaced by automatic base repository
  - What replaces it: TenantAwareRepository handles scoping internally
  - Migration path: Existing usages (currently none) would inherit from TenantAwareRepository instead

### Implementation Approach

#### Components

**1. Extended ServerContext** (src/lib/http/serverContext.ts:7-9)

- Current role: Holds OAS spec for request context
- Planned changes: Add optional `tenantId` field
- Integration: Extends existing interface without breaking changes
- Logic:
  ```
  interface ServerContext {
    oas: Oas;
    tenantId?: string;  // Added - undefined when not authenticated
  }
  ```

**2. TenantResolutionMiddleware** (src/lib/http/middleware/tenantResolution.middleware.ts - new file)

- Role: Extract active tenantId and inject into context using hybrid JWT/session approach
- Runs after: `populateUser` middleware (src/lib/http/middleware/auth.middleware.ts:28)
- Logic:

  ```
  // Primary: Check JWT claims for tenant context (for API clients)
  if Authorization header present:
    parse JWT token
    extract tenant claim (e.g., 'organization_id' or 'tenant_id')
    if found, use as tenantId

  // Fallback: Check session (for web UI)
  if no JWT tenantId and session exists:
    tenantId = session.currentTenantId

  // Auto-provision for new users
  if no tenantId and user has no organizations:
    create new tenant for user
    assign user to tenant
    save tenantId to session

  // Default selection for multi-org users
  if no tenantId and user has organizations:
    tenantId = session.lastUsedTenantId || first organization
    save to session.currentTenantId

  // Inject into context
  if tenantId exists:
    update server context via contextManager
  ```

> **Decision**: Hybrid JWT/Session Tenant Resolution
> **Rationale**: Supports both stateless API clients (JWT) and stateful web UI (session). JWT checked first for API flexibility, session fallback for web simplicity.
> **Alternative**: Session-only would limit API usage; JWT-only would complicate web UI session management.

**3. TenantAwareRepository Base Class** (src/lib/db/TenantAwareRepository.ts - new file)

- Role: Provide automatic tenant scoping for all query operations with explicit opt-out
- Extends: Current repository pattern from src/db/tenant.repository.ts
- Key methods:
  - `scopedQuery()` - wraps Kysely query with tenant filter
  - `findAll()`, `findById()`, `create()`, `update()`, `delete()` - all auto-scoped
  - `NOT_TENANT_SCOPED_findAll()`, `NOT_TENANT_SCOPED_*` - admin methods that bypass scoping
- Integration: Child repos call `super` methods or use `this.scopedQuery()`
- Logic:

  ```
  protected getTenantId():
    context = getServerContext()
    if no context.tenantId:
      throw BadRequestError(400, "Tenant context required for this operation")
    return context.tenantId

  protected scopedQuery(query):
    tenantId = getTenantId()
    return query.where('tenantId', '=', tenantId)

  async create(data):
    tenantId = getTenantId()
    return db.insert({ ...data, tenantId })

  // Explicit global access - name makes intent clear
  async NOT_TENANT_SCOPED_findAll(params):
    // No tenant filtering - returns data across all tenants
    return db.selectFrom(table).selectAll().execute()
  ```

> **Decision**: Abstract Base Class with Explicit Opt-Out
> **Rationale**: Inheritance provides clear pattern for developers. `NOT_TENANT_SCOPED_` prefix makes global access explicit and searchable in codebase.
> **Alternative**: Composition would add DI boilerplate; Kysely plugin would be harder to debug and understand.

**4. Albums & Photos Feature** (src/db/albums.repository.ts, src/db/photos.repository.ts, services, controllers - new files)

- Database migrations:

  ```sql
  -- Albums table (parent)
  CREATE TABLE albums (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    cover_photo_url TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'draft',  -- draft, published, archived
    created_by_user_id UUID NOT NULL REFERENCES users(id),
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    deleted_at TIMESTAMP NULL,
    deleted_by_user_id UUID NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );
  CREATE INDEX idx_albums_tenant_created ON albums(tenant_id, created_at DESC);
  CREATE INDEX idx_albums_tenant_name ON albums(tenant_id, name);
  CREATE INDEX idx_albums_tenant_active ON albums(tenant_id, is_deleted) WHERE is_deleted = false;

  -- Photos table (child of albums)
  CREATE TABLE photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    album_id UUID NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    url TEXT NOT NULL,
    thumbnail_url TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    created_by_user_id UUID NOT NULL REFERENCES users(id),
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    deleted_at TIMESTAMP NULL,
    deleted_by_user_id UUID NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );
  CREATE INDEX idx_photos_tenant_album ON photos(tenant_id, album_id);
  CREATE INDEX idx_photos_tenant_created ON photos(tenant_id, created_at DESC);
  CREATE INDEX idx_photos_album ON photos(album_id);
  ```

- Repositories: Both extend TenantAwareRepository, no custom scoping needed
- Services: Standard business logic with soft delete, follows src/services/tenant.service.ts pattern
- Controllers: REST API with nested routes for photos under albums

> **Decision**: Albums & Photos Parent-Child Model
> **Rationale**: Demonstrates both entities needing tenant scoping, parent-child relationships, and realistic file handling patterns. Shows FK constraints with tenant awareness.
> **Alternative**: Single Topics entity would be simpler but less valuable for demonstrating complex relationships.

**5. Frontend UI** (views/pages/albums.ejs, views/pages/album-detail.ejs, views/pages/album-form.ejs - new files)

- Albums list page: Grid/card view with DaisyUI styling (reference: views/pages/dashboard.ejs)
- Album detail page: Shows photos in grid layout
- CRUD forms: Create/edit for albums and photos
- Pattern: Server-rendered EJS with progressive enhancement
- Logic:
  ```
  GET /albums → render albums list
  GET /albums/:id → render album detail with photos
  POST /albums → server validation → redirect
  PUT /albums/:id → server validation → redirect
  DELETE /albums/:id → confirmation → redirect
  POST /albums/:albumId/photos → upload photo → redirect
  ```

**6. Playwright Test Suite & Keycloak Test Helpers** (tests/e2e/\*, tests/helpers/keycloak.ts - new files)

- Setup:
  - Install @playwright/test, configure for Express app
  - Add ephemeral Keycloak container to docker-compose (testcontainers pattern)
  - Environment variables: KEYCLOAK_URL, KEYCLOAK_ADMIN_USER, KEYCLOAK_ADMIN_PASSWORD
- Keycloak Helper Library (tests/helpers/keycloak.ts):
  - `createUser(email, password)` - Create test user in Keycloak
  - `createOrganization(name)` - Create test organization
  - `assignUserToOrg(userId, orgId)` - Assign user to organization
  - `removeUserFromOrg(userId, orgId)` - Remove user from organization
  - `loginAs(email, password)` - Authenticate as user and return session cookie
  - `cleanup()` - Delete test users/orgs after tests
- Test scenarios:
  1. Tenant isolation: User A creates album → appears in their list, not visible to User B
  2. Cross-tenant access: User A cannot access User B's album or photos by direct ID (404)
  3. Parent-child isolation: User A cannot add photos to User B's album
  4. Soft delete: Deleted albums/photos don't appear in list but can be restored
  5. Status workflow: Albums and photos can transition draft → published → archived
  6. Cascade behavior: Deleting album affects associated photos (depending on implementation)
  7. Multi-org user: User in multiple orgs can switch and see different albums/photos
  8. New user provisioning: User without org gets auto-created tenant
  9. Tenant switch validation: User cannot switch to tenant they don't belong to
- Pattern: Use helper library to setup test users/orgs, authenticate, perform actions, verify isolation

> **Decision**: Programmatic Keycloak Test Setup with Helper Library
> **Rationale**: Provides flexibility for both tenant isolation tests and functional tests. Helper functions reduce boilerplate and improve test readability.
> **Alternative**: Seed data approach would be faster but less flexible; manual setup would be brittle and hard to maintain.

#### Data Models

**Albums Table Schema:**

```typescript
interface Albums {
  id: string; // UUID primary key
  tenantId: string; // FK to tenants - CRITICAL for isolation
  name: string; // Album name (max 255 chars)
  description: string | null; // Optional description
  coverPhotoUrl: string | null; // URL to cover photo
  status: 'draft' | 'published' | 'archived'; // Status enum
  createdByUserId: string; // FK to users - who created this
  isDeleted: boolean; // Soft delete flag
  deletedAt: string | null; // When was it deleted
  deletedByUserId: string | null; // Who deleted it
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}
```

**Photos Table Schema:**

```typescript
interface Photos {
  id: string; // UUID primary key
  tenantId: string; // FK to tenants - CRITICAL for isolation
  albumId: string; // FK to albums - parent relationship
  title: string; // Photo title (max 255 chars)
  description: string | null; // Optional description
  url: string; // Photo URL (required)
  thumbnailUrl: string | null; // Thumbnail URL
  status: 'draft' | 'published' | 'archived'; // Status enum
  createdByUserId: string; // FK to users - who created this
  isDeleted: boolean; // Soft delete flag
  deletedAt: string | null; // When was it deleted
  deletedByUserId: string | null; // Who deleted it
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}
```

**ServerContext Extension:**

```typescript
interface ServerContext {
  oas: Oas;
  tenantId?: string; // Added - undefined when unauthenticated
}
```

**Migration Notes:**

- Add `tenant_id` column to both albums and photos tables with NOT NULL constraint
- Create composite indexes for common query patterns:
  - Albums: `(tenant_id, created_at DESC)` for list views, `(tenant_id, name)` for search
  - Photos: `(tenant_id, album_id)` for album photos, `(tenant_id, created_at DESC)` for recent photos
  - Both: `(tenant_id, is_deleted)` for filtering active/deleted items
- FK constraints ensure referential integrity with tenants, users, and albums tables
- ON DELETE CASCADE for photos when album is deleted (configurable)

> **Decision**: Composite Indexes on Tenant + Query Columns
> **Rationale**: List queries always filter by tenant and sort/filter by other columns. Composite indexes optimize these common patterns.
> **Alternative**: Single-column indexes would require index merging which is less efficient.

#### Security

**Authentication Flow:**

1. Keycloak OIDC callback extracts organizations (src/services/auth.service.ts:119)
2. User record stores association via user_tenants join table
3. If user has no organizations, auto-create tenant and assign user
4. Session tracks active `currentTenantId` for multi-org users
5. Tenant resolution middleware validates tenantId exists in user's organizations

**Tenant Switching:**

1. User requests tenant switch via POST /api/tenant/switch
2. System queries user's valid tenant memberships
3. Validate target tenantId is in user's tenant list
4. If valid: Update session.currentTenantId and return 200
5. If invalid: Return 403 Forbidden with error message

**Tenant Isolation:**

- Database level: All queries filtered by tenantId automatically
- Application level: Base repository enforces scoping before query execution
- Fail-safe: Missing tenant context throws error, prevents unscoped queries
- Audit: Log all tenant context switches for security monitoring

**Validation:**

- Zod schemas validate input data structure
- Service layer validates tenant ownership before updates/deletes
- Repository layer ensures tenantId present in context
- No client-side tenant selection - server-authoritative

### Testing Strategy

**Unit Tests:**

- TenantAwareRepository: Mock context, verify query scoping
- Albums repository: Test CRUD with different tenant contexts
- Photos repository: Test CRUD with different tenant contexts, verify album relationship
- Tenant resolution middleware: Test context injection
- Test helpers: `withTenantContext()` utility for mocking (src/lib/db/test-helpers.ts)

**Integration Tests:**

- Full request cycle: auth → context → query → response
- Multi-tenant scenarios: Create data in tenant A, verify isolation from tenant B
- Error cases: Missing context, invalid tenantId, cross-tenant access
- Pattern: Use Testcontainers for PostgreSQL (already in use - src/integration/auth.integration.test.ts)

**E2E Tests (Playwright):**

- **Setup**: Ephemeral Keycloak container, helper library for user/org management
- **Test Infrastructure**:
  - Keycloak helper functions: createUser, createOrganization, assignUserToOrg, loginAs
  - Before each test: Create test users and organizations programmatically
  - After each test: Cleanup test data via helper cleanup()
- **Tenant Isolation Tests**:
  1. Create albums as User A (Tenant 1) → Verify appears in User A's list
  2. Create albums as User B (Tenant 2) → Verify NOT visible to User A
  3. Attempt cross-tenant access: User A tries to GET User B's album by ID → 404
  4. Parent-child isolation: User A cannot add photos to User B's album → 403
  5. Update/Delete: User A cannot modify User B's albums or photos → 403 or 404
- **Functional Tests**: 6. Soft delete: Delete album/photo → disappears from list, can be restored 7. Status workflow: Create draft → publish → archive transitions for both entities 8. Creator tracking: Albums and photos show correct created_by_user_id 9. Parent-child relationship: Photos belong to correct album, cascade behavior works
- **Multi-Org Tests**: 10. User in multiple orgs can switch tenants and see different albums/photos 11. New user without org gets auto-created tenant 12. Tenant switch validation: Cannot switch to unauthorized tenant → 403
- **Critical Paths**: Login → Create Album → Add Photos → List → Edit → Status Change → Soft Delete → Restore

### Rollout Plan

**Phase 1: Foundation (Core Infrastructure)**

- Extend ServerContext with tenantId
- Implement tenant resolution middleware
- Create TenantAwareRepository base class
- Add to main middleware chain

**Phase 2: Reference Implementation (Albums & Photos)**

- Albums database migration
- Photos database migration
- Albums & Photos repositories/services/controllers
- Frontend UI for Albums & Photos CRUD
- Manual testing of tenant isolation and parent-child relationships

**Phase 3: E2E Testing**

- Playwright setup and configuration
- Tenant isolation test suite
- CI/CD integration

**Phase 4: Documentation & Migration**

- Update developer guide with tenant-aware patterns
- Document base repository usage
- Provide migration examples for existing features
- Mark `withTenantScope()` as deprecated

**Rollback Strategy:**

- Phase 1-2: Feature flag `ENABLE_AUTO_TENANT_SCOPING` (default: true)
- If issues: Disable flag, fall back to manual scoping
- Database migrations: Reversible with down migrations
- No data loss: tenantId column added as nullable initially, backfilled, then NOT NULL

**Monitoring:**

- Log tenant context resolution (info level)
- Alert on tenant context errors (error level)
- Track cross-tenant access attempts (security level)
- No explicit performance metrics for this phase (per feedback)

---

## Decision Records

### DR-001: Hybrid JWT/Session Tenant Resolution

**Context**: Need to support both web UI (session-based) and API clients (stateless)
**Decision**: Check JWT claims first, fall back to session
**Rationale**: Provides flexibility for future API clients while keeping web UI simple
**Status**: Accepted

### DR-002: Abstract Base Class for Tenant Scoping

**Context**: Multiple approaches to enforce tenant scoping automatically
**Decision**: Use abstract base class (TenantAwareRepository) with inheritance
**Rationale**: Clear pattern, TypeScript-friendly, familiar to developers
**Alternatives Rejected**: Composition (too much boilerplate), Kysely plugin (harder to debug)
**Status**: Accepted

### DR-003: NOT*TENANT_SCOPED* Prefix for Global Methods

**Context**: Need escape hatch for admin operations without breaking isolation
**Decision**: Explicit method prefix `NOT_TENANT_SCOPED_` for methods that bypass filtering
**Rationale**: Makes global access explicit, searchable, and obvious in code review
**Example**: `NOT_TENANT_SCOPED_findAll()` vs `findAll()`
**Status**: Accepted

### DR-004: Albums & Photos Parent-Child Model

**Context**: Need reference implementation for future features
**Decision**: Use Albums & Photos with parent-child relationship instead of single Topics entity
**Rationale**: Demonstrates both entities needing tenant scoping, parent-child relationships, FK constraints with tenant awareness, and file handling patterns. Better learning example than single entity.
**Trade-off**: More implementation work, but significantly higher value as reference for complex relationships
**Status**: Accepted

### DR-005: Composite Database Indexes

**Context**: List queries filter by tenant and sort/search by other columns
**Decision**: Create composite indexes: (tenant_id, created_at), (tenant_id, title), etc.
**Rationale**: Optimizes common query patterns; single-column indexes less efficient
**Status**: Accepted

### DR-006: Programmatic Keycloak Test Setup

**Context**: E2E tests need flexible tenant/user creation and isolation
**Decision**: Build helper library for Keycloak management, use ephemeral container
**Rationale**: Flexibility for both isolation and functional tests; reduces test boilerplate
**Alternatives Rejected**: Seed data (inflexible), manual setup (brittle)
**Status**: Accepted

### DR-007: Auto-Provision Tenant for New Users

**Context**: Users without organization memberships need somewhere to start
**Decision**: Automatically create tenant when user has no organizations
**Rationale**: Smooth onboarding; users can start immediately without admin intervention
**Status**: Accepted

### DR-008: Validated Tenant Switching

**Context**: Session tampering could allow unauthorized tenant access
**Decision**: Validate user belongs to target tenant before allowing switch
**Rationale**: Prevents privilege escalation; critical security control
**Implementation**: Query user's tenant memberships, verify target is in list
**Status**: Accepted

### DR-009: 400 Error for Missing Tenant Context

**Context**: Missing tenant context should fail clearly
**Decision**: Throw BadRequestError (400) when scoped method called without context
**Rationale**: Client error (not server error); indicates API misuse or auth issue
**Message**: "Tenant context required for this operation"
**Status**: Accepted

### DR-010: No Performance Monitoring for This Phase

**Context**: Design mentioned <5ms latency target
**Decision**: No explicit performance metrics for initial implementation
**Rationale**: Focus on correctness first; can add monitoring in future phase
**Status**: Accepted
