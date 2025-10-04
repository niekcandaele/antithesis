# Antithesis Keycloak Configuration

This Helm chart configures Keycloak for the Antithesis platform using Crossplane.

## What This Chart Creates

- **Realm**: `antithesis` - Isolated authentication realm for the platform
- **OIDC Client**: `antithesis-app` - For user authentication via OAuth/OIDC
- **Admin Client**: `antithesis-admin` - Service account for Keycloak Admin API
- **Protocol Mappers**: Maps organizations and email to token claims

## Prerequisites

1. **Kubernetes cluster** with Crossplane installed
2. **Crossplane Keycloak provider** installed:

   ```bash
   kubectl apply -f - <<EOF
   apiVersion: pkg.crossplane.io/v1
   kind: Provider
   metadata:
     name: provider-keycloak
   spec:
     package: xpkg.upbound.io/crossplane-contrib/provider-keycloak:v1.5.0
   EOF
   ```

3. **ProviderConfig** for Keycloak connection:

   ```bash
   kubectl apply -f - <<EOF
   apiVersion: keycloak.crossplane.io/v1alpha1
   kind: ProviderConfig
   metadata:
     name: keycloak-provider-config
   spec:
     credentials:
       source: Secret
       secretRef:
         name: keycloak-admin-secret
         namespace: crossplane-system
         key: password
     url: https://your-keycloak-url.com
     realm: master  # Admin realm
     clientId: admin-cli
   EOF
   ```

4. **Admin credentials secret**:
   ```bash
   kubectl create secret generic keycloak-admin-secret \
     -n crossplane-system \
     --from-literal=password='your-admin-password'
   ```

## Installation

```bash
# Install the chart
helm install antithesis-keycloak ./chart

# Or with custom values
helm install antithesis-keycloak ./chart \
  --set keycloak.realm.name=my-realm \
  --set namespace=antithesis
```

## Configuration

### Production Setup

Update `values.yaml` with production URLs:

```yaml
keycloak:
  oidcClient:
    redirectUris:
      - 'https://antithesis.example.com/auth/callback'
    postLogoutRedirectUris:
      - 'https://antithesis.example.com'
    webOrigins:
      - 'https://antithesis.example.com'
```

### Accessing Credentials

After installation, client secrets are stored in Kubernetes secrets:

```bash
# Get OIDC client secret
kubectl get secret antithesis-oidc-credentials -o jsonpath='{.data.attribute\.client_secret}' | base64 -d

# Get Admin client secret
kubectl get secret antithesis-admin-credentials -o jsonpath='{.data.attribute\.client_secret}' | base64 -d
```

### Update Application .env

Use the secrets in your application:

```bash
# Extract and set in .env
export KEYCLOAK_CLIENT_SECRET=$(kubectl get secret antithesis-oidc-credentials -o jsonpath='{.data.attribute\.client_secret}' | base64 -d)
export KEYCLOAK_ADMIN_CLIENT_SECRET=$(kubectl get secret antithesis-admin-credentials -o jsonpath='{.data.attribute\.client_secret}' | base64 -d)

echo "KEYCLOAK_CLIENT_SECRET=$KEYCLOAK_CLIENT_SECRET" >> .env
echo "KEYCLOAK_ADMIN_CLIENT_SECRET=$KEYCLOAK_ADMIN_CLIENT_SECRET" >> .env
```

## Keycloak Admin Configuration

After the chart is deployed, you need to configure the admin client's service account:

1. Go to Keycloak Admin Console
2. Navigate to: **Realm: antithesis → Clients → antithesis-admin**
3. Click **Service Account Roles** tab
4. Assign required roles for organization management:
   - `manage-users`
   - Organization management roles (if available)
   - OR create a custom role with organization permissions

## Organization Mapping

The chart includes a protocol mapper to add organization membership to tokens. However, Keycloak Organizations may require:

1. Custom protocol mapper configuration
2. Organization-specific claims configuration
3. Manual testing to ensure `organizations` appears in UserInfo

**Verify organization mapping**:

```bash
# Get access token
curl -X POST "https://keycloak-url/realms/antithesis/protocol/openid-connect/token" \
  -d "client_id=antithesis-app" \
  -d "client_secret=YOUR_SECRET" \
  -d "grant_type=client_credentials"

# Check UserInfo endpoint
curl "https://keycloak-url/realms/antithesis/protocol/openid-connect/userinfo" \
  -H "Authorization: Bearer ACCESS_TOKEN"
```

Look for `organizations` or `organization_ids` in the response.

## Customization

### Disable Components

```yaml
keycloak:
  realm:
    enabled: false # Don't create realm (use existing)
  oidcClient:
    enabled: false # Don't create OIDC client
  adminClient:
    enabled: false # Don't create admin client
```

### Change Client IDs

```yaml
keycloak:
  oidcClient:
    id: my-custom-client-id
  adminClient:
    id: my-custom-admin-id
```

## Troubleshooting

### Check Crossplane Resources

```bash
# Check if realm was created
kubectl get realms.realm.keycloak.crossplane.io

# Check if clients were created
kubectl get clients.openidclient.keycloak.crossplane.io

# Check protocol mappers
kubectl get protocolmappers.client.keycloak.crossplane.io

# Check provider config
kubectl get providerconfigs.keycloak.crossplane.io
```

### View Resource Status

```bash
kubectl describe realm antithesis-realm
kubectl describe client antithesis-app-client
kubectl describe client antithesis-admin-client
```

### Common Issues

**Issue**: Resources stuck in "Creating" state

- **Solution**: Check provider logs: `kubectl logs -n crossplane-system deployment/provider-keycloak`

**Issue**: "Cannot find ProviderConfig"

- **Solution**: Ensure `keycloak-provider-config` exists and is properly configured

**Issue**: Admin client can't manage organizations

- **Solution**: Assign proper service account roles in Keycloak Admin Console

## Uninstallation

```bash
# Delete the chart (this will delete the Keycloak resources)
helm uninstall antithesis-keycloak

# Clean up secrets (optional)
kubectl delete secret antithesis-oidc-credentials
kubectl delete secret antithesis-admin-credentials
```

## Integration with Antithesis App

After deployment:

1. Update `.env` with client secrets (see above)
2. Set `KEYCLOAK_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID`, etc.
3. Run Phase 2 demo: `npm run demo:keycloak`
4. Proceed to Phase 3 implementation

## Support

For issues with:

- **Chart deployment**: Check this README and Crossplane docs
- **Keycloak configuration**: See Keycloak Admin documentation
- **Application integration**: See Antithesis design document
