# Implementation Tasks: Remove Keycloak Organizations

## Overview

Remove Keycloak Organizations feature and Admin API integration, simplifying authentication to OIDC-only. Move tenant-user relationship management entirely into application database with auto-provisioning of personal tenants. This removes ~1,000 lines of code and eliminates tight coupling to Keycloak Admin API.

**Phases**: 5 phases

- Phase 1: Database schema cleanup
- Phase 2: Service layer simplification (remove Admin API)
- Phase 3: Controller simplification (auto-provision personal tenants)
- Phase 4: Configuration & infrastructure cleanup
- Phase 5: Test cleanup & documentation

## Phase 1: Database Migration

**Goal**: Remove keycloakOrganizationId column from tenants table
**Demo**: "Migration runs successfully, column removed, existing user_tenants data preserved"

### Tasks

- [ ] Task 1.1: Create migration to drop keycloakOrganizationId column
  - **Output**: New migration file `012_drop_keycloak_organization_id.ts`
  - **Files**: `src/db/migrations/012_drop_keycloak_organization_id.ts`
  - **Verify**: Migration runs without errors
  - **Details**:
    - `up()`: Drop `tenants_keycloak_organization_id_idx` index, then drop `keycloakOrganizationId` column
    - `down()`: Add column back (nullable), recreate unique index

- [ ] Task 1.2: Update tenant repository interfaces to remove keycloakOrganizationId
  - **Depends on**: 1.1
  - **Output**: Updated TypeScript interfaces without keycloakOrganizationId
  - **Files**: `src/db/tenant.repository.ts`
  - **Remove**:
    - `keycloakOrganizationId` from `CreateTenantData` interface
    - `keycloakOrganizationId` from `UpdateTenantData` interface
    - `findByKeycloakOrganizationId()` method

### Phase 1 Checkpoint

- [ ] Run lint: `npm run lint`
- [ ] Run build: `npm run build`
- [ ] Run tests: `npm test`
- [ ] Manual verification: Check TypeScript compilation passes
- [ ] **Demo ready**: Schema updated, code compiles with removed column

## Phase 2: Service Layer - Remove Admin API Integration

**Goal**: Delete Keycloak Admin API service and remove all org-related logic from auth/user/tenant services
**Demo**: "Login uses OIDC only, no Admin API calls, services simplified"

### Tasks

- [ ] Task 2.1: Delete Keycloak Admin service files
  - **Output**: Remove Admin API integration entirely
  - **Files**:
    - DELETE `src/services/keycloak-admin.service.ts` (354 lines)
    - DELETE `src/services/keycloak-admin.service.test.ts` (~200 lines)
  - **Remove**: Entire service and tests

- [ ] Task 2.2: Simplify auth service - remove org fetch
  - **Depends on**: 2.1
  - **Output**: Auth service no longer calls Admin API
  - **Files**: `src/services/auth.service.ts`
  - **Remove**:
    - Lines 112-114 (getUserOrganizations call)
    - `organizations` field from `UserClaims` interface
  - **Verify**: Auth service only does OIDC token exchange

- [ ] Task 2.3: Simplify user service - remove org sync
  - **Depends on**: 2.1
  - **Output**: syncUserFromKeycloak only upserts user record
  - **Files**: `src/services/user.service.ts`
  - **Remove**: Lines 37-61 (org sync loop with Admin API calls)
  - **Keep**: Basic user upsert from OIDC claims
  - **Verify**: Service only manages user records, not org memberships

- [ ] Task 2.4: Simplify tenant service - remove org methods
  - **Depends on**: 2.1
  - **Output**: Tenant service creates tenants in DB only
  - **Files**: `src/services/tenant.service.ts`
  - **Remove**:
    - `findByKeycloakOrganizationId()` method (lines 107-110)
    - `ensureTenantForOrganization()` method (lines 120-169)
    - `createTenantWithExistingOrg()` method (lines 175-185)
    - Admin API call from `createTenant()` method
  - **Verify**: createTenant() works with Keycloak down

