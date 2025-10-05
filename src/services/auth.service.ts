import * as client from 'openid-client';
import { config } from '../lib/config.js';

/**
 * User claims extracted from ID token
 */
export interface UserClaims {
  keycloakUserId: string; // sub claim
  email: string;
  organizations: string[]; // Organization IDs from UserInfo endpoint
}

/**
 * Authentication service for Keycloak OIDC integration
 *
 * Handles OpenID Connect flow:
 * - OIDC endpoint discovery
 * - Authorization URL generation
 * - Token exchange
 * - UserInfo endpoint calls for organization membership
 */
export class AuthService {
  private oidcConfig: client.Configuration | null = null;
  private readonly issuerUrl: string;

  constructor() {
    this.issuerUrl = `${config.KEYCLOAK_URL}/realms/${config.KEYCLOAK_REALM}`;
  }

  /**
   * Initialize OIDC client by discovering Keycloak endpoints
   */
  async initialize(): Promise<void> {
    try {
      this.oidcConfig = await client.discovery(
        new URL(this.issuerUrl),
        config.KEYCLOAK_CLIENT_ID,
        config.KEYCLOAK_CLIENT_SECRET,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error during OIDC discovery';
      throw new Error(
        `Failed to connect to Keycloak at ${this.issuerUrl}. ` +
          `Please verify KEYCLOAK_URL and KEYCLOAK_REALM are configured correctly. ` +
          `Original error: ${errorMessage}`,
      );
    }
  }

  /**
   * Ensure OIDC client is initialized
   */
  private async ensureInitialized(): Promise<client.Configuration> {
    if (!this.oidcConfig) {
      await this.initialize();
    }
    if (!this.oidcConfig) {
      throw new Error('Failed to initialize OIDC client');
    }
    return this.oidcConfig;
  }

  /**
   * Generate authorization URL for login
   *
   * @param state - CSRF protection state parameter
   * @returns Authorization URL to redirect user to
   */
  async generateAuthUrl(state: string): Promise<string> {
    const oidcConfig = await this.ensureInitialized();

    const authUrl = client.buildAuthorizationUrl(oidcConfig, {
      redirect_uri: `${config.PUBLIC_API_URL}/auth/callback`,
      scope: 'openid email profile',
      state,
    });

    return authUrl.href;
  }

  /**
   * Handle OAuth callback by exchanging authorization code for tokens
   *
   * @param state - State parameter for CSRF validation
   * @param callbackUrl - The full callback URL with all query parameters from Keycloak
   * @returns User claims with organization membership
   */
  async handleCallback(state: string, callbackUrl: string): Promise<UserClaims> {
    try {
      const oidcConfig = await this.ensureInitialized();

      // Exchange authorization code for tokens
      const tokens = await client.authorizationCodeGrant(oidcConfig, new URL(callbackUrl), {
        expectedState: state,
        pkceCodeVerifier: undefined, // Not using PKCE for server-side flow
      });

      // Validate ID token and extract claims
      const idTokenClaims = tokens.claims();
      if (!idTokenClaims) {
        throw new Error('ID token missing claims');
      }
      if (!idTokenClaims.sub) {
        throw new Error('ID token missing sub claim');
      }
      if (!idTokenClaims.email) {
        throw new Error('ID token missing email claim');
      }

      // Fetch organization membership using Keycloak Admin API
      // UserInfo endpoint doesn't include organization data by default
      const { keycloakAdminService } = await import('./keycloak-admin.service.js');
      const organizations = await keycloakAdminService.getUserOrganizations(idTokenClaims.sub);

      return {
        keycloakUserId: idTokenClaims.sub,
        email: idTokenClaims.email as string,
        organizations,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(
        `Authentication failed. This could be due to network issues, Keycloak configuration, or an invalid authorization code. ` +
          `Original error: ${errorMessage}`,
      );
    }
  }

  /**
   * Generate logout URL to terminate Keycloak SSO session
   *
   * @param redirectUri - Where to redirect after logout
   * @returns Logout URL
   */
  getLogoutUrl(redirectUri: string): string {
    return `${this.issuerUrl}/protocol/openid-connect/logout?redirect_uri=${encodeURIComponent(redirectUri)}`;
  }
}

export const authService = new AuthService();
