# Design: Keycloak Organizations Authentication Integration

## Layer 1: Problem & Requirements

### Problem Statement

The Antithesis application needs user authentication to secure access and associate users with their respective tenants. Currently, there is no authentication mechanism, leaving the application open and unable to:

- Verify user identity before granting access
- Associate users with tenants for proper multi-tenant data isolation
- Track who performed actions for audit logging
- Provide login/logout flows for users
- Maintain user sessions across requests

Keycloak Organizations provides a modern approach to managing multi-tenant authentication where each tenant corresponds to a Keycloak Organization. This enables centralized identity management while maintaining tenant isolation at the authentication level.

### Current State

**What Exists:**

- Multi-tenant infrastructure with `tenants` table (src/db/migrations/001_create_tenants_table.ts:16-24)
- Tenant model with `externalReferenceId` field for external system integration (src/db/tenant.repository.ts:9-22)
- TenantScoped base class for tenant-aware services (src/lib/TenantScoped.ts:26-42)
- HTTP framework with middleware support (src/lib/http/middleware.ts:106-121)
- EJS view rendering with global context (route, config, user placeholder) (src/lib/http/endpoint.ts:186-197)
- Session management placeholder in view context (user: null currently)
- Separate API servers for Public, Admin, and Meta APIs (src/index.ts:47-96)

**Pain Points:**

- No authentication mechanism - all endpoints are public
- No user database table - cannot track users
- No session management - cannot maintain login state
- No login/logout UI flows - users cannot authenticate
- No middleware to protect endpoints requiring authentication
- View templates reference `user` context variable but it's always null
- No way to associate users with tenants
- No authorization framework (permissions/roles)

### Requirements

#### Functional

- REQ-001: The system SHALL integrate with Keycloak Organizations for authentication
- REQ-002: Each tenant SHALL map to a Keycloak Organization via `keycloakOrganizationId` field
- REQ-003: The system SHALL maintain a `users` table with fields: id, email, keycloakUserId, createdAt, updatedAt
- REQ-004: The system SHALL support OpenID Connect (OIDC) authentication flow with Keycloak
- REQ-005: WHEN a user logs in THEN the system SHALL create/update user record with Keycloak ID
- REQ-006: The system SHALL maintain user sessions using express-session with Redis storage
- REQ-007: The system SHALL provide login redirect endpoint that initiates OIDC flow
- REQ-008: The system SHALL provide callback endpoint that handles OIDC response
- REQ-009: The system SHALL provide logout endpoint that clears session and redirects to Keycloak logout
- REQ-010: The system SHALL provide authentication middleware to protect routes
- REQ-011: WHEN authentication middleware encounters unauthenticated user THEN redirect to login
- REQ-012: The system SHALL populate `user` context variable in views with authenticated user data
- REQ-013: The system SHALL display user authentication status in existing views (header/dashboard)
- REQ-014: The system SHALL use Keycloak Admin REST API to manage organizations programmatically
- REQ-015: Keycloak Admin API client credentials (client_id/client_secret) SHALL be stored in environment variables
- REQ-016: The system SHALL synchronize Keycloak organization ID when creating tenants
- REQ-017: User-tenant relationships SHALL be determined via Keycloak organization membership
- REQ-018: The system SHALL fetch Keycloak organization membership via UserInfo endpoint after authentication
- REQ-018a: User-tenant relationships SHALL be automatically synchronized from Keycloak on every login
- REQ-018b: Keycloak is the source of truth for user-tenant associations
- REQ-019: Authorization (roles/permissions) SHALL remain in application database, not Keycloak
- REQ-020: The system SHALL create many-to-many relationship between users and tenants
- REQ-021: The session SHALL store current tenant ID for multi-tenant users
- REQ-022: Multi-tenant users SHALL default to last accessed tenant on login
- REQ-023: The system SHALL provide API endpoint to switch current tenant
- REQ-024: WHEN Keycloak organization creation fails THEN tenant creation SHALL fail and rollback
- REQ-025: The system SHALL implement code-defined roles with database storage
- REQ-026: The system SHALL provide many-to-many relationship between users and roles

#### Non-Functional

- Security: Session cookies must be httpOnly and secure in production
- Security: CSRF protection for state parameter in OIDC flow
- Security: Keycloak Admin API client credentials must never be exposed to clients or logged
- Security: User passwords managed entirely by Keycloak, never stored locally
- Performance: Session data cached in Redis for fast lookup
- Performance: Token validation should use Keycloak's JWKS endpoint
- Usability: Login flow should be seamless with clear error messages
- Usability: User authentication status should be visible in existing views
- Compatibility: Must work with externally managed Keycloak realm
- Compatibility: Must support Keycloak Organizations feature
- Maintainability: Keycloak integration should be modular and testable

### Constraints

