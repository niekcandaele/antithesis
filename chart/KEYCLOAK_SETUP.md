# Keycloak Setup Guide for Antithesis

This guide explains how to configure Keycloak for use with the Antithesis application.

## Overview

Antithesis uses Keycloak for authentication via OpenID Connect (OIDC) and manages multi-tenant access through Keycloak Organizations. The application requires:

1. **OIDC Client** - For user authentication (authorization code flow)
2. **Admin Client** - Service account for programmatic organization management
3. **Protocol Mappers** - To include organization membership in tokens
4. **Service Account Roles** - Permissions for the admin client to manage organizations

## Prerequisites

- Keycloak 22.0+ with Organizations feature enabled
- Admin access to Keycloak
- `kubectl` configured (for Crossplane deployment)
- `helm` CLI installed (for Crossplane deployment)

## Quick Start with Crossplane

If you're using Crossplane (recommended), the Helm chart in this directory automates the entire setup:

```bash
# Install the chart
helm install antithesis-keycloak ./chart \\
  -f ./chart/values-dev.yaml \\
  -n antithesis \\
  --create-namespace

# Wait for resources to sync
kubectl wait --for=condition=Ready realms/antithesis --timeout=300s

# Extract client secrets
kubectl get secret antithesis-oidc-credentials -n default -o jsonpath='{.data.client-secret}' | base64 -d
kubectl get secret antithesis-admin-credentials -n default -o jsonpath='{.data.client-secret}' | base64 -d
```

The chart creates:

- Realm: `antithesis`
- OIDC Client: `antithesis-app`
- Admin Client: `antithesis-admin`
- Protocol mappers for email and organizations

**After installation, you must configure service account roles manually** (see "Service Account Configuration" below).

## Manual Setup

If not using Crossplane, follow these steps in the Keycloak Admin Console:

### 1. Create Realm

1. Navigate to the Keycloak Admin Console
2. Click **Create Realm**
3. Enter realm name: `antithesis`
4. Click **Create**

### 2. Create OIDC Client

1. In the `antithesis` realm, go to **Clients** → **Create client**
2. Configure:
   - **Client ID**: `antithesis-app`
   - **Client type**: OpenID Connect
   - **Client authentication**: ON (confidential client)
3. Click **Next**
4. Configure capabilities:
   - **Standard flow**: ON (authorization code flow)
   - **Direct access grants**: OFF
   - **Implicit flow**: OFF
   - **Service accounts roles**: OFF
5. Click **Next**
6. Configure access settings:
   - **Root URL**: `http://localhost:3000` (or your PUBLIC_API_URL)
   - **Valid redirect URIs**: `http://localhost:3000/auth/callback`
   - **Web origins**: `http://localhost:3000`
7. Click **Save**
8. Go to **Credentials** tab and copy the **Client secret**

### 3. Create Admin Client (Service Account)

1. Go to **Clients** → **Create client**
2. Configure:
   - **Client ID**: `antithesis-admin`
   - **Client type**: OpenID Connect
   - **Client authentication**: ON
3. Click **Next**
4. Configure capabilities:
   - **Standard flow**: OFF
   - **Direct access grants**: OFF
   - **Service accounts roles**: ON (this enables client credentials grant)
5. Click **Save**
6. Go to **Credentials** tab and copy the **Client secret**

### 4. Add Protocol Mappers to OIDC Client

**Email Mapper** (if not already present):

1. Go to OIDC client (`antithesis-app`)
2. Click **Client scopes** tab
3. Click on the `antithesis-app-dedicated` scope
4. Click **Add mapper** → **By configuration** → **User Property**
5. Configure:
   - **Name**: `email`
   - **Property**: `email`
   - **Token Claim Name**: `email`
   - **Claim JSON Type**: String
   - **Add to ID token**: ON
   - **Add to access token**: ON
   - **Add to userinfo**: ON
6. Click **Save**

**Organizations Mapper**:

1. In the same client scope, click **Add mapper** → **By configuration** → **User Realm Role**
2. Configure:
   - **Name**: `organizations`
   - **Token Claim Name**: `organizations`
   - **Claim JSON Type**: String
   - **Add to ID token**: ON
   - **Add to access token**: ON
   - **Add to userinfo**: ON
   - **Multivalued**: ON
3. Click **Save**

> **Note**: The organizations mapper configuration depends on your Keycloak version and Organizations setup. You may need to use a different mapper type or custom mapper depending on how organization membership is exposed.

### 5. Service Account Configuration

The admin client's service account needs permissions to manage organizations.

1. Go to the admin client (`antithesis-admin`)
2. Click **Service account roles** tab
3. Click **Assign role**
4. Filter by **realm roles**
5. Assign these roles:
   - `manage-users` (if managing org membership)
   - `view-users`
   - Any organization-specific management roles

> **Important**: The exact roles required depend on your Keycloak configuration. At minimum, the service account needs permission to:
>
> - Create organizations
> - Read organization details
> - Update organizations
> - Delete organizations (optional)

