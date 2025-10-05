# Implementation Tasks: Tenant-Aware CRUD Skeleton

## Overview

We're building an automatic tenant isolation system where multi-tenancy is enforced at the database layer without requiring developers to manually add tenant scoping to queries. The implementation uses:

- AsyncLocalStorage-based context to track active tenant
- Abstract base repository that auto-injects tenant filters
- Albums & Photos CRUD as a realistic reference implementation with parent-child relationships, status, creator tracking, and soft delete
- Playwright E2E tests with Keycloak helper utilities

**Phases**: 6 phases progressing from core infrastructure → reference implementation → testing → cleanup

- Each phase builds incrementally and ends with something demonstrable
- Obsolete code removed as we go, not at the end

---

## Phase 1: Core Tenant Context Infrastructure

**Goal**: Extend ServerContext with tenantId and create basic middleware to inject it
**Demo**: "At standup, I can show: Server context contains tenantId from session, accessible in any request handler"

### Tasks

- [ ] Task 1.1: Extend ServerContext interface with tenantId
  - **Output**: ServerContext interface updated
  - **Files**: `src/lib/http/serverContext.ts`
  - **Changes**: Add `tenantId?: string` field to interface (line ~8)
  - **Verify**: TypeScript compiles, no errors

- [ ] Task 1.2: Create tenant resolution middleware (session-only for Phase 1)
  - **Depends on**: 1.1
  - **Output**: Middleware that reads session.currentTenantId and sets context
  - **Files**: `src/lib/http/middleware/tenantResolution.middleware.ts` (new)
  - **Logic**:
    - If session.currentTenantId exists → inject into ServerContext
    - Otherwise → leave context.tenantId as undefined
    - Use contextManager pattern from serverContext.ts
  - **Verify**: Middleware exports correctly

- [ ] Task 1.3: Update session types to include tenant fields
  - **Depends on**: 1.2
  - **Output**: Session interface extended
  - **Files**: `src/lib/http/middleware/auth.middleware.ts`
  - **Changes**: Add `lastUsedTenantId?: string` to SessionData interface (already has currentTenantId)
  - **Verify**: TypeScript compiles

- [ ] Task 1.4: Wire tenant resolution into middleware chain
  - **Depends on**: 1.2, 1.3
  - **Output**: Tenant resolution runs after populateUser
  - **Files**: `src/index.ts` (or wherever middleware chain is configured)
  - **Changes**: Add tenantResolutionMiddleware after populateUser
  - **Verify**: App starts, no errors in logs

- [ ] Task 1.5: Add helper to update server context with tenantId
  - **Depends on**: 1.1
  - **Output**: Utility function to set tenantId in context
  - **Files**: `src/lib/http/serverContext.ts`
  - **Changes**: Add `setTenantId(tenantId: string)` function using contextManager
  - **Verify**: Function exported and typed correctly

### Phase 1 Checkpoint

- [ ] Run lint: `npm run lint` (or `npm run format && npm run lint`)
- [ ] Run build: `npm run build`
- [ ] Run tests: `npm test`
- [ ] Manual verification:
  - Start app with `npm run dev`
  - Log into app, check that context has tenantId from session
  - Add temporary log in a controller to print `getServerContext().tenantId`
- [ ] **Demo ready**: "Server context stores and provides tenantId from user session"

---

## Phase 2: TenantAwareRepository Base Class

**Goal**: Create abstract repository that automatically scopes queries by tenant
**Demo**: "At standup, I can show: A test repository that auto-filters queries by tenantId without manual scoping"

### Tasks

- [ ] Task 2.1: Create TenantAwareRepository abstract base class
  - **Output**: Abstract repository with auto-scoping methods
  - **Files**: `src/lib/db/TenantAwareRepository.ts` (new)
  - **Implementation**:
    - Protected `getTenantId()` - gets from context, throws BadRequestError(400) if missing
    - Protected `scopedQuery()` - adds WHERE tenantId = X
    - Abstract methods for table name
    - Basic CRUD: findAll, findById, create, update, delete (all auto-scoped)
    - `NOT_TENANT_SCOPED_findAll()` - bypasses filtering (for admin)
  - **Verify**: TypeScript compiles, exports correctly