- Keycloak realm is externally managed (provided by user)
- Admin API client credentials provided but Keycloak server not under our control
- Must use Keycloak Organizations (not groups or clients)
- Roles and permissions stored in app database, not Keycloak
- Keycloak only handles authentication, not authorization
- Must integrate with existing multi-tenant architecture
- Development environment runs in Docker
- No breaking changes to existing tenant system
- PostgreSQL-specific database schema

### Success Criteria

- User can click "Login" and be redirected to Keycloak
- Keycloak authenticates user and redirects back to application
- User session is created and maintained across requests
- Protected routes redirect unauthenticated users to login
- Dashboard/header displays user login status and email
- User can logout and session is destroyed
- New users are automatically created in database on first login
- Tenants can be associated with Keycloak Organizations
- Application can manage Keycloak Organizations via Admin API
- Existing tenant functionality continues to work unchanged

## Layer 2: Functional Specification

### User Workflows

1. **User Login Flow**
   - User navigates to protected page (e.g., /dashboard)
   - Middleware detects no session, redirects to /auth/login
   - Application redirects to Keycloak with OIDC authorization request
   - User authenticates with Keycloak
   - Keycloak redirects to /auth/callback with authorization code
   - Application exchanges code for tokens
   - Application extracts user info from ID token
   - Application creates/updates user in database
   - Application creates session with user ID
   - Application redirects to original destination or home
   - User sees protected content

2. **User Logout Flow**
   - User clicks logout button
   - Request sent to /auth/logout
   - Application destroys session
   - Application redirects to Keycloak logout endpoint
   - Keycloak terminates SSO session
   - Keycloak redirects to application home page
   - User is logged out

3. **Tenant-Organization Provisioning**
   - Admin creates new tenant via Admin API
   - System calls Keycloak Admin API to create Organization
   - System stores Keycloak Organization ID in tenant record
   - Tenant is now linked to Keycloak Organization
   - If Keycloak organization creation fails, entire operation fails and rolls back

4. **User-Tenant Association (Auto-Sync on Login)**
   - User belongs to Keycloak Organization(s)
   - User logs in, callback receives tokens
   - Application calls Keycloak UserInfo endpoint
   - UserInfo response contains organization membership data
   - Application looks up tenant(s) by keycloakOrganizationId
   - Application synchronizes user_tenants table (add new, remove old)
   - Application sets currentTenantId in session (defaults to last accessed or first available)
   - User is associated with their current tenants from Keycloak

5. **Tenant Switching**
   - User with multiple tenants clicks tenant switcher
   - Frontend calls PUT /auth/tenant endpoint with new tenant ID
   - Backend validates user has access to tenant
   - Backend updates session.currentTenantId
   - Subsequent requests use new tenant context

### External Interfaces

**Keycloak OIDC Endpoints:**

```
Authorization: https://{KEYCLOAK_URL}/realms/{REALM}/protocol/openid-connect/auth
Token: https://{KEYCLOAK_URL}/realms/{REALM}/protocol/openid-connect/token
Logout: https://{KEYCLOAK_URL}/realms/{REALM}/protocol/openid-connect/logout
UserInfo: https://{KEYCLOAK_URL}/realms/{REALM}/protocol/openid-connect/userinfo
JWKS: https://{KEYCLOAK_URL}/realms/{REALM}/protocol/openid-connect/certs
```

**Keycloak Admin API Endpoints:**

```
List Organizations: GET /admin/realms/{realm}/organizations
Create Organization: POST /admin/realms/{realm}/organizations
Get Organization: GET /admin/realms/{realm}/organizations/{id}
Update Organization: PUT /admin/realms/{realm}/organizations/{id}
Delete Organization: DELETE /admin/realms/{realm}/organizations/{id}
List Members: GET /admin/realms/{realm}/organizations/{id}/members
Add Member: POST /admin/realms/{realm}/organizations/{id}/members
```

**Application Endpoints:**

```typescript
// Authentication routes (Public API)
GET /auth/login - Initiate OIDC login flow
GET /auth/callback - Handle OIDC callback
GET /auth/logout - Logout and destroy session
PUT /auth/tenant - Switch current tenant for multi-tenant users

// Session data structure in views
{
  user: {
    id: string;              // Internal user ID
    email: string;           // User email from Keycloak
    keycloakUserId: string;  // Keycloak subject (sub claim)
    currentTenantId: string; // Current active tenant
  } | null
}
```

> **Decision**: Use UserInfo endpoint for organization membership
> **Rationale**: Simplest and most straightforward approach, avoids need for custom token mappers
> **Alternative**: Custom claims in ID token rejected due to Keycloak configuration complexity

> **Decision**: Auto-sync user-tenant relationships on every login
> **Rationale**: Keycloak is source of truth for access control, ensures immediate propagation of access changes
> **Alternative**: Manual management rejected due to potential drift from Keycloak state

> **Decision**: Session stores currentTenantId, defaults to last accessed
> **Rationale**: Balances UX (remembers user preference) with simplicity (no tenant selection screen required)
> **Alternative**: Tenant selection screen rejected as unnecessarily complex for initial implementation

