import { type NextFunction, type Request, type Response } from 'express';
import { middleware, MiddlewareTypes } from '../middleware.js';
import { contextManager, getServerContext } from '../serverContext.js';
import { userService } from '../../../services/user.service.js';
import { tenantService } from '../../../services/tenant.service.js';
import { userTenantRepository } from '../../../db/user-tenant.repository.js';

/**
 * Tenant resolution middleware
 * Extracts active tenantId from JWT (primary) or session (fallback) and injects into ServerContext
 * Runs after populateUser middleware
 *
 * Resolution priority:
 * 1. JWT Authorization header (tenant_id or organization_id claim) - for API clients
 * 2. Session currentTenantId - for web UI
 * 3. Auto-provision if user has no tenants
 * 4. Auto-select if user has tenants but no current selection
 */
export const tenantResolution = middleware({
  name: 'tenantResolution',
  type: MiddlewareTypes.BEFORE,
  handler: async (req: Request, _res: Response, next: NextFunction) => {
    let tenantId: string | null = null;

    // Priority 1: Check JWT Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        // Parse JWT without verification (verification should happen in auth middleware)
        // This is safe because we only use it for tenant context, not authentication
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString()) as Record<
          string,
          unknown
        >;

        // Check for tenant_id claim (direct tenant ID)
        if (typeof payload.tenant_id === 'string') {
          tenantId = payload.tenant_id;
        }
        // Fallback: check for organization_id claim (Keycloak organization)
        else if (typeof payload.organization_id === 'string') {
          // In future, we could map organization_id to tenant_id here
          // For now, we'll just use session fallback
        }
      } catch {
        // Invalid JWT format - ignore and fall through to session
      }
    }

    // Priority 2: Check session currentTenantId
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!tenantId && req.session && req.session.currentTenantId) {
      tenantId = req.session.currentTenantId;
    }

    // Priority 3: Auto-provision or auto-select for authenticated users
    if (!tenantId && req.user) {
      // Get user's tenant list
      const userTenantIds = await userTenantRepository.findTenantsForUser(req.user.id);

      if (userTenantIds.length === 0) {
        // Auto-provision: Create tenant for user with no organizations
        try {
          const newTenant = await tenantService.createTenant({
            name: `${req.user.email}'s Organization`,
            slug: `${req.user.email.split('@')[0]}-${String(Date.now())}`,
          });

          // Assign user to new tenant
          await userTenantRepository.addRelationship(req.user.id, newTenant.id);

          tenantId = newTenant.id;

          // Save to session for persistence
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          if (req.session) {
            req.session.currentTenantId = newTenant.id;
          }

          // Update user's last tenant
          await userService.updateLastTenant(req.user.id, newTenant.id);
        } catch (error) {
          // Log error but don't fail request
          // eslint-disable-next-line no-console
          console.error('Failed to auto-provision tenant:', error);
        }
      } else {
        // Auto-select: User has tenants but no current selection
        tenantId = await userService.determineCurrentTenant(req.user.id);

        // Save to session
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (tenantId && req.session) {
          req.session.currentTenantId = tenantId;
        }
      }
    }

    // Inject tenantId and userId into context
    // Create a nested immutable context instead of mutating
    const currentContext = getServerContext();
    const newContext = {
      ...currentContext,
      tenantId: tenantId ?? currentContext.tenantId,
      userId: req.user?.id ?? currentContext.userId,
    };

    // Always create new context to ensure userId is set even without tenantId
    contextManager.runWithContext(newContext, () => {
      next();
    });
  },
});
