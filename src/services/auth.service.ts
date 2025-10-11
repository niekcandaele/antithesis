import * as client from 'openid-client';
import { config } from '../lib/config.js';

/**
 * User claims extracted from ID token
 */
export interface UserClaims {
  keycloakUserId: string; // sub claim
  email: string;
}

/**
 * Authentication service for Keycloak OIDC integration
 *
 * Handles OpenID Connect flow:
 * - OIDC endpoint discovery
 * - Authorization URL generation
 * - Token exchange
 */
export class AuthService {
  private oidcConfig: client.Configuration | null = null;
  private readonly issuerUrl: string;
  private readonly publicIssuerUrl: string;

  constructor() {
    this.issuerUrl = `${config.KEYCLOAK_URL}/realms/${config.KEYCLOAK_REALM}`;
    this.publicIssuerUrl = `${config.KEYCLOAK_PUBLIC_URL}/realms/${config.KEYCLOAK_REALM}`;
  }

  /**
   * Custom fetch function to redirect public URLs to internal URLs
   * and rewrite response bodies to use public URLs
   * This allows the OIDC client to be initialized with the public issuer URL
   * (which matches what Keycloak puts in JWT tokens) while actually making
   * requests to the internal Docker URL
   */
  private customFetch: typeof fetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    // Convert input to URL for manipulation
    const url =
      typeof input === 'string'
        ? new URL(input)
        : input instanceof URL
          ? input
          : new URL(input.url);

    // Replace public issuer URL with internal issuer URL for the request
    const internalUrl = url.href.replace(this.publicIssuerUrl, this.issuerUrl);

    // Make request to internal URL
    const response = await fetch(internalUrl, init);

    // If this is a JSON response (like discovery document), rewrite internal URLs to public URLs
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      const json = await response.json();
      const jsonStr = JSON.stringify(json);
      // Replace all occurrences of internal issuer with public issuer in the response
      const modifiedJsonStr = jsonStr.replaceAll(this.issuerUrl, this.publicIssuerUrl);

      // Create a new response with the modified body
      return new Response(modifiedJsonStr, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }

    return response;
  };

  /**
   * Initialize OIDC client by discovering Keycloak endpoints
   */
  async initialize(): Promise<void> {
    try {
      const discoveryOptions: {
        execute?: ((configuration: client.Configuration) => void)[];
        [client.customFetch]?: typeof fetch;
      } = {};

      // allowInsecureRequests is intentionally used for development/testing with HTTP Keycloak
      if (config.KEYCLOAK_ALLOW_HTTP) {
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        discoveryOptions.execute = [client.allowInsecureRequests];
      }

      // Use custom fetch to redirect public URL requests to internal URL
      discoveryOptions[client.customFetch] = this.customFetch;

      // Initialize with PUBLIC issuer URL (matches JWT tokens from Keycloak)
      // but use custom fetch to redirect requests to internal URL
      this.oidcConfig = await client.discovery(
        new URL(this.publicIssuerUrl),
        config.KEYCLOAK_CLIENT_ID,
        undefined, // Client metadata (optional)
        client.ClientSecretPost(config.KEYCLOAK_CLIENT_SECRET), // Client authentication
        discoveryOptions,
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

    // Auth URL is already using public issuer URL (no replacement needed)
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
      // OIDC client is initialized with public issuer URL, so no normalization needed
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

      return {
        keycloakUserId: idTokenClaims.sub,
        email: idTokenClaims.email as string,
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
    // Use public URL for browser redirect (same as auth URL)
    return `${this.publicIssuerUrl}/protocol/openid-connect/logout?redirect_uri=${encodeURIComponent(redirectUri)}`;
  }
}

export const authService = new AuthService();