### Infrastructure Configuration (Crossplane)

The Keycloak realm, clients, and protocol mappers are configured using **Crossplane** with a GitOps approach. This infrastructure-as-code setup ensures consistent configuration across environments and eliminates manual Keycloak administration console configuration.

**Approach:**

- **Crossplane Provider**: Uses `provider-keycloak` v1.5.0 to manage Keycloak resources as Kubernetes CRDs
- **Helm Chart**: Declarative configuration in `chart/` directory packages all Keycloak resources
- **GitOps Workflow**: Helm chart deployed to Kubernetes cluster, Crossplane reconciles resources with Keycloak
- **Secret Management**: Client secrets automatically generated by Crossplane and stored in Kubernetes Secrets

**Resources Created:**

1. **Realm**: Keycloak realm (e.g., `antithesis` or `antithesis-dev`)
   - Configured session timeouts
   - Email verification settings (environment-specific)
   - Registration policies (environment-specific)

2. **OIDC Client** (`antithesis-app`):
   - Access Type: `confidential`
   - Standard Flow Enabled: `true` (for authorization code flow)
   - Service Accounts Enabled: `false`
   - Configured redirect URIs, post-logout URIs, web origins
   - Secret stored in Kubernetes Secret: `antithesis-oidc-credentials`

3. **Admin Client** (`antithesis-admin`):
   - Access Type: `confidential`
   - Service Accounts Enabled: `true` (for client_credentials grant)
   - Standard Flow Enabled: `false`
   - Secret stored in Kubernetes Secret: `antithesis-admin-credentials`

4. **Protocol Mappers**:
   - **Email Mapper**: Maps Keycloak email to token claims
   - **Organizations Mapper**: Maps organization membership to UserInfo endpoint (`organizations` claim)

**Configuration Files:**

```
chart/
├── Chart.yaml                              # Helm chart metadata
├── values.yaml                             # Default configuration
├── values-dev.yaml                         # Development overrides (localhost, relaxed settings)
├── values-prod.yaml                        # Production overrides (requires domain configuration)
├── README.md                               # Comprehensive chart documentation
├── INSTALL.md                              # Step-by-step installation guide
├── .helmignore                             # Files excluded from packaging
└── templates/
    ├── NOTES.txt                           # Post-install instructions
    ├── realm.yaml                          # Crossplane Realm resource
    ├── client-oidc.yaml                    # OIDC client for user authentication
    ├── client-admin.yaml                   # Service account client for Admin API
    ├── protocol-mapper-email.yaml          # Email claim mapper
    └── protocol-mapper-organizations.yaml  # Organizations claim mapper
```

**Deployment Workflow:**

1. Install Crossplane and `provider-keycloak` v1.5.0 in Kubernetes cluster
2. Create `ProviderConfig` with Keycloak admin credentials
3. Deploy Helm chart: `helm install antithesis-keycloak ./chart -f chart/values-dev.yaml`
4. Crossplane creates/updates resources in Keycloak realm
5. Extract client secrets from Kubernetes Secrets
6. Update application `.env` with extracted secrets
7. Configure service account roles in Keycloak Admin Console (one-time manual step)

**Environment-Specific Configuration:**

- **Development** (`values-dev.yaml`):
  - Realm: `antithesis-dev`
  - Redirect URIs: `http://localhost:3000/*`
  - Allow self-registration
  - No email verification required
  - Permissive CORS (allow all origins)

- **Production** (`values-prod.yaml`):
  - Realm: `antithesis`
  - Redirect URIs: `https://antithesis.example.com/auth/callback` (must be configured)
  - Self-registration disabled
  - Email verification required
  - Strict CORS (specific origins only)

> **Decision**: Use Crossplane for Keycloak configuration instead of manual setup
> **Rationale**: Infrastructure-as-code ensures consistency, enables GitOps workflows, eliminates manual configuration errors, supports environment-specific overrides
> **Alternative**: Manual Keycloak Admin Console configuration rejected due to error-prone nature, lack of version control, difficulty maintaining consistency across environments

> **Decision**: Service account client needs manual role configuration in Keycloak Console
> **Rationale**: Crossplane provider-keycloak v1.5.0 doesn't support service account role assignment via CRDs, requires one-time manual configuration
> **Alternative**: Scripted role assignment via Admin API rejected to keep infrastructure declarative and avoid imperative configuration steps

**Database Schema:**

