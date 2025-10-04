# Quick Installation Guide

## Prerequisites Checklist

- [ ] Kubernetes cluster with Crossplane installed
- [ ] Crossplane Keycloak provider v1.5.0 installed
- [ ] Keycloak instance accessible (with admin credentials)
- [ ] `kubectl` configured to access your cluster
- [ ] `helm` CLI installed

## Step 1: Install Crossplane Keycloak Provider

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

Wait for provider to be ready:

```bash
kubectl wait --for=condition=Healthy provider/provider-keycloak --timeout=300s
```

## Step 2: Create Keycloak Admin Secret

```bash
# Replace with your actual Keycloak admin password
kubectl create secret generic keycloak-admin-secret \
  -n crossplane-system \
  --from-literal=password='YOUR_KEYCLOAK_ADMIN_PASSWORD'
```

## Step 3: Create ProviderConfig

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
  url: https://your-keycloak-url.com  # UPDATE THIS
  realm: master
  clientId: admin-cli
EOF
```

**Important**: Update `url` to your actual Keycloak URL!

## Step 4: Install Antithesis Keycloak Chart

### For Development:

```bash
helm install antithesis-keycloak ./chart -f chart/values-dev.yaml
```

### For Production:

```bash
# FIRST: Edit chart/values-prod.yaml with your production domain
# Then:
helm install antithesis-keycloak ./chart -f chart/values-prod.yaml
```

## Step 5: Verify Installation

```bash
# Check if resources were created
kubectl get realms.realm.keycloak.crossplane.io
kubectl get clients.openidclient.keycloak.crossplane.io
kubectl get protocolmappers.client.keycloak.crossplane.io

# Check if secrets were created
kubectl get secret antithesis-oidc-credentials
kubectl get secret antithesis-admin-credentials
```

All resources should show `READY: True` and `SYNCED: True`.

## Step 6: Extract Client Secrets

```bash
# Extract OIDC client secret
export OIDC_SECRET=$(kubectl get secret antithesis-oidc-credentials \
  -o jsonpath='{.data.attribute\.client_secret}' | base64 -d)

# Extract Admin client secret
export ADMIN_SECRET=$(kubectl get secret antithesis-admin-credentials \
  -o jsonpath='{.data.attribute\.client_secret}' | base64 -d)

# Update your .env file
echo "KEYCLOAK_CLIENT_SECRET=$OIDC_SECRET" >> .env
echo "KEYCLOAK_ADMIN_CLIENT_SECRET=$ADMIN_SECRET" >> .env
```

## Step 7: Configure Admin Client Service Account

1. Log into Keycloak Admin Console
2. Navigate to your realm (e.g., `antithesis` or `antithesis-dev`)
3. Go to **Clients** → **antithesis-admin** (or `antithesis-admin-dev`)
4. Click **Service Account Roles** tab
5. Assign these roles:
   - `realm-admin` (for full realm access) OR
   - `manage-users` + organization-specific roles

## Step 8: Test the Integration

```bash
# Update your .env with the new secrets
source .env

# Run the Phase 2 demo
npm run demo:keycloak
```

## Troubleshooting

### Provider not healthy

```bash
kubectl logs -n crossplane-system deployment/provider-keycloak
```

### Resources stuck in "Creating"

```bash
kubectl describe realm antithesis-realm
# Look for errors in Events section
```

### Can't connect to Keycloak

```bash
# Test ProviderConfig connection
kubectl get providerconfig keycloak-provider-config -o yaml
```

### Missing secrets

Wait a few seconds for Crossplane to create them:

```bash
kubectl get secrets --watch
```

## Cleanup

```bash
# Uninstall the chart
helm uninstall antithesis-keycloak

# Delete secrets (optional)
kubectl delete secret antithesis-oidc-credentials antithesis-admin-credentials

# Delete ProviderConfig (optional)
kubectl delete providerconfig keycloak-provider-config
```

## Next Steps

Once installed:

1. ✅ Client secrets are in Kubernetes secrets
2. ✅ Update `.env` with the secrets
3. ✅ Configure admin client service account roles
4. ✅ Test with Phase 2 demo
5. 🚀 Proceed to Phase 3 implementation