- [ ] Task 2.2: Create BadRequestError if not exists
  - **Depends on**: 2.1
  - **Output**: Custom error class for 400 errors
  - **Files**: `src/lib/http/errors.ts` (check if exists, add if needed)
  - **Changes**: Export `BadRequestError` extending base error with status 400
  - **Verify**: Can import and throw BadRequestError

- [ ] Task 2.3: Add test helper for mocking tenant context
  - **Depends on**: 2.1
  - **Output**: Utility to set tenant context in tests
  - **Files**: `src/lib/db/test-helpers.ts`
  - **Changes**: Add `withTenantContext(tenantId, fn)` helper using AsyncLocalStorage
  - **Verify**: Helper works in test environment

- [ ] Task 2.4: Write unit tests for TenantAwareRepository
  - **Depends on**: 2.1, 2.3
  - **Output**: Tests verifying auto-scoping behavior
  - **Files**: `src/lib/db/TenantAwareRepository.test.ts` (new)
  - **Test cases**:
    - getTenantId() throws when no context
    - scopedQuery() adds WHERE clause
    - create() auto-injects tenantId
    - NOT_TENANT_SCOPED_findAll() bypasses filter
  - **Verify**: `npm test` passes

### Phase 2 Checkpoint

- [ ] Run lint: `npm run lint`
- [ ] Run build: `npm run build`
- [ ] Run tests: `npm test` (all tests pass including new ones)
- [ ] Manual verification: Import TenantAwareRepository in a test file, verify methods exist
- [ ] **Demo ready**: "TenantAwareRepository auto-scopes queries, tested with unit tests showing tenant isolation"

---

## Phase 3: Albums & Photos Database & Repositories

**Goal**: Create Albums and Photos tables with parent-child relationship, both tenant-scoped
**Demo**: "At standup, I can show: Albums and Photos tables with composite indexes, both repositories auto-scope by tenant, parent-child relationship working"

### Tasks

- [ ] Task 3.1: Create albums migration
  - **Output**: Database migration for albums table
  - **Files**: `src/db/migrations/007_create_albums_table.ts` (new - adjust number based on existing migrations)
  - **Schema**:
    ```sql
    CREATE TABLE albums (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id),
      name VARCHAR(255) NOT NULL,
      description TEXT,
      cover_photo_url TEXT,
      status VARCHAR(50) NOT NULL DEFAULT 'draft',
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
    ```
  - **Verify**: Migration syntax is correct (dry run if possible)