```typescript
// New users table
interface Users {
  id: string; // UUID primary key
  email: string; // Unique email from Keycloak
  keycloakUserId: string; // Unique Keycloak subject ID
  createdAt: Date;
  updatedAt: Date;
}

// Updated tenants table
interface Tenants {
  id: string;
  name: string;
  slug: string;
  externalReferenceId: string | null; // For external services (Stripe, etc.) - unrelated to Keycloak
  keycloakOrganizationId: string | null; // NEW: Keycloak Organization ID
  createdAt: Date;
  updatedAt: Date;
}

// New user_tenants junction table (many-to-many)
interface UserTenants {
  userId: string; // FK to users.id
  tenantId: string; // FK to tenants.id
  createdAt: Date;
}

// New roles table (code-defined roles with database storage)
interface Roles {
  id: string; // UUID primary key
  name: string; // Unique role name (e.g., 'admin', 'user', 'viewer')
  createdAt: Date;
  updatedAt: Date;
}

// New user_roles junction table (many-to-many)
interface UserRoles {
  userId: string; // FK to users.id
  roleId: string; // FK to roles.id
  tenantId: string; // FK to tenants.id (roles are tenant-scoped)
  createdAt: Date;
}
```

> **Decision**: externalReferenceId is unrelated to Keycloak integration
> **Rationale**: Field is for external services like Stripe, serves different purpose than keycloakOrganizationId
> **Alternative**: Removing or migrating externalReferenceId rejected as it serves legitimate non-auth purpose

**Environment Variables:**

```bash
# Keycloak OIDC Configuration
KEYCLOAK_URL=https://keycloak.example.com
KEYCLOAK_REALM=antithesis
KEYCLOAK_CLIENT_ID=antithesis-app
KEYCLOAK_CLIENT_SECRET=secret

# Keycloak Admin API Configuration (service account client)
KEYCLOAK_ADMIN_CLIENT_ID=antithesis-admin
KEYCLOAK_ADMIN_CLIENT_SECRET=admin-client-secret

# Session Configuration
SESSION_SECRET=random-secret-key
SESSION_MAX_AGE=86400000  # 24 hours in milliseconds
```

**Session Configuration:**

```typescript
// Express session with Redis store (using existing Redis infrastructure)
const sessionRedisClient = await Redis.getClient('sessions'); // Non-tenant-scoped

session({
  store: new RedisStore({ client: sessionRedisClient }),
  secret: config.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: config.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: config.SESSION_MAX_AGE,
    sameSite: 'lax',
  },
});
```

> **Decision**: Use existing Redis infrastructure with non-tenant-scoped client
> **Rationale**: Follows established Redis.getClient() pattern, sessions are inherently global (not tenant-specific)
> **Alternative**: Separate Redis connection rejected to maintain consistency with existing infrastructure

> **Decision**: Fail tenant creation if Keycloak organization creation fails
> **Rationale**: Ensures consistency between application and Keycloak state, prevents auth-less tenants
> **Alternative**: Deferred sync rejected due to complexity of managing inconsistent state

> **Decision**: Use client credentials (service account) for Keycloak Admin API authentication
> **Rationale**: More secure than user credentials, realm-scoped instead of master realm, follows OAuth2 service account best practices, easier permission management
> **Alternative**: Admin user/password rejected due to security risks and unnecessary master realm access
> **Setup Required**: Create service account client in Keycloak realm with:
>
> - Client ID: `antithesis-admin` (configurable)
> - Access Type: `confidential`
> - Service Accounts Enabled: `ON`
> - Required Service Account Roles: Organization management permissions (e.g., `manage-users`, org-specific roles)

### Alternatives Considered

| Option                                       | Pros                                             | Cons                                                      | Why Not Chosen                                    |
| -------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------- | ------------------------------------------------- |
| Use Keycloak Groups instead of Organizations | More mature feature, widely documented           | Doesn't align with tenant model as cleanly, less semantic | Organizations are purpose-built for multi-tenancy |
| Store roles in Keycloak                      | Centralized auth + authz, single source of truth | Less flexible, harder to customize, tight coupling        | Requirement specifies app-managed authorization   |
| Use JWT instead of sessions                  | Stateless, scalable                              | Cannot revoke tokens, larger payload, complexity          | Sessions simpler for initial implementation       |
| Passport.js for OIDC                         | Well-established library, many strategies        | Heavy dependency, opinionated structure                   | openid-client is lighter and more direct          |
| Local user/password auth                     | Simpler initial implementation                   | Doesn't leverage Keycloak, defeats purpose                | Requirement specifies Keycloak integration        |
| User-tenant via custom claims                | Centralized in Keycloak                          | Requires custom Keycloak extensions                       | Application-managed is more flexible              |

## Layer 3: Technical Specification

### Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        Keycloak Realm                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │Organization A│  │Organization B│  │Organization C│       │
│  │  - User 1    │  │  - User 2    │  │  - User 1    │       │
│  │  - User 3    │  │  - User 4    │  │  - User 5    │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│         ▲                  ▲                  ▲              │
│         │                  │                  │              │
│         │ OIDC Auth        │ Admin API        │              │
└─────────┼──────────────────┼──────────────────┼──────────────┘
          │                  │                  │
          ▼                  ▼                  ▼
