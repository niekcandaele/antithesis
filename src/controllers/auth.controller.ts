import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { controller, get, put, apiResponse, zApiOutput } from '../lib/http/index.js';
import { UnauthorizedError, ForbiddenError } from '../lib/http/errors.js';
import { authService } from '../services/auth.service.js';
import { userService } from '../services/user.service.js';
import { userTenantRepository } from '../db/user-tenant.repository.js';
import { config } from '../lib/config.js';

/**
 * Generate a random state parameter for CSRF protection
 */
function generateState(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Auth controller
 *
 * Provides authentication endpoints:
 * - GET /auth/login - Initiate OIDC login flow
 * - GET /auth/callback - Handle OIDC callback
 * - GET /auth/logout - Logout and destroy session
 * - PUT /auth/tenant - Switch current tenant
 */
export const authController = controller('/auth')
  .description('Authentication endpoints for Keycloak OIDC integration')
  .endpoints([
    /**
     * Initiate OIDC login flow
     * Generates state parameter, stores in session, redirects to Keycloak
     */
    get('login', 'login')
      .description('Initiate Keycloak OIDC login flow')
      .input(
        z.object({
          query: z.object({
            returnTo: z.string().optional(),
          }),
        }),
      )
      .hideFromOpenAPI()
      .handler(async (inputs, req, res) => {
        // Generate CSRF protection state
        const state = generateState();
        req.session.oauthState = state;

        // Save return URL (defaults to /dashboard)
        req.session.returnTo = inputs.query.returnTo ?? '/dashboard';

        // Generate authorization URL
        const authUrl = await authService.generateAuthUrl(state);

        // Save session before redirect to ensure state persists
        await new Promise<void>((resolve, reject) => {
          req.session.save((err) => {
            if (err) reject(new Error(`Failed to save session: ${String(err)}`));
            else resolve();
          });
        });

        // Redirect to Keycloak
        res.redirect(authUrl);

        // Return empty response (redirect already sent)
        return apiResponse({});
      }),

    /**
     * Handle OIDC callback
     * Validates state, exchanges code for tokens, syncs user, creates session
     */
    get('callback', 'callback')
      .description('Handle Keycloak OIDC callback')
      .input(
        z.object({
          query: z.object({
            code: z.string(),
            state: z.string(),
          }),
        }),
      )
      .hideFromOpenAPI()
      .handler(async (inputs, req, res) => {
        // Validate state parameter (CSRF protection)
        if (!req.session.oauthState || req.session.oauthState !== inputs.query.state) {
          throw new UnauthorizedError('Invalid state parameter');
        }

        // Clear state from session
        req.session.oauthState = undefined;

        // Exchange authorization code for tokens and extract user claims
        // Use full original URL to preserve all query parameters Keycloak sent
        const callbackUrl = `${config.PUBLIC_API_URL}${req.originalUrl}`;
        const userClaims = await authService.handleCallback(inputs.query.state, callbackUrl);

        // Sync user and tenant relationships from Keycloak
        const user = await userService.syncUserFromKeycloak(userClaims);

        // Create session with user ID
        req.session.userId = user.id;

        // Determine current tenant (last accessed or first available)
        const currentTenantId = await userService.determineCurrentTenant(user.id);

        if (!currentTenantId) {
          // User has no tenant access - destroy session and redirect to error
          await new Promise<void>((resolve) => {
            req.session.destroy(() => {
              resolve();
            });
          });
          // TODO: Create a proper "no access" view
          res.redirect('/auth/login?error=no_tenant_access');
          return apiResponse({});
        }

        req.session.currentTenantId = currentTenantId;

        // Get return URL (defaults to /dashboard if not set)
        const returnTo = req.session.returnTo ?? '/dashboard';
        req.session.returnTo = undefined;

        // Save session before redirect to ensure user data persists
        await new Promise<void>((resolve, reject) => {
          req.session.save((err) => {
            if (err) reject(new Error(`Failed to save session: ${String(err)}`));
            else resolve();
          });
        });

        // Redirect to return URL
        res.redirect(returnTo);

        // Return empty response (redirect already sent)
        return apiResponse({});
      }),

    /**
     * Logout endpoint
     * Destroys session and redirects to Keycloak logout
     */
    get('logout', 'logout')
      .description('Logout user and destroy session')
      .hideFromOpenAPI()
      .handler(async (_inputs, req, res) => {
        // Get Keycloak logout URL first
        const logoutUrl = authService.getLogoutUrl(config.PUBLIC_API_URL);

        // Destroy session and redirect regardless of success
        await new Promise<void>((resolve) => {
          req.session.destroy((err) => {
            if (err) {
              // eslint-disable-next-line no-console
              console.error('Failed to destroy session:', err);
            }
            // Always resolve to ensure redirect happens
            resolve();
          });
        });

        // Redirect to Keycloak logout
        res.redirect(logoutUrl);

        // Return empty response (redirect already sent)
        return apiResponse({});
      }),

    /**
     * Switch current tenant
     * Validates user has access to tenant, updates session and lastTenantId
     */
    put('tenant', 'switchTenant')
      .description('Switch current tenant for multi-tenant users')
      .input(
        z.object({
          body: z.object({
            tenantId: z.string().uuid('Invalid tenant ID'),
          }),
        }),
      )
      .response(
        zApiOutput(
          z.object({
            currentTenantId: z.string(),
          }),
        ),
      )
      .handler(async (inputs, req) => {
        // Require authentication
        if (!req.session.userId || !req.user) {
          throw new UnauthorizedError('Authentication required');
        }

        const { tenantId } = inputs.body;

        // Validate user has access to requested tenant
        const userId = req.session.userId;
        const hasAccess = await userTenantRepository.hasAccess(userId, tenantId);

        if (!hasAccess) {
          throw new ForbiddenError('Access denied to tenant');
        }

        // Update session
        req.session.currentTenantId = tenantId;

        // Save session before updating database
        await new Promise<void>((resolve, reject) => {
          req.session.save((err) => {
            if (err) reject(new Error(`Failed to save session: ${String(err)}`));
            else resolve();
          });
        });

        // Update user's lastTenantId
        await userService.updateLastTenant(userId, tenantId);

        return apiResponse({
          currentTenantId: tenantId,
        });
      }),
  ]);
