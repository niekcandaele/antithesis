#!/bin/bash
set -e

# Keycloak Admin REST API initialization script
# Automatically configures realm, clients, and test users for E2E testing
#
# Required environment variables:
#   KEYCLOAK_URL - Keycloak server URL
#   KEYCLOAK_ADMIN_PASSWORD - Admin password
#   KEYCLOAK_CLIENT_SECRET - OIDC client secret

KEYCLOAK_URL=${KEYCLOAK_URL:-http://localhost:8080}
KEYCLOAK_ADMIN=${KEYCLOAK_ADMIN:-admin}
KEYCLOAK_REALM=antithesis
KEYCLOAK_CLIENT_ID=antithesis-app

echo "🔧 Initializing Keycloak for E2E tests..."
echo "   URL: $KEYCLOAK_URL"
echo "   Realm: $KEYCLOAK_REALM"

# Get admin access token
echo "🔑 Authenticating with Keycloak admin..."
ADMIN_TOKEN=$(curl -sS -X POST \
  "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=$KEYCLOAK_ADMIN" \
  -d "password=$KEYCLOAK_ADMIN_PASSWORD" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" | jq -r '.access_token')

if [ "$ADMIN_TOKEN" = "null" ] || [ -z "$ADMIN_TOKEN" ]; then
  echo "❌ Failed to authenticate with Keycloak"
  exit 1
fi

echo "✅ Authenticated successfully"

# Create realm
echo "🌐 Creating realm '$KEYCLOAK_REALM'..."
REALM_EXISTS=$(curl -sS -X GET \
  "$KEYCLOAK_URL/admin/realms/$KEYCLOAK_REALM" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -w "%{http_code}" -o /dev/null)

if [ "$REALM_EXISTS" = "404" ]; then
  curl -sS -X POST \
    "$KEYCLOAK_URL/admin/realms" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"realm\": \"$KEYCLOAK_REALM\",
      \"enabled\": true,
      \"registrationAllowed\": false,
      \"loginWithEmailAllowed\": true,
      \"duplicateEmailsAllowed\": false
    }"
  echo "✅ Realm created"
else
  echo "ℹ️  Realm already exists"
fi

# Create OIDC client
echo "🔐 Creating OIDC client '$KEYCLOAK_CLIENT_ID'..."
CLIENT_EXISTS=$(curl -sS -X GET \
  "$KEYCLOAK_URL/admin/realms/$KEYCLOAK_REALM/clients?clientId=$KEYCLOAK_CLIENT_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq -r '. | length')

if [ "$CLIENT_EXISTS" = "0" ]; then
  curl -sS -X POST \
    "$KEYCLOAK_URL/admin/realms/$KEYCLOAK_REALM/clients" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"clientId\": \"$KEYCLOAK_CLIENT_ID\",
      \"enabled\": true,
      \"protocol\": \"openid-connect\",
      \"publicClient\": false,
      \"standardFlowEnabled\": true,
      \"directAccessGrantsEnabled\": false,
      \"serviceAccountsEnabled\": false,
      \"redirectUris\": [
        \"http://127.0.0.1:13000/auth/callback\",
        \"http://localhost:13000/auth/callback\"
      ],
      \"webOrigins\": [
        \"http://127.0.0.1:13000\",
        \"http://localhost:13000\"
      ],
      \"secret\": \"$KEYCLOAK_CLIENT_SECRET\"
    }"
  echo "✅ OIDC client created"
else
  echo "ℹ️  OIDC client already exists"
fi

# Add protocol mappers to OIDC client
echo "📋 Adding protocol mappers..."
CLIENT_UUID=$(curl -sS -X GET \
  "$KEYCLOAK_URL/admin/realms/$KEYCLOAK_REALM/clients?clientId=$KEYCLOAK_CLIENT_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq -r '.[0].id')

# Email mapper
curl -sS -X POST \
  "$KEYCLOAK_URL/admin/realms/$KEYCLOAK_REALM/clients/$CLIENT_UUID/protocol-mappers/models" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "email",
    "protocol": "openid-connect",
    "protocolMapper": "oidc-usermodel-property-mapper",
    "config": {
      "user.attribute": "email",
      "claim.name": "email",
      "jsonType.label": "String",
      "id.token.claim": "true",
      "access.token.claim": "true",
      "userinfo.token.claim": "true"
    }
  }' 2>/dev/null || echo "ℹ️  Email mapper may already exist"

echo "✅ Protocol mappers configured"

# Create test user
echo "👤 Creating test user..."
TEST_USER_EMAIL="test-user@test.com"
TEST_USER_PASSWORD="Password1"

USER_EXISTS=$(curl -sS -X GET \
  "$KEYCLOAK_URL/admin/realms/$KEYCLOAK_REALM/users?email=$TEST_USER_EMAIL" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq -r '. | length')

if [ "$USER_EXISTS" = "0" ]; then
  curl -sS -X POST \
    "$KEYCLOAK_URL/admin/realms/$KEYCLOAK_REALM/users" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"username\": \"test-user\",
      \"email\": \"$TEST_USER_EMAIL\",
      \"enabled\": true,
      \"emailVerified\": true,
      \"credentials\": [{
        \"type\": \"password\",
        \"value\": \"$TEST_USER_PASSWORD\",
        \"temporary\": false
      }]
    }"
  echo "✅ Test user created (test-user@test.com / Password1)"
else
  echo "ℹ️  Test user already exists"
fi

echo ""
echo "🎉 Keycloak initialization complete!"
echo ""
echo "   Realm: $KEYCLOAK_REALM"
echo "   OIDC Client: $KEYCLOAK_CLIENT_ID"
echo "   Test User: test-user@test.com / Password1"
echo ""