┌──────────────────────────────────────────────────────────────┐
│                     Antithesis Application                    │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                  Public API Server                      │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │  │
│  │  │Auth Routes   │  │Auth Middleware│  │Dashboard     │ │  │
│  │  │/auth/login   │  │requireAuth()  │  │/dashboard    │ │  │
│  │  │/auth/callback│  │populateUser() │  │(protected)   │ │  │
│  │  │/auth/logout  │  │               │  │              │ │  │
│  │  │/auth/session │  │               │  │              │ │  │
│  │  └──────┬───────┘  └───────┬───────┘  └──────────────┘ │  │
│  └─────────┼──────────────────┼────────────────────────────┘  │
│            │                  │                               │
│  ┌─────────▼──────────────────▼────────────────────────────┐  │
│  │                    Session Management                    │  │
│  │  - Express Session + Redis Store                         │  │
│  │  - User session data (id, email, keycloakUserId)         │  │
│  └────────────────────────┬─────────────────────────────────┘  │
│                           │                                    │
│  ┌────────────────────────▼─────────────────────────────────┐  │
│  │                  Auth Service Layer                      │  │
│  │  - OIDC client (openid-client)                           │  │
│  │  - Token validation                                      │  │
│  │  - User sync (Keycloak → Database)                       │  │
│  └────────────────────────┬─────────────────────────────────┘  │
│                           │                                    │
│  ┌────────────────────────▼─────────────────────────────────┐  │
│  │              Keycloak Admin Service                      │  │
│  │  - Admin client authentication                           │  │
│  │  - Organization CRUD operations                          │  │
│  │  - Tenant ↔ Organization sync                            │  │
│  └────────────────────────┬─────────────────────────────────┘  │
│                           │                                    │
│            ┌──────────────┴──────────────┐                     │
│            ▼                             ▼                     │
│  ┌──────────────────┐         ┌──────────────────┐            │
│  │  User Repository │         │Tenant Repository │            │
│  │  - users table   │         │- tenants table   │            │
│  │  - CRUD ops      │         │- + kcOrgId field │            │
│  └────────┬─────────┘         └─────────┬────────┘            │
│           │                             │                     │
│           ▼                             ▼                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    PostgreSQL Database                    │  │
│  │  - users                                                  │  │
│  │  - tenants (+ keycloakOrganizationId)                     │  │
│  │  - user_tenants (junction)                                │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                      Redis Cache                          │  │
│  │  - Session storage                                        │  │
│  └───────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

**Authentication Flow:**

1. User → /dashboard → Auth Middleware → No session → Redirect /auth/login
2. /auth/login → Generate state → Store in session → Redirect Keycloak
3. User authenticates at Keycloak
4. Keycloak → /auth/callback?code=...&state=...
5. Callback validates state → Exchange code for tokens
6. Extract user info from ID token → Sync user to database
7. Create session with user ID → Redirect /dashboard
8. Dashboard renders with user context

**Organization Sync Flow:**

1. Admin → Create Tenant via Admin API
2. Tenant Service → Keycloak Admin Service
3. Admin Service → Authenticate with client credentials (service account)
4. Admin Service → POST /admin/realms/{realm}/organizations
5. Keycloak → Returns organization ID
6. Tenant Service → Save tenant with keycloakOrganizationId
7. Tenant created and linked to Keycloak Organization

### Code Change Analysis

| Component                                                     | Action    | Justification                                                                     |
| ------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------- |
| src/db/migrations/002_add_keycloak_organization_to_tenants.ts | Create    | Add keycloakOrganizationId column to tenants table                                |
| src/db/migrations/003_create_users_table.ts                   | Create    | New users table for authentication                                                |
| src/db/migrations/004_create_user_tenants_table.ts            | Create    | Many-to-many user-tenant relationships                                            |
| src/db/migrations/005_create_roles_table.ts                   | Create    | Code-defined roles with database storage                                          |
| src/db/migrations/006_create_user_roles_table.ts              | Create    | Many-to-many user-role relationships (tenant-scoped)                              |
| src/lib/db/types.ts                                           | Extend    | Regenerate with kysely-codegen after migrations                                   |
| src/db/user.repository.ts                                     | Create    | User CRUD operations                                                              |
| src/db/user-tenant.repository.ts                              | Create    | User-tenant relationship management with sync logic                               |
| src/db/role.repository.ts                                     | Create    | Role CRUD operations                                                              |
| src/db/user-role.repository.ts                                | Create    | User-role assignment operations                                                   |
| src/services/user.service.ts                                  | Create    | User business logic with tenant sync from Keycloak                                |
| src/services/auth.service.ts                                  | Create    | OIDC authentication logic with UserInfo endpoint calls                            |
| src/services/keycloak-admin.service.ts                        | Create    | Keycloak Admin API client with organization management                            |
| src/services/role.service.ts                                  | Create    | Role management with code-defined role seeding                                    |
| src/services/tenant.service.ts                                | Extend    | Add organization sync with fail-fast error handling                               |
| src/controllers/auth.controller.ts                            | Create    | Login, callback, logout, tenant switching endpoints                               |
| src/lib/http/middleware/auth.middleware.ts                    | Create    | requireAuth() and populateUser() middleware                                       |
| src/lib/config.ts                                             | Extend    | Add Keycloak and session configuration                                            |
| src/index.ts                                                  | Extend    | Add session middleware with Redis.getClient('sessions'), register auth controller |
| views/partials/header.ejs                                     | Extend    | Display user email and login/logout links                                         |
| views/pages/dashboard.ejs                                     | Extend    | Display current tenant and user info                                              |
| package.json                                                  | Extend    | Add openid-client, express-session, connect-redis                                 |
| docker-compose.yml                                            | No change | Existing Redis used for session storage                                           |