### Phase 2 Checkpoint

- [ ] Run lint: `npm run lint`
- [ ] Run build: `npm run build`
- [ ] Run tests: `npm test` (expect some test failures - we'll fix in Phase 5)
- [ ] Manual verification: No imports of keycloak-admin service remain
- [ ] **Demo ready**: Services simplified, no Admin API dependency

## Phase 3: Controller - Auto-Provision Personal Tenants

**Goal**: Implement simplified auto-provisioning that creates DB-only personal tenants
**Demo**: "New user login creates {username}-personal tenant automatically"

### Tasks

- [ ] Task 3.1: Simplify auth callback - remove Keycloak org creation
  - **Output**: Callback handler only handles OIDC flow + DB operations
  - **Files**: `src/controllers/auth.controller.ts`
  - **Remove**: Lines 109-178 (complex org + tenant creation with Admin API)
  - **Keep**: Basic token exchange and user sync

- [ ] Task 3.2: Implement DB-only auto-provisioning
  - **Depends on**: 3.1
  - **Output**: New auto-provision logic (DB-only, ~15 lines)
  - **Files**: `src/controllers/auth.controller.ts`
  - **Details**:
    - Check if user has entries in `user_tenants` table
    - If not: Extract username from email, generate `{username}-personal` tenant name
    - Create tenant record (DB only, no Keycloak call)
    - Create `user_tenants` entry linking user to new tenant
  - **Verify**: New user login creates personal tenant in DB

- [ ] Task 3.3: Set currentTenantId for session
  - **Depends on**: 3.2
  - **Output**: Session initialized with current tenant
  - **Files**: `src/controllers/auth.controller.ts`
  - **Details**:
    - Query user_tenants to get available tenants
    - Use lastTenantId preference or first available
    - Set session.currentTenantId
  - **Verify**: User redirects to dashboard with active tenant

### Phase 3 Checkpoint

- [ ] Run lint: `npm run lint`
- [ ] Run build: `npm run build`
- [ ] Run tests: `npm test`
- [ ] Manual verification: Login as new user via UI, verify personal tenant created
- [ ] **Demo ready**: Complete OIDC-only login flow with auto-provisioning

## Phase 4: Configuration & Infrastructure Cleanup

**Goal**: Remove admin client configuration and simplify Keycloak setup
**Demo**: "App runs with single OIDC client, no admin client needed"

### Tasks

- [ ] Task 4.1: Remove admin client config from application
  - **Output**: Config schema without admin client fields
  - **Files**: `src/lib/config.ts`
  - **Remove**:
    - `KEYCLOAK_ADMIN_CLIENT_ID` field (lines 164-174)
    - `KEYCLOAK_ADMIN_CLIENT_SECRET` field
  - **Verify**: Config validation passes without admin vars

- [ ] Task 4.2: Update .env.example
  - **Depends on**: 4.1
  - **Output**: Example env file without admin client vars
  - **Files**: `.env.example`
  - **Remove**:
    - `KEYCLOAK_ADMIN_CLIENT_ID` line
    - `KEYCLOAK_ADMIN_CLIENT_SECRET` line
  - **Verify**: Example reflects OIDC-only setup

- [ ] Task 4.3: Simplify Keycloak init script
  - **Output**: Init script creates OIDC client only
  - **Files**: `infra/keycloak-init.sh`
  - **Remove**: Lines 98-156 (admin client creation and role assignment)
  - **Update**: Final output message to reflect single client
  - **Verify**: Script runs successfully, creates OIDC client

- [ ] Task 4.4: Update docker-compose.test.yml
  - **Depends on**: 4.1
  - **Output**: Test compose without Organizations feature flag
  - **Files**: `docker-compose.test.yml`
  - **Remove**:
    - `KC_FEATURES: organizations` environment variable
    - `KEYCLOAK_ADMIN_CLIENT_ID` variable
    - `KEYCLOAK_ADMIN_CLIENT_SECRET` variable
  - **Verify**: Test environment starts without Organizations feature

### Phase 4 Checkpoint

- [ ] Run lint: `npm run lint`
- [ ] Run build: `npm run build`
- [ ] Run full stack: `docker compose up`
- [ ] Manual verification: App starts, can login via Keycloak
- [ ] **Demo ready**: Complete system runs with simplified config

## Phase 5: Test Cleanup & Documentation

**Goal**: Remove obsolete tests, update remaining tests, document changes
**Demo**: "All tests pass, no org-related test code remains"

### Tasks

- [ ] Task 5.1: Delete obsolete E2E tests
  - **Output**: Remove org-specific E2E tests
  - **Files**:
    - DELETE `tests/e2e/multi-org.spec.ts`
  - **Remove**: Entire test file (tests org sync which no longer exists)

- [ ] Task 5.2: Clean up Keycloak test helpers
  - **Depends on**: 5.1
  - **Output**: Remove org helper methods
  - **Files**: `tests/helpers/keycloak.ts`
  - **Remove**:
    - `createOrganization()` method
    - `assignUserToOrg()` method
    - `deleteOrganization()` method
  - **Keep**: Basic auth helper methods

- [ ] Task 5.3: Update integration tests
  - **Output**: Integration tests work without keycloakOrganizationId
  - **Files**:
    - `src/integration/auth.integration.test.ts`
    - `src/integration/rls.integration.test.ts`
  - **Remove**:
    - Org sync assertions from auth tests
    - `keycloakOrganizationId` from tenant creation in RLS tests
  - **Verify**: RLS still enforces isolation using user_tenants table

- [ ] Task 5.4: Update unit tests
  - **Depends on**: 5.3
  - **Output**: Unit tests reflect simplified services
  - **Files**:
    - `src/services/auth.service.test.ts`
    - `src/services/user.service.test.ts`
    - `src/services/tenant.service.test.ts`
  - **Remove**:
    - Admin API mocks from auth tests
    - Org sync test cases from user tests
    - Org creation test cases from tenant tests
  - **Verify**: All unit tests pass

- [ ] Task 5.5: Update README/documentation
  - **Depends on**: 5.4
  - **Output**: Documentation reflects OIDC-only setup
  - **Files**: `README.md` (if org setup documented)
  - **Remove**: References to Keycloak Organizations, admin client setup
  - **Add**: Document auto-provisioning of personal tenants
  - **Verify**: Setup instructions are accurate

### Phase 5 Checkpoint

- [ ] Run lint: `npm run lint`
- [ ] Run build: `npm run build`
- [ ] Run tests: `npm test` (all tests pass)
- [ ] Run E2E tests: `npm run test:e2e` (all pass)
- [ ] Manual verification:
  - New user login creates personal tenant
  - Tenant creation works (no Keycloak dependency)
  - RLS policies still enforce isolation
- [ ] **Demo ready**: Complete feature with all tests passing

## Final Verification

- [ ] All requirements from design doc met:
  - [ ] REQ-001: Keycloak used for authentication only ✓
  - [ ] REQ-004: No Admin API calls during login ✓
  - [ ] REQ-005: Tenant creation works when Keycloak down ✓
  - [ ] REQ-009: Auto-create personal tenant for new users ✓
  - [ ] REQ-010: Personal tenant naming: {username}-personal ✓
- [ ] All obsolete code removed:
  - [ ] keycloak-admin.service.ts deleted ✓
  - [ ] Admin client config removed ✓
  - [ ] Org sync logic removed ✓
  - [ ] ~1,000 lines of code removed ✓
- [ ] Tests comprehensive:
  - [ ] Auto-provision tested ✓
  - [ ] RLS policies verified ✓
  - [ ] E2E login flow works ✓
- [ ] Documentation updated:
  - [ ] Setup instructions reflect OIDC-only ✓
  - [ ] Auto-provisioning documented ✓