- [ ] Task 3.2: Create photos migration
  - **Depends on**: 3.1
  - **Output**: Database migration for photos table
  - **Files**: `src/db/migrations/008_create_photos_table.ts` (new)
  - **Schema**:
    ```sql
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
  - **Verify**: Migration syntax is correct

- [ ] Task 3.3: Run migrations to create both tables
  - **Depends on**: 3.2
  - **Output**: Albums and Photos tables exist in database
  - **Command**: `npm run migrate` (or equivalent)
  - **Verify**: Check database - both tables and all indexes exist

- [ ] Task 3.4: Run Kysely codegen to update types
  - **Depends on**: 3.3
  - **Output**: Updated Database types including Albums and Photos
  - **Command**: `npm run db:codegen`
  - **Files**: Updates `src/lib/db/types.ts`
  - **Verify**: Albums and Photos interfaces exist in types.ts

- [ ] Task 3.5: Create Albums repository extending TenantAwareRepository
  - **Depends on**: 3.4, Phase 2 complete
  - **Output**: Albums repository with auto-tenant-scoping
  - **Files**: `src/db/albums.repository.ts` (new)
  - **Implementation**:
    - Extends TenantAwareRepository
    - Implements table name
    - Inherits all CRUD methods (no custom scoping needed)
    - Add custom methods if needed (findByStatus, softDelete, restore)
  - **Verify**: TypeScript compiles, can import repository

- [ ] Task 3.6: Create Photos repository extending TenantAwareRepository
  - **Depends on**: 3.5
  - **Output**: Photos repository with auto-tenant-scoping
  - **Files**: `src/db/photos.repository.ts` (new)
  - **Implementation**:
    - Extends TenantAwareRepository
    - Implements table name
    - Inherits all CRUD methods (no custom scoping needed)
    - Add custom method: findByAlbumId(albumId) - auto-scoped by tenant
  - **Verify**: TypeScript compiles, can import repository

- [ ] Task 3.7: Define Albums and Photos DTOs and Zod schemas
  - **Depends on**: 3.6
  - **Output**: Data transfer objects and validation schemas for both entities
  - **Files**:
    - `src/controllers/albums/albums.dto.ts` (new)
    - `src/controllers/photos/photos.dto.ts` (new)
  - **Schemas**:
    - Albums: CreateAlbumSchema, UpdateAlbumSchema, AlbumResponseSchema, ListAlbumsQuerySchema
    - Photos: CreatePhotoSchema, UpdatePhotoSchema, PhotoResponseSchema, ListPhotosQuerySchema
  - **Verify**: Can import and use all schemas

### Phase 3 Checkpoint

- [ ] Run lint: `npm run lint`
- [ ] Run build: `npm run build`
- [ ] Run tests: `npm test`
- [ ] Manual verification:
  - Database has both albums and photos tables with all columns
  - Can import both repositories
  - Check indexes exist: `\d+ albums` and `\d+ photos` in psql
  - Verify FK constraint from photos to albums
- [ ] **Demo ready**: "Albums and Photos tables exist with composite indexes, both repositories auto-scope by tenant, parent-child relationship established"

---

## Phase 4: Albums & Photos Services, Controllers & Frontend

**Goal**: Complete Albums & Photos CRUD with API and web UI, including parent-child relationship
**Demo**: "At standup, I can show: Full Albums & Photos CRUD via API and web UI, parent-child relationship working, all data scoped to logged-in user's tenant"

### Tasks

- [ ] Task 4.1: Create Albums service with business logic
  - **Depends on**: Phase 3 complete
  - **Output**: Service layer for Albums
  - **Files**: `src/services/albums.service.ts` (new)
  - **Implementation**:
    - CRUD methods using albumsRepository
    - Soft delete logic
    - Status transition validation
    - Error handling (NotFoundError, etc.)
  - **Verify**: Can import service, methods are typed

- [ ] Task 4.2: Create Photos service with business logic
  - **Depends on**: 4.1
  - **Output**: Service layer for Photos
  - **Files**: `src/services/photos.service.ts` (new)
  - **Implementation**:
    - CRUD methods using photosRepository
    - Find photos by albumId (auto-scoped by tenant)
    - Soft delete logic
    - Validation that album exists and belongs to tenant
  - **Verify**: Can import service, methods are typed

- [ ] Task 4.3: Create Albums controller with API endpoints
  - **Depends on**: 4.2
  - **Output**: REST API for Albums
  - **Files**: `src/controllers/albums/albums.controller.ts` (new)
  - **Endpoints**:
    - GET /albums - list (with pagination, filters)
    - GET /albums/:id - get single album with photos
    - POST /albums - create
    - PUT /albums/:id - update
    - DELETE /albums/:id - soft delete
  - **Pattern**: Follow src/controllers/tenants/tenant.controller.ts
  - **Verify**: Routes defined, TypeScript compiles

- [ ] Task 4.4: Create Photos controller with API endpoints
  - **Depends on**: 4.3
  - **Output**: REST API for Photos including nested routes
  - **Files**: `src/controllers/photos/photos.controller.ts` (new)
  - **Endpoints**:
    - GET /albums/:albumId/photos - list photos in album
    - GET /photos/:id - get single photo
    - POST /albums/:albumId/photos - add photo to album
    - PUT /photos/:id - update photo
    - DELETE /photos/:id - soft delete photo
  - **Verify**: Routes defined, nested routes work

- [ ] Task 4.5: Wire Albums and Photos controllers into app
  - **Depends on**: 4.4
  - **Output**: Both controllers active
  - **Files**: `src/index.ts` (or routes config)
  - **Changes**: Add both controllers to app via bindControllerToApp
  - **Verify**: App starts, routes appear in logs/OAS

- [ ] Task 4.6: Create Albums list page (EJS)
  - **Depends on**: 4.5
  - **Output**: Frontend page showing albums in grid/card view
  - **Files**: `views/pages/albums.ejs` (new)
  - **Features**:
    - Grid/card layout with cover photos
    - Album name, description, photo count, status badges
    - Filter for status and is_deleted
    - Link to create form
    - Click album to view details
  - **Pattern**: Follow views/pages/dashboard.ejs
  - **Verify**: Page renders without errors

- [ ] Task 4.7: Create Album detail page with photos (EJS)
  - **Depends on**: 4.6
  - **Output**: Page showing album details and photos grid
  - **Files**: `views/pages/album-detail.ejs` (new)
  - **Features**:
    - Album info at top
    - Photos in responsive grid
    - Add photo button
    - Edit/delete album buttons
    - Click photo for fullsize view
  - **Verify**: Page shows album and photos correctly

- [ ] Task 4.8: Create Album form page (create/edit)
  - **Depends on**: 4.7
  - **Output**: Form for creating/editing albums
  - **Files**: `views/pages/album-form.ejs` (new)
  - **Fields**: name (required), description (optional), status (select), cover_photo_url (optional)
  - **Validation**: Server-side with Zod
  - **Verify**: Form submits and creates/updates albums

- [ ] Task 4.9: Create Photo upload/edit form
  - **Depends on**: 4.8
  - **Output**: Form for adding/editing photos
  - **Files**: `views/pages/photo-form.ejs` (new)
  - **Fields**: title (required), description (optional), url (required), thumbnail_url (optional), status (select)
  - **Note**: For now, URL-based. File upload can be added later
  - **Verify**: Form works, photos added to album

- [ ] Task 4.10: Add Albums link to navigation
  - **Depends on**: 4.6
  - **Output**: Navigation includes Albums
  - **Files**: `views/partials/nav.ejs` or `views/partials/header.ejs`
  - **Changes**: Add link to /albums in nav menu
  - **Verify**: Link appears and works

### Phase 4 Checkpoint

- [ ] Run lint: `npm run lint`
- [ ] Run build: `npm run build`
- [ ] Run tests: `npm test`
- [ ] Manual verification:
  - Login to app
  - Navigate to /albums
  - Create an album
  - View album detail
  - Add photos to album
  - Edit album and photos
  - Delete album/photos (soft delete)
  - Verify all data is scoped to your tenant
- [ ] **Demo ready**: "Full Albums & Photos CRUD via web UI - create albums, add photos, list, edit, delete all working with tenant isolation and parent-child relationships"

---

## Phase 5: Enhanced Tenant Resolution & Tenant Switching

**Goal**: Add JWT support, auto-provisioning, and tenant switching endpoint
**Demo**: "At standup, I can show: Users auto-get tenants, can switch between tenants, tenant selector in UI"

### Tasks

- [ ] Task 5.1: Enhance tenant resolution middleware with JWT support
  - **Output**: Middleware checks JWT first, then session
  - **Files**: `src/lib/http/middleware/tenantResolution.middleware.ts`
  - **Changes**:
    - Check Authorization header for JWT
    - Extract organization_id or tenant_id claim
    - Fallback to session.currentTenantId
  - **Verify**: Works with both JWT and session

- [ ] Task 5.2: Add auto-provisioning for users without tenants
  - **Depends on**: 5.1
  - **Output**: New users automatically get a tenant
  - **Files**: `src/lib/http/middleware/tenantResolution.middleware.ts`
  - **Logic**:
    - If user has no organizations → create tenant
    - Assign user to tenant via user_tenants
    - Set as active tenant
  - **Verify**: New user gets tenant automatically

- [ ] Task 5.3: Create tenant switch API endpoint
  - **Output**: POST /api/tenant/switch endpoint
  - **Files**: `src/controllers/tenant-switch.controller.ts` (new)
  - **Implementation**:
    - Validate target tenantId in user's organizations
    - Update session.currentTenantId
    - Return 200 OK or 403 Forbidden
  - **Verify**: Endpoint works, validates membership

- [ ] Task 5.4: Create tenant selector component for navigation
  - **Depends on**: 5.3
  - **Output**: Dropdown showing user's tenants
  - **Files**: `views/partials/tenant-selector.ejs` (new)
  - **Features**:
    - Show only if user has multiple orgs
    - Display current tenant name
    - Dropdown with all user's tenants
    - JavaScript to call /api/tenant/switch
  - **Verify**: Selector appears and works

- [ ] Task 5.5: Include tenant selector in header/nav
  - **Depends on**: 5.4
  - **Output**: Tenant selector visible in UI
  - **Files**: `views/partials/header.ejs` or `views/partials/nav.ejs`
  - **Changes**: Include tenant-selector partial
  - **Verify**: Visible in navigation, works correctly

- [ ] Task 5.6: Add service to get user's tenant list
  - **Depends on**: 5.3
  - **Output**: API to fetch user's tenants
  - **Files**: Add to auth or user service
  - **Endpoint**: GET /api/user/tenants
  - **Returns**: List of tenants user belongs to
  - **Verify**: Returns correct tenant list

### Phase 5 Checkpoint

- [ ] Run lint: `npm run lint`
- [ ] Run build: `npm run build`
- [ ] Run tests: `npm test`
- [ ] Manual verification:
  - Login as new user (should auto-create tenant)
  - Add user to second tenant via Keycloak
  - Verify tenant selector appears
  - Switch tenants, verify albums list changes
- [ ] **Demo ready**: "Users auto-provisioned, multi-org users can switch tenants via UI, data updates accordingly"

---

## Phase 6: Playwright E2E Tests & Cleanup

**Goal**: Add E2E test suite and remove obsolete manual scoping code
**Demo**: "At standup, I can show: E2E tests verify tenant isolation, old withTenantScope removed"

### Tasks

- [ ] Task 6.1: Install Playwright and setup config
  - **Output**: Playwright installed and configured
  - **Commands**:
    - `npm install -D @playwright/test`
    - `npx playwright install`
  - **Files**: `playwright.config.ts` (new)
  - **Config**: Base URL, test directory, timeout
  - **Verify**: `npx playwright test --help` works

- [ ] Task 6.2: Add Keycloak test container to docker-compose
  - **Output**: Ephemeral Keycloak for testing
  - **Files**: `docker-compose.yml` or `docker-compose.test.yml`
  - **Services**: Add keycloak-test service with test realm
  - **Env vars**: KEYCLOAK_TEST_URL, KEYCLOAK_ADMIN_USER, KEYCLOAK_ADMIN_PASSWORD
  - **Verify**: `docker compose -f docker-compose.test.yml up` starts Keycloak

- [ ] Task 6.3: Create Keycloak helper library
  - **Depends on**: 6.2
  - **Output**: Utilities for test user/org management
  - **Files**: `tests/helpers/keycloak.ts` (new)
  - **Functions**:
    - createUser(email, password)
    - createOrganization(name)
    - assignUserToOrg(userId, orgId)
    - loginAs(email, password) - returns session cookie
    - cleanup() - delete test data
  - **Verify**: Can call functions in test context

- [ ] Task 6.4: Create tenant isolation E2E tests
  - **Depends on**: 6.1, 6.3
  - **Output**: Tests verifying cross-tenant isolation for albums and photos
  - **Files**: `tests/e2e/tenant-isolation.spec.ts` (new)
  - **Tests**:
    1. User A creates album → visible to A only
    2. User B cannot access A's album
    3. User A cannot access B's album by direct URL
    4. User A cannot add photos to B's album
    5. User A cannot access B's photos
  - **Verify**: `npx playwright test` passes

- [ ] Task 6.5: Create Albums & Photos functionality E2E tests
  - **Depends on**: 6.4
  - **Output**: Tests for Albums & Photos CRUD workflows
  - **Files**: `tests/e2e/albums-photos-crud.spec.ts` (new)
  - **Tests**:
    - Soft delete and restore for albums and photos
    - Status transitions (draft → published → archived) for both
    - Creator tracking for both entities
    - Parent-child relationship: photos belong to correct album
    - Cascade behavior when album deleted (if implemented)
  - **Verify**: Tests pass

- [ ] Task 6.6: Create multi-org E2E tests
  - **Depends on**: 6.4
  - **Output**: Tests for tenant switching
  - **Files**: `tests/e2e/multi-org.spec.ts` (new)
  - **Tests**:
    - User in multiple orgs can switch
    - New user gets auto-provisioned tenant
    - Cannot switch to unauthorized tenant
  - **Verify**: Tests pass

- [ ] Task 6.7: Remove withTenantScope() function
  - **Output**: Obsolete manual scoping removed
  - **Files**: `src/lib/db/TenantScopedModel.ts`
  - **Remove**: withTenantScope() function (lines 48-54)
  - **Verify**: Build succeeds (no usages), git grep confirms no references

- [ ] Task 6.8: Mark TenantScopedModel.ts as deprecated or remove entirely
  - **Depends on**: 6.7
  - **Output**: File deprecated or deleted
  - **Files**: `src/lib/db/TenantScopedModel.ts`
  - **Changes**: Add deprecation comment or delete file if only withTenantScope existed
  - **Verify**: Codebase clean, no broken imports

- [ ] Task 6.9: Add CI workflow for E2E tests
  - **Depends on**: 6.6
  - **Output**: GitHub Actions (or CI) runs E2E tests
  - **Files**: `.github/workflows/e2e.yml` (new or update existing)
  - **Steps**: Start containers, run migrations, run Playwright tests
  - **Verify**: CI passes on push

### Phase 6 Checkpoint

- [ ] Run lint: `npm run lint`
- [ ] Run build: `npm run build`
- [ ] Run tests: `npm test`
- [ ] Run E2E tests: `npx playwright test`
- [ ] Manual verification:
  - All E2E tests pass
  - withTenantScope removed from codebase
  - No broken imports or references
- [ ] **Demo ready**: "E2E tests verify tenant isolation for albums and photos, parent-child relationships tested, obsolete manual scoping code removed"

---

## Final Verification

### Requirements Checklist

- [ ] REQ-001: Automatic tenantId injection in SELECT queries ✓ (TenantAwareRepository)
- [ ] REQ-002: Automatic tenantId injection in INSERT operations ✓ (TenantAwareRepository.create)
- [ ] REQ-003: Hybrid JWT/session tenant resolution ✓ (Phase 5)
- [ ] REQ-004: Albums & Photos with parent-child relationship, status, creator, soft delete ✓ (Phase 3-4)
- [ ] REQ-005: Frontend UI with tenant selector ✓ (Phase 4-5)
- [ ] REQ-006: Cross-tenant data access prevented ✓ (auto-scoping)
- [ ] REQ-007: 400 error when tenant context missing ✓ (getTenantId throws)
- [ ] REQ-008: Playwright tests with Keycloak helpers ✓ (Phase 6)
- [ ] REQ-009: Auto-provision tenant for new users ✓ (Phase 5)
- [ ] REQ-010: NOT*TENANT_SCOPED* methods for admin ✓ (Phase 2)
- [ ] REQ-011: Validated tenant switching ✓ (Phase 5)

### Code Cleanup

- [ ] withTenantScope() function removed
- [ ] TenantScopedModel.ts deprecated/removed
- [ ] All obsolete manual scoping code deleted
- [ ] No dead imports or unused files

### Quality Gates

- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] All E2E tests pass (12+ scenarios covering both entities and relationships)
- [ ] Linter passes with no errors
- [ ] Build succeeds
- [ ] Documentation updated (if applicable)

### Demo Script (Final)

1. **Show automatic tenant scoping**: Create album as User A, login as User B, verify isolation
2. **Show parent-child relationships**: Add photos to album, verify both are tenant-scoped
3. **Show tenant switching**: Multi-org user switches tenants, albums list updates
4. **Show auto-provisioning**: New user logs in, automatically gets tenant
5. **Show E2E tests**: Run `npx playwright test --ui`, show passing tests
6. **Show clean codebase**: Search for withTenantScope - none found

---

## Success! 🎉

You now have:

- ✅ Automatic tenant isolation at database layer
- ✅ Zero tenant-specific code in new features (except NOT*TENANT_SCOPED*)
- ✅ Albums & Photos CRUD as realistic reference implementation with parent-child relationships
- ✅ Complete E2E test coverage including relationship testing
- ✅ Clean codebase with obsolete code removed

**Next steps for other developers**:

1. Extend TenantAwareRepository for new features
2. Use Albums & Photos as reference for:
   - Parent-child relationships with tenant awareness
   - Status, soft delete, creator tracking patterns
   - Composite indexes for query optimization
   - File/URL handling patterns
3. Run E2E tests to verify tenant isolation in new features