### Code to Remove

**None** - This is purely additive functionality.

### Implementation Approach

#### Components

**src/db/migrations/002_add_keycloak_organization_to_tenants.ts**

- Add nullable keycloakOrganizationId column to tenants table
- Create unique index on keycloakOrganizationId
- Example logic:

  ```
  up(db):
    alter table tenants add column keycloakOrganizationId varchar(255) null
    create unique index tenants_keycloak_organization_id_idx on tenants(keycloakOrganizationId)

  down(db):
    drop index tenants_keycloak_organization_id_idx
    alter table tenants drop column keycloakOrganizationId
  ```

**src/db/migrations/003_create_users_table.ts**

- Create users table with id, email, keycloakUserId, timestamps
- Unique constraints on email and keycloakUserId
- Example logic:

  ```
  up(db):
    create table users:
      id uuid primary key default gen_random_uuid()
      email varchar(255) not null unique
      keycloakUserId varchar(255) not null unique
      createdAt timestamp not null default now()
      updatedAt timestamp not null default now()

    create index users_email_idx on users(email)
    create index users_keycloak_user_id_idx on users(keycloakUserId)

  down(db):
    drop table users
  ```

**src/db/migrations/004_create_user_tenants_table.ts**

- Create junction table for many-to-many relationships
- Foreign keys to users and tenants
- Composite unique constraint on (userId, tenantId)
- Example logic:

  ```
  up(db):
    create table user_tenants:
      userId uuid not null references users(id) on delete cascade
      tenantId uuid not null references tenants(id) on delete cascade
      createdAt timestamp not null default now()
      primary key (userId, tenantId)

  down(db):
    drop table user_tenants
  ```

**src/db/user.repository.ts**

- Follows pattern from tenant.repository.ts
- findByKeycloakUserId(), findByEmail(), create(), update()
- Uses Kysely query builder
- Example logic:

  ```
  class UserRepository:
    async findByKeycloakUserId(keycloakUserId):
      return db.selectFrom('users')
        .where('keycloakUserId', '=', keycloakUserId)
        .selectAll()
        .executeTakeFirst()

    async upsertByKeycloakId(data):
      existing = await findByKeycloakUserId(data.keycloakUserId)
      if existing:
        return update(existing.id, data)
      else:
        return create(data)
  ```

**src/services/auth.service.ts**

- Uses openid-client library
- Discovers OIDC endpoints from Keycloak
- Generates authorization URL with state parameter
- Exchanges authorization code for tokens
- Validates ID token
- Extracts user claims
- Example logic:

  ```
  class AuthService:
    oidcClient: Issuer.Client

    async initialize():
      issuer = await Issuer.discover(KEYCLOAK_URL/realms/REALM)
      this.oidcClient = new issuer.Client({
        client_id: config.KEYCLOAK_CLIENT_ID,
        client_secret: config.KEYCLOAK_CLIENT_SECRET,
        redirect_uris: [config.PUBLIC_API_URL + '/auth/callback']
      })

    generateAuthUrl(state):
      return oidcClient.authorizationUrl({
        scope: 'openid email profile',
        state: state
      })

    async handleCallback(code, state):
      tokenSet = await oidcClient.callback(redirectUri, { code }, { state })
      claims = tokenSet.claims()

      // Fetch organization membership from UserInfo endpoint
      userInfo = await oidcClient.userinfo(tokenSet.access_token)

      return {
        keycloakUserId: claims.sub,
        email: claims.email,
        organizations: userInfo.organizations || [] // From UserInfo endpoint
      }
  ```

**src/services/keycloak-admin.service.ts**

- Authenticates with service account client credentials
- Manages access token refresh
- CRUD operations for organizations
- Example logic:

  ```
  class KeycloakAdminService:
    adminToken: string

    async authenticate():
      // Use client_credentials grant with service account in realm
      response = await fetch(KEYCLOAK_URL/realms/REALM/protocol/openid-connect/token, {
        method: 'POST',
        body: {
          grant_type: 'client_credentials',
          client_id: config.KEYCLOAK_ADMIN_CLIENT_ID,
          client_secret: config.KEYCLOAK_ADMIN_CLIENT_SECRET
        }
      })
      this.adminToken = response.access_token

    async createOrganization(name, domains):
      await ensureAuthenticated()
      response = await fetch(KEYCLOAK_URL/admin/realms/REALM/organizations, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + adminToken },
        body: JSON.stringify({ name, domains })
      })
      return response.id

    async getOrganization(organizationId):
      await ensureAuthenticated()
      return fetch(KEYCLOAK_URL/admin/realms/REALM/organizations/{organizationId})
  ```

