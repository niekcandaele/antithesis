import { config } from '../lib/config.js';

/**
 * Keycloak organization representation
 */
export interface KeycloakOrganization {
  id: string;
  name: string;
  alias?: string; // URL-safe alias for the organization
  domains?: KeycloakOrganizationDomain[];
  enabled?: boolean;
  attributes?: Record<string, string[]>;
}

/**
 * Keycloak organization domain representation
 */
export interface KeycloakOrganizationDomain {
  name: string;
  verified?: boolean;
}

/**
 * Token response from Keycloak
 */
interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

/**
 * Keycloak Admin API service
 *
 * Handles server-to-server communication with Keycloak Admin API:
 * - Client credentials authentication (service account)
 * - Organization CRUD operations
 * - Token refresh management
 */
export class KeycloakAdminService {
  private accessToken: string | null = null;
  private tokenExpiry = 0;
  private readonly tokenUrl: string;
  private readonly adminBaseUrl: string;

  constructor() {
    const realmUrl = `${config.KEYCLOAK_URL}/realms/${config.KEYCLOAK_REALM}`;
    this.tokenUrl = `${realmUrl}/protocol/openid-connect/token`;
    this.adminBaseUrl = `${config.KEYCLOAK_URL}/admin/realms/${config.KEYCLOAK_REALM}`;
  }

  /**
   * Authenticate with Keycloak using client credentials grant
   * Service account client must be configured with appropriate roles
   */
  async authenticate(): Promise<void> {
    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: config.KEYCLOAK_ADMIN_CLIENT_ID,
      client_secret: config.KEYCLOAK_ADMIN_CLIENT_SECRET,
    });

    const response = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Failed to authenticate with Keycloak Admin API: ${String(response.status)} ${error}`,
      );
    }

    const tokenData = (await response.json()) as TokenResponse;
    this.accessToken = tokenData.access_token;
    // Set expiry with 5 second buffer to avoid edge cases
    this.tokenExpiry = Date.now() + (tokenData.expires_in - 5) * 1000;
  }

  /**
   * Ensure valid access token, refreshing if needed
   */
  private async ensureAuthenticated(): Promise<string> {
    if (!this.accessToken || Date.now() >= this.tokenExpiry) {
      await this.authenticate();
    }
    if (!this.accessToken) {
      throw new Error('Failed to obtain access token');
    }
    return this.accessToken;
  }

  /**
   * Create a new organization in Keycloak
   *
   * @param name - Organization name
   * @param domains - Optional email domains for the organization
   * @returns Created organization with ID
   */
  async createOrganization(name: string, domains?: string[]): Promise<KeycloakOrganization> {
    const token = await this.ensureAuthenticated();

    // Generate a valid alias from the name (lowercase, replace spaces/special chars with dashes)
    const alias = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    const orgData: Partial<KeycloakOrganization> = {
      name,
      alias,
      enabled: true,
      domains: domains?.map((d) => ({ name: d, verified: false })),
    };

    const response = await fetch(`${this.adminBaseUrl}/organizations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orgData),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create organization: ${String(response.status)} ${error}`);
    }

    // Keycloak returns 201 with Location header containing the new org ID
    const location = response.headers.get('Location');
    if (!location) {
      throw new Error('Organization created but no Location header returned');
    }

    const orgId = location.split('/').pop();
    if (!orgId) {
      throw new Error('Could not extract organization ID from Location header');
    }

    // Fetch the created organization to return complete data
    return this.getOrganization(orgId);
  }

  /**
   * Get an organization by ID
   *
   * @param organizationId - Keycloak organization ID
   * @returns Organization data
   */
  async getOrganization(organizationId: string): Promise<KeycloakOrganization> {
    const token = await this.ensureAuthenticated();

    const response = await fetch(`${this.adminBaseUrl}/organizations/${organizationId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get organization: ${String(response.status)} ${error}`);
    }

    return (await response.json()) as KeycloakOrganization;
  }

  /**
   * Update an organization
   *
   * @param organizationId - Keycloak organization ID
   * @param data - Organization data to update
   * @returns Updated organization
   */
  async updateOrganization(
    organizationId: string,
    data: Partial<KeycloakOrganization>,
  ): Promise<KeycloakOrganization> {
    const token = await this.ensureAuthenticated();

    const response = await fetch(`${this.adminBaseUrl}/organizations/${organizationId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to update organization: ${String(response.status)} ${error}`);
    }

    return this.getOrganization(organizationId);
  }

  /**
   * Delete an organization
   *
   * @param organizationId - Keycloak organization ID
   */
  async deleteOrganization(organizationId: string): Promise<void> {
    const token = await this.ensureAuthenticated();

    const response = await fetch(`${this.adminBaseUrl}/organizations/${organizationId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to delete organization: ${String(response.status)} ${error}`);
    }
  }

  /**
   * List all organizations
   *
   * @returns Array of organizations
   */
  async listOrganizations(): Promise<KeycloakOrganization[]> {
    const token = await this.ensureAuthenticated();

    const response = await fetch(`${this.adminBaseUrl}/organizations`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to list organizations: ${String(response.status)} ${error}`);
    }

    return (await response.json()) as KeycloakOrganization[];
  }
}

export const keycloakAdminService = new KeycloakAdminService();