If using a custom role for organization management, create it in Keycloak and assign it to the service account.

## Environment Variables

After setting up Keycloak, configure the application with these environment variables:

```bash
# Keycloak Server Configuration
KEYCLOAK_URL=https://your-keycloak-server.com
KEYCLOAK_REALM=antithesis

# OIDC Client (for user authentication)
KEYCLOAK_CLIENT_ID=antithesis-app
KEYCLOAK_CLIENT_SECRET=<secret-from-step-2>

# Admin Client (for organization management)
KEYCLOAK_ADMIN_CLIENT_ID=antithesis-admin
KEYCLOAK_ADMIN_CLIENT_SECRET=<secret-from-step-3>

# Session Configuration
SESSION_SECRET=<generate-random-32+-character-string>
SESSION_MAX_AGE=86400000  # 24 hours in milliseconds

# Application URL (must match Keycloak redirect URIs)
PUBLIC_API_URL=http://localhost:3000
```

### Generating a Secure Session Secret

```bash
# Generate a cryptographically secure session secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Docker Compose

The `docker-compose.yml` file in the project root includes all required environment variables with development defaults. Update these for production:

```yaml
environment:
  - KEYCLOAK_URL=https://your-keycloak-server.com
  - KEYCLOAK_REALM=antithesis
  - KEYCLOAK_CLIENT_ID=antithesis-app
  - KEYCLOAK_CLIENT_SECRET=<your-oidc-secret>
  - KEYCLOAK_ADMIN_CLIENT_ID=antithesis-admin
  - KEYCLOAK_ADMIN_CLIENT_SECRET=<your-admin-secret>
  - SESSION_SECRET=<your-session-secret>
  - PUBLIC_API_URL=https://your-app.com
```

## Testing the Setup

### 1. Verify OIDC Discovery

```bash
curl https://your-keycloak-server.com/realms/antithesis/.well-known/openid-configuration
```

Should return OIDC configuration with `authorization_endpoint`, `token_endpoint`, `userinfo_endpoint`, etc.

### 2. Verify Admin Client Authentication

```bash
curl -X POST https://your-keycloak-server.com/realms/antithesis/protocol/openid-connect/token \\
  -d "grant_type=client_credentials" \\
  -d "client_id=antithesis-admin" \\
  -d "client_secret=<admin-secret>"
```

Should return an access token if the service account is configured correctly.

### 3. Test Login Flow

1. Start the application: `docker compose up`
2. Navigate to: `http://localhost:3000/auth/login`
3. You should be redirected to Keycloak login
4. After login, you should be redirected back to the dashboard

## Troubleshooting

### "Failed to connect to Keycloak"

- Verify `KEYCLOAK_URL` is correct and Keycloak is accessible
- Check network connectivity from the application to Keycloak
- Verify the realm name is correct

### "Failed to authenticate with Keycloak Admin API"

- Verify `KEYCLOAK_ADMIN_CLIENT_SECRET` is correct
- Ensure the admin client has "Service accounts roles" enabled
- Check that the service account has proper role assignments

### "Invalid state parameter"

- Session is not persisting (check Redis connection)
- Cookie not being sent (check `PUBLIC_API_URL` matches the domain you're accessing)
- Session expired (increase `SESSION_MAX_AGE` if needed)

### "No tenant access" after login

- User is not a member of any Keycloak organization
- Organization membership not being returned in UserInfo endpoint (check protocol mappers)
- Database sync failed (check application logs)

## Security Considerations

1. **Always use HTTPS in production** - Set `PUBLIC_API_URL` to HTTPS
2. **Change default secrets** - Never use the default values in production
3. **Session secret must be 32+ characters** - The application enforces this
4. **Cookie security** - Cookies are automatically `secure` and `httpOnly` in production
5. **CSRF protection** - State parameter is validated on every login
6. **Credential management** - Never commit secrets to version control

## Production Checklist

- [ ] Keycloak accessible via HTTPS
- [ ] OIDC client created with correct redirect URIs
- [ ] Admin client created with service account enabled
- [ ] Service account has organization management roles
- [ ] Protocol mappers configured (email, organizations)
- [ ] Client secrets extracted and stored securely
- [ ] Environment variables configured in deployment
- [ ] Session secret is cryptographically random (32+ chars)
- [ ] `PUBLIC_API_URL` uses HTTPS and matches deployment URL
- [ ] Test login flow works end-to-end
- [ ] Test organization creation via Admin API

## Additional Resources

- [Keycloak Documentation](https://www.keycloak.org/documentation)
- [Keycloak Organizations Guide](https://www.keycloak.org/docs/latest/server_admin/#organizations)
- [OpenID Connect Specification](https://openid.net/specs/openid-connect-core-1_0.html)
- [Crossplane Keycloak Provider](https://github.com/crossplane-contrib/provider-keycloak)