**src/controllers/auth.controller.ts**

- Four endpoints: login, callback, logout, tenant switching
- Uses auth.service for OIDC operations
- Manages session creation/destruction and tenant context
- Example logic:

  ```
  authController = controller('/auth').endpoints([

    // Initiate login
    get('/login').handler(async (input, req, res) => {
      state = generateRandomState()
      req.session.oauthState = state
      req.session.returnTo = req.query.returnTo || '/'
      authUrl = authService.generateAuthUrl(state)
      res.redirect(authUrl)
    }),

    // Handle callback
    get('/callback').handler(async (input, req, res) => {
      validate state matches session
      userClaims = await authService.handleCallback(code, state)

      // Sync user and tenant relationships from Keycloak
      user = await userService.syncUserFromKeycloak(userClaims)

      // Set session data
      req.session.userId = user.id

      // Determine current tenant (last accessed or first available)
      tenants = await userTenantRepository.findTenantsForUser(user.id)
      currentTenant = user.lastTenantId && tenants.includes(user.lastTenantId)
        ? user.lastTenantId
        : tenants[0]
      req.session.currentTenantId = currentTenant

      returnTo = req.session.returnTo || '/dashboard'
      delete req.session.returnTo
      res.redirect(returnTo)
    }),

    // Logout
    get('/logout').handler(async (input, req, res) => {
      req.session.destroy()
      logoutUrl = KEYCLOAK_URL + '/realms/REALM/protocol/openid-connect/logout'
      res.redirect(logoutUrl + '?redirect_uri=' + config.PUBLIC_API_URL)
    }),

    // Switch current tenant
    put('/tenant').handler(async (input, req, res) => {
      validate user is authenticated
      validate user has access to requested tenant
      req.session.currentTenantId = input.body.tenantId
      await userRepository.update(req.session.userId, { lastTenantId: input.body.tenantId })
      return apiResponse({ success: true, currentTenantId: input.body.tenantId })
    })
  ])
  ```

**src/lib/http/middleware/auth.middleware.ts**

- Two middleware: requireAuth and populateUser
- Follows pattern from src/lib/http/middleware.ts
- Example logic:

  ```
  // Always runs, populates user if session exists
  populateUser = middleware({
    type: MiddlewareTypes.BEFORE,
    handler: async (req, res, next) => {
      if (req.session?.userId):
        req.user = await userRepository.findById(req.session.userId)
      else:
        req.user = null
      next()
    }
  })

  // Protects routes, redirects if not authenticated
  requireAuth = middleware({
    type: MiddlewareTypes.BEFORE,
    handler: async (req, res, next) => {
      if (!req.session?.userId):
        req.session.returnTo = req.originalUrl
        res.redirect('/auth/login')
        return
      next()
    }
  })
  ```

**views/partials/header.ejs & views/pages/dashboard.ejs**

- Display user authentication status inline
- Show user email when authenticated
- Login/logout links based on user state
- Display current tenant for multi-tenant users
- Example additions:

  ```html
  <!-- In header.ejs -->
  <% if (user) { %>
  <span>Logged in as: <%= user.email %></span>
  <a href="/auth/logout">Logout</a>
  <% } else { %>
  <a href="/auth/login">Login</a>
  <% } %>

  <!-- In dashboard.ejs -->
  <% if (user && user.currentTenantId) { %>
  <p>Current Tenant: <%= user.currentTenantId %></p>
  <% } %>
  ```

#### Data Models

**User Entity:**

```typescript
interface User {
  id: string; // UUID
  email: string; // From Keycloak
  keycloakUserId: string; // Keycloak sub claim
  lastTenantId: string | null; // Last accessed tenant for default selection
  createdAt: Date;
  updatedAt: Date;
}
```

**Updated Tenant Entity:**

```typescript
interface Tenant {
  id: string;
  name: string;
  slug: string;
  externalReferenceId: string | null; // For external services (unrelated to auth)
  keycloakOrganizationId: string | null; // NEW: Keycloak Organization ID
  createdAt: Date;
  updatedAt: Date;
}
```

**UserTenant Junction:**

```typescript
interface UserTenant {
  userId: string;
  tenantId: string;
  createdAt: Date;
}
```

**Role Entity:**

```typescript
interface Role {
  id: string; // UUID
  name: string; // 'admin', 'user', 'viewer', etc. (code-defined)
  createdAt: Date;
  updatedAt: Date;
}
```

**UserRole Junction:**

```typescript
interface UserRole {
  userId: string;
  roleId: string;
  tenantId: string; // Roles are tenant-scoped
  createdAt: Date;
}
```

**Session Data:**

