# Design: Remove Keycloak Organizations

## Research & Best Practices

### Industry Findings

Modern authentication architecture emphasizes **clear separation of concerns** between authentication (verifying identity) and authorization (access control). The industry consensus strongly favors keeping these as distinct, loosely-coupled systems rather than tightly integrating them with external identity providers.

**Key Sources Consulted**:

- [Authentication and Authorization Best Practices](https://blog.gitguardian.com/authentication-and-authorization/) - GitGuardian 2024
- [Best Practices for API Authentication and Authorization](https://www.permit.io/blog/best-practices-for-api-authentication-and-authorization) - Permit.io 2024
- [Keycloak Securing Applications Guide](https://www.keycloak.org/docs/25.0.6/securing_apps/index.html) - Official Documentation
- [How to Avoid Microservice Anti-Patterns](https://vfunction.com/blog/how-to-avoid-microservices-anti-patterns/) - vFunction 2024
- [Zero-Downtime Database Migrations](https://launchdarkly.com/blog/3-best-practices-for-zero-downtime-database-migrations/) - LaunchDarkly 2024

### Recommended Patterns

1. **Authentication-Only External Services**
   - Source: [Keycloak OIDC Layers](https://www.keycloak.org/securing-apps/oidc-layers)
   - **Pattern**: Use external identity providers (like Keycloak) strictly for authentication via standard protocols (OIDC/OAuth2), while managing all authorization logic within the application
   - **Benefits**:
     - Reduces external dependencies and API calls
     - Maintains full control over authorization logic
     - Simplifies integration and reduces attack surface
   - **Application**: Our system should use Keycloak only for OIDC authentication flows, eliminating the Admin API dependency

2. **Loose Coupling in Distributed Systems**
   - Source: [How to Design Loosely Coupled Microservices](https://nordicapis.com/how-to-design-loosely-coupled-microservices/)
   - **Pattern**: Minimize synchronous dependencies on external services; each service should own its data and expose it through well-defined APIs
   - **Why it matters**: Tight coupling to Keycloak Admin API creates cascading failures (tenant creation fails if Keycloak is down) and performance bottlenecks (O(n) API calls during login)
   - **Application**: Move tenant-user relationship management from Keycloak Organizations to application database

3. **Application-Managed RBAC**
   - Source: [Implement role-based access control in applications](https://learn.microsoft.com/en-us/entra/identity-platform/howto-implement-rbac-for-apps) - Microsoft Learn
   - **Pattern**: Define app roles within the application, assign users programmatically, and interpret role assignments in application code rather than delegating to external IdP
   - **Benefits**:
     - Full control over authorization model evolution
     - No external API calls for authorization decisions
     - Easier to test and audit
   - **Application**: We already store roles in application database; removing Organizations aligns with this pattern

4. **Multi-Phase Column Removal for Zero Downtime**
   - Source: [3 Best Practices For Zero-Downtime Database Migrations](https://launchdarkly.com/blog/3-best-practices-for-zero-downtime-database-migrations/)
   - **Pattern**: Three-release process: (1) Mark column ignored in code, (2) Deploy and verify, (3) Drop column in migration
   - **Why referenced**: Industry best practice for production systems
   - **Application**: Single-release approach acceptable since no existing production data to protect

> **Decision**: Single-Release Deployment
> **Rationale**: Application not yet deployed to production; no existing data migration concerns; can safely drop column and code simultaneously
> **Alternative**: Phased rollout rejected due to unnecessary complexity for greenfield deployment

### Technologies to Consider

- **Standard OIDC/OAuth2 (Keep)**
  - Reference: [OpenID Connect Core Spec](https://openid.net/specs/openid-connect-core-1_0.html)
  - Why: Industry standard for authentication, well-supported, no vendor lock-in
  - Trade-off: We lose nothing by using only OIDC; Organizations were adding complexity without benefit

### Anti-Patterns to Avoid

1. **Tight Coupling to External Services**
   - Source: [Seven Microservices Anti-patterns](https://www.infoq.com/articles/seven-uservices-antipatterns/)
   - **Problem**: Making core business operations (tenant creation) dependent on external service availability creates single points of failure
   - **Current Issue**: Tenant creation requires Keycloak Admin API success; system fails when Keycloak is unavailable
   - **Solution**: Make external services (Keycloak) responsible ONLY for their core function (authentication), not business logic

2. **Excessive Synchronous Communication**
   - Source: [What is Coupling in Microservices?](https://medium.com/@varun766872133/what-is-coupling-in-microservices-7ff1ff5eb67e)
   - **Problem**: Login flow makes multiple synchronous Admin API calls (list all orgs, check membership for each), creating latency and failure points
   - **Current Issue**: O(n) API calls during every login where n = total organizations in realm
   - **Solution**: Remove all Admin API calls from critical paths; rely only on OIDC token exchange

3. **Shared External State Management**
   - Source: [How to Avoid Coupling in Microservices Design](https://www.capitalone.com/tech/software-engineering/how-to-avoid-loose-coupled-microservices/)
   - **Problem**: Using external service (Keycloak Organizations) as source of truth for application state (user-tenant relationships) creates synchronization complexity
   - **Current Issue**: Must sync Keycloak org membership to local `user_tenants` table on every login
   - **Solution**: Application database is authoritative for authorization data

### Standards & Compliance

- **OIDC Standard**: [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) - We'll continue using standard OIDC flows (no change)
- **OAuth 2.0**: [RFC 6749](https://tools.ietf.org/html/rfc6749) - Authorization Code flow for authentication (no change)
- **Security Best Practice**: [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) - Separation of authentication and authorization concerns

---

## Layer 1: Problem & Requirements

### Problem Statement

The application currently uses **Keycloak Organizations** to manage tenant-user relationships, creating tight coupling with Keycloak's Admin API and adding significant complexity without providing meaningful benefits. This architectural decision:

1. **Creates Performance Issues**: Every login makes O(n) synchronous Admin API calls to check organization membership across all organizations in the realm
2. **Introduces Tight Coupling**: Tenant creation fails if Keycloak is unavailable; core business operations depend on external service
3. **Adds Unnecessary Complexity**: ~1,200 lines of code to manage organization sync, dual API integration (OIDC + Admin API), and state synchronization between Keycloak and application database
4. **Requires Elevated Privileges**: Admin API client needs realm-management roles, increasing security surface
5. **Duplicates Authorization State**: `user_tenants` table must stay synchronized with Keycloak organization membership, creating potential for drift

**Core Issue**: We're using Keycloak for both authentication (appropriate) AND authorization (unnecessary), when authorization is already managed in the application database via Row-Level Security (RLS) policies that reference the local `user_tenants` table.

### Current State

**What Exists:**

**Authentication & Authorization Architecture** (`src/services/`):

- **OIDC Authentication**: Standard OpenID Connect flow via `auth.service.ts:34-80` for user login
- **Admin API Client**: Service account in `keycloak-admin.service.ts:40-354` for organization management
- **Organization Sync**: `user.service.ts:30-64` syncs Keycloak org membership to `user_tenants` table on every login
- **Auto-Provisioning**: `auth.controller.ts:109-178` creates Keycloak org + local tenant for users without organizations

**Database Schema** (`src/db/migrations/`):

- `002_add_keycloak_organization_to_tenants.ts`: Added `keycloakOrganizationId` column (nullable → required in migration 009)
- `user_tenants` table: Many-to-many junction table for user-tenant access (already exists, used by RLS)
- RLS Policies (`010_enable_rls.ts`, `011_add_rls_to_global_tables.ts`): Enforce tenant isolation using `user_tenants` table

**Infrastructure** (`infra/keycloak-init.sh`):

- Creates two Keycloak clients: OIDC client (authentication) + Admin client (service account)
- Assigns `manage-users`, `view-users` roles to admin client service account
- Requires `KC_FEATURES: organizations` enabled in Keycloak 25.0

**Pain Points:**

1. **Performance Degradation**:

   ```typescript
   // src/services/auth.service.ts:113-114
   const organizations = await keycloakAdminService.getUserOrganizations(idTokenClaims.sub);

   // Which calls (src/services/keycloak-admin.service.ts:283-296):
   async getUserOrganizations(userId: string): Promise<string[]> {
     const allOrgs = await this.listOrganizations();  // Fetch ALL orgs in realm
     for (const org of allOrgs) {                     // Check each one (O(n))
       const isMember = await this.isUserInOrganization(org.id, userId);
     }
   }
   ```

   - This runs **on every login**, making n+1 API calls where n = total organizations

2. **Cascade Failures**:

   ```typescript
   // src/services/tenant.service.ts:199-201
   const keycloakOrg = await keycloakAdminService.createOrganization(data.name);
   // If Keycloak is down or returns error, tenant creation fails entirely
   ```

3. **State Synchronization Complexity**:

   ```typescript
   // src/services/user.service.ts:40-61
   for (const orgId of keycloakData.organizations) {
     const org = await keycloakAdminService.getOrganization(orgId);
     const tenantId = await tenantService.ensureTenantForOrganization(orgId, org.name);
     tenantIds.push(tenantId);
   }
   await userTenantRepository.syncTenants(user.id, tenantIds);
   ```

   - Keycloak organizations = source of truth
   - Local `user_tenants` table = synchronized copy
   - Risk of drift if sync fails partially

4. **Operational Overhead**:
   - Two Keycloak clients to manage (OIDC + Admin)
   - Admin client needs elevated privileges (realm-management roles)
   - More environment variables (`KEYCLOAK_ADMIN_CLIENT_ID`, `KEYCLOAK_ADMIN_CLIENT_SECRET`)
   - More complex setup script (58 additional lines in `infra/keycloak-init.sh`)

5. **Authorization Already Application-Managed**:
   - RLS policies (`src/db/migrations/010_enable_rls.ts`) use `user_tenants` table, not Keycloak
   - Roles stored in application database (`roles`, `user_roles` tables)
   - Keycloak Organizations only determine **which tenants users can access**, nothing else

### Requirements

#### Functional

- **REQ-001**: The system SHALL use Keycloak exclusively for authentication (OIDC), not authorization
- **REQ-002**: User-tenant relationships SHALL be managed via application database (`user_tenants` table)
- **REQ-003**: WHEN a user logs in THEN the system SHALL create/update user record based on OIDC claims (email, sub)
- **REQ-004**: WHEN a user logs in THEN the system SHALL NOT call Keycloak Admin API
- **REQ-005**: Tenant creation SHALL succeed regardless of Keycloak availability
- **REQ-006**: Administrators SHALL be able to assign/remove users to/from tenants via application UI/API
- **REQ-007**: The system SHALL preserve existing user-tenant relationships in the database (no data loss)
- **REQ-008**: The system SHALL support zero-downtime deployment during migration
- **REQ-009**: WHEN a user logs in with no tenant assignments THEN the system SHALL auto-create a personal tenant
- **REQ-010**: Personal tenant naming SHALL follow pattern: `{username}-personal` where username is from email
- **REQ-011**: Auto-provisioned tenants SHALL be created in database only (no Keycloak organization)
- **REQ-012**: The system SHALL support solo-tenants (single user per tenant) in this implementation

#### Non-Functional

- **Performance**: Login flow must not make Admin API calls
- **Reliability**: Tenant operations must work when Keycloak is unavailable (resilience)
- **Security**: OIDC client credentials only; no elevated Keycloak privileges required
- **Simplicity**: Reduce external dependencies; ~1,000 lines of code removed
- **Maintainability**: Single integration point (OIDC) instead of dual (OIDC + Admin API)

### Constraints

- **Migration History**: Cannot delete historical migration files (`002_*.ts`, `009_*.ts`) - must keep for rollback capability
- **Keycloak Version**: System must work with any Keycloak version supporting OIDC (no Organizations feature required)
- **RLS Dependency**: Row-Level Security policies already use `user_tenants` table - this is the source of truth
- **PostgreSQL**: Database-specific features (RLS) cannot be changed
- **Solo-Tenant Model**: Multi-user tenants deferred to future (user invite feature)

> **Decision**: Auto-Provision Personal Tenants
> **Rationale**: Simpler than previous Keycloak org approach (just DB insert); eliminates need for admin tenant management; provides immediate value to users; aligns with solo-tenant model
> **Alternative**: Static "contact admin" message rejected - adds friction without benefit in greenfield deployment

### Success Criteria

✅ **Code Reduction**: ~1,000 lines of organization-specific code removed
✅ **Simplified Setup**: Keycloak init script reduced by 58 lines; single client instead of two
✅ **No Admin API Dependency**: Zero calls to Keycloak Admin API during normal operation
✅ **Auto-Provisioning**: New users automatically get personal tenant on first login
✅ **Resilience**: Tenant CRUD operations succeed when Keycloak is unavailable
✅ **Simplified Testing**: Tests only need to login; tenant auto-created
✅ **Tests Pass**: All unit, integration, and E2E tests pass with updated assertions

---

## Layer 2: Functional Specification

### User Workflows

#### 1. **New User Login (Auto-Provision Personal Tenant)**

- User navigates to protected page → Redirected to `/auth/login`
- Application redirects to Keycloak OIDC authorization endpoint
- User authenticates with Keycloak credentials
- Keycloak redirects back to `/auth/callback` with authorization code
- Application exchanges code for ID token (OIDC standard flow)
- Application creates/updates user record from ID token claims (email, sub)
- **System checks `user_tenants` table → No entries found**
- **System auto-provisions personal tenant**:
  - Generates tenant name: `{username}-personal` (e.g., `john-personal` from `john@example.com`)
  - Creates tenant record in database (no Keycloak org)
  - Creates `user_tenants` entry linking user to new tenant
- User sees dashboard for their personal tenant

#### 2. **Existing User Login (With Tenant Assignment)**

- User authenticates via OIDC (same as above)
- Application creates/updates user record
- **System queries `user_tenants` table → Finds assigned tenants**
- Application sets `currentTenantId` in session (uses `lastTenantId` preference or first available)
- User sees dashboard for current tenant

#### 3. **Tenant Creation (Admin Operation)**

- Admin creates new tenant via Admin API: `POST /admin/tenants`
- **System creates tenant record in database ONLY** (no Keycloak call)
- Operation succeeds immediately
- _(If Keycloak is down, operation still succeeds - no dependency)_

#### 4. **User Switches Tenant** (Future: Multi-Tenant Users)

- User with multiple tenants clicks tenant switcher
- Frontend calls `PUT /auth/tenant` with new tenant ID
- System validates user has access (checks `user_tenants` table)
- Session updated with new `currentTenantId`
- User sees dashboard for selected tenant

### External Interfaces

**Keycloak OIDC Endpoints** (UNCHANGED):

```
Authorization: GET {KEYCLOAK_URL}/realms/{REALM}/protocol/openid-connect/auth
Token Exchange: POST {KEYCLOAK_URL}/realms/{REALM}/protocol/openid-connect/token
Logout: GET {KEYCLOAK_URL}/realms/{REALM}/protocol/openid-connect/logout
```

**Keycloak Admin API Endpoints** (REMOVED):

```
❌ List Organizations: GET /admin/realms/{realm}/organizations
❌ Create Organization: POST /admin/realms/{realm}/organizations
❌ Get Organization: GET /admin/realms/{realm}/organizations/{id}
❌ Organization Members: GET /admin/realms/{realm}/organizations/{id}/members
```

**Application Endpoints** (UNCHANGED):

```typescript
// Existing tenant switching endpoint remains
PUT /auth/tenant - Switch current tenant for multi-tenant users
```

**Note**: Admin user-tenant management endpoints NOT included in this scope. Future enhancement: Users will be able to invite others to their tenants.

**Simplified Authentication Flow**:

```
Before (With Organizations):
1. User → OIDC Login → Keycloak
2. Keycloak → Callback with code
3. App → Exchange code for tokens (OIDC)
4. App → Fetch user orgs (Admin API) ← SLOW, O(n) calls
5. App → Fetch org details (Admin API) ← Multiple calls
6. App → Create Keycloak org if missing (Admin API)
7. App → Create local tenants
8. App → Sync user_tenants table
9. Redirect to dashboard

After (Simplified Auto-Provision):
1. User → OIDC Login → Keycloak
2. Keycloak → Callback with code
3. App → Exchange code for tokens (OIDC)
4. App → Create/update user from token claims
5. App → Check user_tenants (local DB)
6. If no tenants: Create personal tenant + user_tenants entry
7. Redirect to dashboard
```

### Alternatives Considered

| Alternative                                                  | Pros                                           | Cons                                                                                             | Why Not Chosen                                                                 |
| ------------------------------------------------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| **Keep Organizations, use custom token claims**              | Avoids Admin API calls during login            | Requires custom Keycloak mappers; still tight coupling; tenant creation still requires Admin API | Doesn't eliminate complexity or coupling; Organizations still unnecessary      |
| **Use Keycloak Groups instead of Organizations**             | More mature feature; widely documented         | Still requires Admin API; doesn't solve tight coupling; adds different complexity                | Replaces one problem with another; authorization should be app-managed         |
| **Keep Organizations, make keycloakOrganizationId nullable** | Less breaking change; allows gradual migration | Doesn't remove complexity or Admin API dependency; code remains                                  | Half-measure; doesn't achieve simplification goals                             |
| **Move to different IdP (Auth0, Okta)**                      | Potentially better features                    | Migration effort; licensing costs; still risks similar coupling                                  | Solves wrong problem; issue is architectural (using IdP for authZ), not vendor |
| **Build custom authentication**                              | Full control                                   | Security risk; reinventing wheel; high maintenance                                               | Keycloak OIDC works well; problem is overuse, not the tool itself              |

**Why Application-Managed Authorization Is Best**:

- Industry best practice (see Microsoft, AWS guidance in Research section)
- Already partially implemented (RLS, roles in database)
- Eliminates external dependency for business logic
- Simpler, faster, more reliable
- Aligns with "loose coupling" and "single responsibility" principles

---

## Layer 3: Technical Specification

### Architecture

#### Current Architecture (With Organizations)

```
┌─────────────────────────────────────────┐
│           Keycloak Realm                 │
│  ┌──────────────┐  ┌──────────────┐     │
│  │Organization A│  │Organization B│     │
│  │  - User 1    │  │  - User 2    │     │
│  └──────────────┘  └──────────────┘     │
│         ↑                  ↑             │
│         │ OIDC Auth        │ Admin API   │
└─────────┼──────────────────┼─────────────┘
          │                  │
          ↓                  ↓ (O(n) calls)
┌─────────────────────────────────────────┐
│         Antithesis Application           │
│  ┌─────────────────────────────────┐    │
│  │  Login Flow (SLOW)              │    │
│  │  1. OIDC token exchange         │    │
│  │  2. List ALL orgs (Admin API)   │    │
│  │  3. Check membership for each   │    │
│  │  4. Fetch org details           │    │
│  │  5. Sync user_tenants table     │    │
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │  Tenant Creation (COUPLED)      │    │
│  │  1. Create Keycloak org (Admin) │    │
│  │  2. Create local tenant         │    │
│  │  ↳ FAILS if Keycloak down       │    │
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │  Database                       │    │
│  │  - user_tenants (synced copy)   │    │
│  │  - tenants (keycloakOrgId req.) │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘

Issues: Tight coupling, O(n) API calls, cascade failures
```

#### Proposed Architecture (OIDC Only)

```
┌─────────────────────────────────────────┐
│           Keycloak Realm                 │
│         (OIDC Only)                      │
│         ↓ (1 token exchange)             │
└─────────┼───────────────────────────────┘
          │ OIDC Auth
          ↓
┌─────────────────────────────────────────┐
│         Antithesis Application           │
│  ┌─────────────────────────────────┐    │
│  │  Login Flow (FAST)              │    │
│  │  1. OIDC token exchange         │    │
│  │  2. Create/update user record   │    │
│  │  3. Query user_tenants (local)  │    │
│  │  4. Set currentTenantId         │    │
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │  Tenant Creation (DECOUPLED)    │    │
│  │  1. Create local tenant only    │    │
│  │  ↳ Works even if Keycloak down  │    │
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │  Admin UI (NEW)                 │    │
│  │  - Manage user-tenant access    │    │
│  │  - Assign/remove users          │    │
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │  Database (Source of Truth)     │    │
│  │  - user_tenants (authoritative) │    │
│  │  - tenants (no Keycloak dep.)   │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘

Benefits: Loose coupling, 1 API call, resilient, simpler
```

### Code Change Analysis

| Component                                                | Action                  | Justification                                                                                                                                              |
| -------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/services/keycloak-admin.service.ts`                 | **DELETE** (354 lines)  | Entire Admin API integration removed; no longer needed without Organizations                                                                               |
| `src/services/keycloak-admin.service.test.ts`            | **DELETE** (~200 lines) | Tests for deleted service                                                                                                                                  |
| `src/db/migrations/012_drop_keycloak_organization_id.ts` | **CREATE**              | Drop `keycloakOrganizationId` column and unique index following zero-downtime pattern                                                                      |
| `src/services/auth.service.ts`                           | **MODIFY**              | Remove lines 112-114 (Admin API call for orgs); remove `organizations` field from `UserClaims` interface                                                   |
| `src/services/user.service.ts`                           | **SIMPLIFY**            | Remove lines 37-61 (org sync loop); `syncUserFromKeycloak` only upserts user record                                                                        |
| `src/services/tenant.service.ts`                         | **REMOVE**              | Delete `findByKeycloakOrganizationId`, `ensureTenantForOrganization`, `createTenantWithExistingOrg` methods; simplify `createTenant` (remove org creation) |
| `src/controllers/auth.controller.ts`                     | **REMOVE**              | Delete lines 109-178 (auto-provisioning logic); simplify callback to just user sync + tenant lookup                                                        |
| `src/db/tenant.repository.ts`                            | **MODIFY**              | Remove `keycloakOrganizationId` from `CreateTenantData`, `UpdateTenantData` interfaces; delete `findByKeycloakOrganizationId` method                       |
| `src/lib/config.ts`                                      | **REMOVE**              | Delete `KEYCLOAK_ADMIN_CLIENT_ID` and `KEYCLOAK_ADMIN_CLIENT_SECRET` config fields (lines 164-174)                                                         |
| `infra/keycloak-init.sh`                                 | **SIMPLIFY**            | Remove lines 98-156 (admin client creation and role assignment); update final output                                                                       |
| `docker-compose.test.yml`                                | **MODIFY**              | Remove `KC_FEATURES: organizations` line; remove admin client env vars                                                                                     |
| `tests/helpers/keycloak.ts`                              | **MARK DEPRECATED**     | Keep file but mark org methods as deprecated; no longer used in app flow                                                                                   |
| `tests/e2e/multi-org.spec.ts`                            | **DELETE or REWRITE**   | Test Keycloak org sync - no longer relevant; could rewrite as multi-tenant test                                                                            |
| `src/integration/rls.integration.test.ts`                | **MODIFY**              | Remove `keycloakOrganizationId` from test tenant creation                                                                                                  |
| `src/services/tenant.service.test.ts`                    | **MODIFY**              | Remove org-related test cases                                                                                                                              |

### Code to Remove

#### Complete File Deletions

- **`src/services/keycloak-admin.service.ts`** (354 lines)
  - Why obsolete: No longer using Keycloak Admin API for organization management
  - What replaces it: Application-managed user-tenant relationships via `user_tenants` table
  - Migration path: Existing `user_tenants` data preserved; new assignments via Admin UI

- **`src/services/keycloak-admin.service.test.ts`** (~200 lines)
  - Why obsolete: Tests service that no longer exists
  - What replaces it: Tests for new admin endpoints in `user-tenants.controller.test.ts`

- **`tests/e2e/multi-org.spec.ts`**
  - Why obsolete: Tests Keycloak organization membership sync which no longer exists
  - What replaces it: Auto-provisioning tested in standard login E2E tests
  - Migration path: Delete entirely; no equivalent needed (solo-tenant model)

#### Partial Removals (Methods/Code Blocks)

- **`src/services/tenant.service.ts`**: Methods to delete
  - `findByKeycloakOrganizationId()` (lines 107-110) - No longer looking up by Keycloak org ID
  - `ensureTenantForOrganization()` (lines 120-169) - No longer creating tenants from org membership
  - `createTenantWithExistingOrg()` (lines 175-185) - No longer syncing existing orgs

- **`src/controllers/auth.controller.ts`**: Auto-provisioning logic
  - Lines 109-178 (70 lines) - Complex Keycloak org + tenant creation flow
  - Replacement: Simplified auto-provision (DB-only tenant + user_tenants entry, ~15 lines)

- **`src/services/user.service.ts`**: Organization sync
  - Lines 37-61 (25 lines) - Loop that fetches org details and ensures tenants exist
  - Replacement: Simple user record upsert from OIDC claims

- **`infra/keycloak-init.sh`**: Admin client setup
  - Lines 98-156 (58 lines) - Creates admin service account client and assigns roles
  - Replacement: N/A - only OIDC client needed

> **Decision**: No Admin UI for User-Tenant Management
> **Rationale**: Solo-tenant model means users get personal tenants automatically; multi-user tenants deferred to future "invite" feature
> **Alternative**: Admin management UI rejected - adds complexity for functionality not needed in current scope

### Implementation Approach

#### Phase 1: Database Migration (Single-Release)

Since this is a greenfield application with no production data, we can safely drop the column in a single release:

**Migration 012** - `src/db/migrations/012_drop_keycloak_organization_id.ts`:

```
up():
  1. DROP INDEX tenants_keycloak_organization_id_idx
  2. ALTER TABLE tenants DROP COLUMN keycloakOrganizationId

down():
  1. ALTER TABLE tenants ADD COLUMN keycloakOrganizationId varchar(255)
  2. CREATE UNIQUE INDEX tenants_keycloak_organization_id_idx
```

**Why safe**:

- No production data to protect (greenfield application)
- RLS policies use `user_tenants` table, not `keycloakOrganizationId`
- Migration and code deployed together
- Rollback possible via `down()` migration if needed

#### Phase 2: Service Layer Simplification

**Component: `src/services/auth.service.ts`**

Current logic (lines 112-114):

```
getUserOrganizations() → Admin API call
Return UserClaims with organizations array
```

New logic:

```
Return UserClaims with only keycloakUserId and email
No Admin API call
```

**Component: `src/services/user.service.ts`**

Current `syncUserFromKeycloak`:

```
1. Upsert user by Keycloak ID
2. For each org in claims:
   - Fetch org details (Admin API)
   - Ensure local tenant exists
3. Sync user_tenants table
```

New `syncUserFromKeycloak`:

```
1. Upsert user by Keycloak ID
2. Return user
(No org sync)
```

**Component: `src/services/tenant.service.ts`**

Current `createTenant`:

```
1. Check slug uniqueness
2. Create Keycloak organization (Admin API) ← FAILS if Keycloak down
3. Create local tenant with org ID
```

New `createTenant`:

```
1. Check slug uniqueness
2. Create local tenant
(No Keycloak call)
```

#### Phase 3: Controller Simplification

**Component: `src/controllers/auth.controller.ts` - Callback Handler**

Current flow:

```
1. Exchange code for tokens (OIDC)
2. Sync user + org memberships (Admin API calls)
3. If no tenants:
   - Auto-create Keycloak org (Admin API)
   - Create local tenant
   - Add user to org (Admin API)
   - Create user-tenant relationship
4. Determine current tenant
5. Redirect
```

New flow (Simplified Auto-Provision):

```
1. Exchange code for tokens (OIDC)
2. Sync user record (upsert from claims)
3. Check user_tenants table
4. If no tenants:
   - Generate tenant name from email ({username}-personal)
   - Create tenant in DB
   - Create user_tenants entry
5. Determine current tenant
6. Redirect
```

#### Phase 4: Configuration Cleanup

**Component: `src/lib/config.ts`**

Remove:

```
KEYCLOAK_ADMIN_CLIENT_ID: z.string()      ← DELETE
KEYCLOAK_ADMIN_CLIENT_SECRET: z.string()  ← DELETE
```

**Component: `.env.example`**

Update to show only OIDC client credentials (remove admin client vars)

#### Phase 5: Infrastructure Simplification

**Component: `infra/keycloak-init.sh`**

Remove admin client creation section (lines 98-156):

- No admin client needed
- No service account roles needed
- No elevated privileges required

**Component: `docker-compose.test.yml`**

Remove:

```
KC_FEATURES: organizations  ← Not needed anymore
KEYCLOAK_ADMIN_CLIENT_ID    ← DELETE
KEYCLOAK_ADMIN_CLIENT_SECRET ← DELETE
```

### Data Models

**No Changes to Database Tables** (except column removal):

- `users` table: UNCHANGED
- `tenants` table: Remove `keycloakOrganizationId` column
- `user_tenants` table: UNCHANGED (already authoritative)
- `roles` table: UNCHANGED
- `user_roles` table: UNCHANGED

**Session Data** (UNCHANGED):

```typescript
interface SessionData {
  userId: string;
  currentTenantId: string;
  oauthState?: string; // CSRF state
  returnTo?: string; // Post-login redirect
}
```

**Authentication Claims** (SIMPLIFIED):

```typescript
// BEFORE:
interface UserClaims {
  keycloakUserId: string;
  email: string;
  organizations: string[];  ← REMOVED
}

// AFTER:
interface UserClaims {
  keycloakUserId: string;
  email: string;
}
```

### Security

**Authentication** (UNCHANGED):

- OIDC standard flows (Authorization Code grant)
- CSRF protection via state parameter
- HttpOnly, Secure cookies in production
- Session expiry (configurable)

**Authorization** (ENHANCED):

- Application-managed RBAC using `roles`, `user_roles` tables
- New `requireRole` middleware for admin endpoints
- RLS policies continue using `user_tenants` table
- No change to existing RLS enforcement

**Credential Management** (SIMPLIFIED):

- **Before**: OIDC client secret + Admin client secret (2 secrets to rotate)
- **After**: OIDC client secret only (1 secret)

**Privilege Reduction**:

- **Before**: Admin client needed `manage-users`, `view-users` realm-management roles
- **After**: No elevated Keycloak privileges required

### Testing Strategy

#### Unit Tests

**New Tests**:

- `user-tenants.controller.test.ts`: Admin endpoints for user-tenant management
- Updated `auth.service.test.ts`: Remove org fetch mocks
- Updated `user.service.test.ts`: Simplify sync tests (no org loop)
- Updated `tenant.service.test.ts`: Remove org creation tests

**Deleted Tests**:

- `keycloak-admin.service.test.ts`: Service no longer exists

#### Integration Tests

**Modified Tests**:

- `src/integration/auth.integration.test.ts`:
  - Remove org sync assertions
  - Test simplified login flow
- `src/integration/rls.integration.test.ts`:
  - Remove `keycloakOrganizationId` from tenant creation
  - Verify RLS still works (uses `user_tenants`, not org ID)

#### E2E Tests

**Deleted**:

- `tests/e2e/multi-org.spec.ts`: Delete entirely (org sync no longer exists)
- `tests/helpers/keycloak.ts`: Delete org-related methods (`createOrganization`, `assignUserToOrg`, `deleteOrganization`)

**Simplified**:

- All E2E tests: Just login → auto-provision happens automatically
- No manual test data setup required (no `user_tenants` inserts needed)
- Example:
  ```typescript
  test('user can access dashboard', async () => {
    await page.goto('/auth/login');
    // Login happens → tenant auto-created
    await expect(page).toHaveURL('/dashboard');
  });
  ```

### Rollout Plan

#### Single-Release Deployment

**Pre-Deployment**:

1. Code review and approval
2. All tests pass locally

**Deployment**:

1. Deploy code + migration 012 together
2. Migration automatically:
   - Drops `keycloakOrganizationId` unique index
   - Drops `keycloakOrganizationId` column
3. Verify:
   - Migration succeeded
   - Login flow works (auto-provisions personal tenant)
   - Tenant creation works without Keycloak

**Post-Deployment Cleanup** (Optional):

1. Manually delete admin client from Keycloak console (not critical)
2. Remove Organizations feature flag from Keycloak if desired

#### Rollback (If Needed)

If critical issues arise:

1. Revert code deployment
2. Run migration down: `npm run db:migrate:down`
3. Column restored (nullable), previous code works

**Note**: Rollback unlikely to be needed since this is greenfield application with no production traffic.

---

## Implementation Metrics

### Lines of Code Removed

| Component                        | Lines Removed |
| -------------------------------- | ------------- |
| `keycloak-admin.service.ts`      | 354           |
| `keycloak-admin.service.test.ts` | ~200          |
| Auth controller (auto-provision) | 70            |
| User service (org sync)          | 25            |
| Tenant service (org methods)     | 65            |
| Auth service (org fetch)         | 5             |
| Test helper (org methods)        | ~150          |
| Setup script (admin client)      | 58            |
| Config (admin client vars)       | 12            |
| Test assertions (org-related)    | ~50           |
| **Total Removed**                | **~989**      |

### Performance Improvement

| Metric                       | Before                      | After                     |
| ---------------------------- | --------------------------- | ------------------------- |
| Login API calls              | 1 (OIDC) + n+1 (Admin API)  | 1 (OIDC) only             |
| Tenant creation dependencies | Requires Keycloak available | Local DB only (resilient) |
| Auto-provision complexity    | Keycloak org + local tenant | Local tenant only         |

_Note: Detailed performance measurement out of scope for this change_

### Operational Benefits

- **Keycloak Privileges**: Standard OIDC client (no realm-management roles)
- **Setup Complexity**: 58 fewer lines in init script
- **Configuration**: 2 fewer secrets to manage
- **Feature Flags**: Don't need `KC_FEATURES: organizations`
- **Monitoring**: Fewer external API calls to track

---

## Risk Assessment

### Low Risk

✅ **Data Loss**: Greenfield application, no production data to protect
✅ **OIDC Authentication**: No changes to working OIDC flow
✅ **RLS Enforcement**: Already uses `user_tenants`, not Keycloak org ID
✅ **Auto-Provision**: Simplified version (DB-only) less complex than Keycloak org approach
✅ **Rollback**: Migration `down()` restores column if needed

### Mitigations

- Thoroughly test auto-provision logic (tenant naming, user_tenants creation)
- Verify RLS policies still work after column removal
- Test login flow with new users (should get personal tenant)
- No monitoring/metrics added (keeps change focused)

---

## Summary of Key Decisions

Based on feedback, this design has been refined with the following key decisions:

### 1. **Auto-Provision Personal Tenants** ✅

- Keep auto-provisioning but simplified (DB-only, no Keycloak org)
- Generate tenant name: `{username}-personal` from user email
- Eliminates need for admin UI to assign users

### 2. **Solo-Tenant Model** ✅

- Each user gets their own personal tenant on first login
- Multi-user tenants deferred to future "invite" feature
- No admin user-tenant management needed in this scope

### 3. **Single-Release Deployment** ✅

- Deploy code + migration together (greenfield application)
- No phased rollout complexity needed
- No production data migration concerns

### 4. **No Metrics/Monitoring** ✅

- Keep implementation focused on functional changes
- Performance measurement out of scope
- No additional monitoring complexity

### 5. **Simplified Testing** ✅

- Tests just login → auto-provision happens
- Delete Keycloak org helper methods entirely
- No manual test data setup required

### 6. **Documentation Minimal** ✅

- Remove KC org mentions from existing docs
- Document DB-only tenant system
- No migration guides or communication plans needed