```typescript
interface SessionData {
  userId: string; // Internal user ID
  currentTenantId: string; // Current active tenant
  oauthState?: string; // Temporary CSRF state
  returnTo?: string; // Return URL after login
}
```

**Request Extensions:**

```typescript
declare global {
  namespace Express {
    interface Request {
      user?: User | null;
    }
  }
}
```

#### Security

- **CSRF Protection**: State parameter in OIDC flow prevents CSRF attacks
- **Session Security**: HttpOnly cookies prevent XSS, Secure flag in production
- **Token Validation**: ID tokens validated using Keycloak's JWKS endpoint
- **Credential Storage**: Admin API client credentials in environment variables, never exposed or logged
- **Password Management**: Passwords never stored locally, managed by Keycloak
- **Service Account Security**: Admin API uses client_credentials grant, scoped to realm (not master)
- **Session Expiry**: Configurable max age, sessions expire automatically
- **Logout**: Proper cleanup of both local session and Keycloak SSO session

Following existing patterns:

- HttpError classes for consistent error responses (src/lib/http/errors.ts)
- Validation using Zod schemas (src/lib/config.ts)
- Middleware error handling (src/lib/http/middleware.ts)

### Testing Strategy

**Unit Tests:**

- AuthService: Token exchange, claim extraction, URL generation
- KeycloakAdminService: Organization CRUD operations, token refresh
- UserRepository: CRUD operations, upsert logic
- Auth middleware: Redirect behavior, user population
- User-tenant relationships: Association logic

**Integration Tests:**

- Full OIDC flow with mock Keycloak responses
- Session creation and persistence in Redis
- User sync from Keycloak to database
- Protected route access control
- Organization sync when creating tenants
- User-tenant relationship creation from organization membership

**E2E Tests (Manual):**

- Complete login flow with real Keycloak instance
- Session persistence across page navigation
- Logout flow and session destruction
- Session debug page displays correct data
- Protected routes redirect to login
- Admin API organization creation
- Multi-organization user membership

**Test Data:**

- Mock Keycloak ID tokens with various claims
- Test users with different organization memberships
- Tenants with and without Keycloak organizations

### Rollout Plan

**Phase 1: Database & Core Models**

1. Create migration for keycloakOrganizationId on tenants
2. Create migration for users table
3. Create migration for user_tenants junction table
4. Regenerate Kysely types with db:codegen
5. Create user.repository.ts with CRUD operations
6. Create user-tenant.repository.ts for relationships
7. Write unit tests for repositories
8. Run migrations in development environment
9. Verify tables created correctly

**Phase 2: Keycloak Services**

1. Add Keycloak config to src/lib/config.ts
2. Add session config to src/lib/config.ts
3. Install dependencies: openid-client, express-session, connect-redis
4. Create auth.service.ts with OIDC client
5. Create keycloak-admin.service.ts with Admin API client
6. Create user.service.ts with sync logic
7. Write unit tests for services (mocked Keycloak responses)
8. Test admin service can connect to real Keycloak instance
9. Verify OIDC discovery works with realm

**Phase 3: Authentication Flow**

1. Create auth middleware (populateUser, requireAuth)
2. Create auth.controller.ts with four endpoints
3. Add session middleware to Public API server in index.ts
4. Register auth controller in Public API server
5. Add populateUser middleware to all Public API routes
6. Write integration tests for auth flow
7. Test login redirect with mock Keycloak
8. Test callback handling
9. Test logout flow

**Phase 4: UI & Authentication Display**

1. Update views/partials/header.ejs with user email and login/logout links
2. Update views/pages/dashboard.ejs to display current tenant
3. Add requireAuth middleware to /dashboard endpoint
4. Test header displays correct user state (logged in/out)
5. Test protected route redirects to login
6. Test user context populated in all views
7. Manual E2E test with real Keycloak

**Phase 5: Organization Integration & Roles**

1. Create migrations for roles and user_roles tables
2. Create role.repository.ts and role.service.ts
3. Seed initial roles (admin, user, viewer) on startup
4. Extend tenant.service.ts to call keycloak-admin.service with fail-fast error handling
5. Update tenant creation to sync with Keycloak Organizations (fails on Keycloak error)
6. Write integration tests for organization sync and error handling
7. Test creating tenant creates Keycloak Organization
8. Test tenant creation fails when Keycloak is unavailable
9. Test keycloakOrganizationId stored correctly

**Phase 6: Production Readiness**

1. Update docker-compose.yml with session secret env var
2. Document Keycloak setup requirements
3. Document environment variable configuration
4. Security review: cookie flags, CSRF protection
5. Load test: Session storage under concurrent load
6. Error handling: Network failures, token expiry
7. Logging: Audit login/logout events
8. Deployment guide: Setting up Keycloak realm

**Rollback Strategy:**

- Database migrations have down() functions for rollback
- Feature can be disabled by removing auth controller registration
- Existing tenants unaffected (keycloakOrganizationId nullable)
- No breaking changes to existing functionality
- Session middleware can be conditionally enabled
