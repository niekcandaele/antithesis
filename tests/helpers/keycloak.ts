/**
 * Keycloak helper utilities for E2E tests
 *
 * Provides programmatic functions to manage test users and organizations:
 * - Create/delete users
 * - Create/delete organizations
 * - Assign users to organizations
 * - Authenticate and get session cookies
 * - Cleanup test data
 */

interface KeycloakConfig {
  url: string;
  realm: string;
  adminClientId: string;
  adminClientSecret: string;
}

interface User {
  id: string;
  username: string;
  email: string;
  enabled: boolean;
}

interface Organization {
  id: string;
  name: string;
  alias: string;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

export class KeycloakTestHelper {
  private accessToken: string | null = null;
  private tokenExpiry = 0;
  private readonly config: KeycloakConfig;
  private readonly tokenUrl: string;
  private readonly adminBaseUrl: string;
  private readonly testUsers: string[] = [];
  private readonly testOrgs: string[] = [];

  constructor(config: KeycloakConfig) {
    this.config = config;
    this.tokenUrl = `${config.url}/realms/${config.realm}/protocol/openid-connect/token`;
    this.adminBaseUrl = `${config.url}/admin/realms/${config.realm}`;
  }

  /**
   * Authenticate with Keycloak Admin API using client credentials
   */
  private async authenticate(): Promise<void> {
    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.config.adminClientId,
      client_secret: this.config.adminClientSecret,
    });

    const response = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      throw new Error(`Failed to authenticate: ${response.status}`);
    }

    const tokenData = (await response.json()) as TokenResponse;
    this.accessToken = tokenData.access_token;
    this.tokenExpiry = Date.now() + (tokenData.expires_in - 5) * 1000;
  }

  /**
   * Ensure valid access token
   */
  private async getToken(): Promise<string> {
    if (!this.accessToken || Date.now() >= this.tokenExpiry) {
      await this.authenticate();
    }
    if (!this.accessToken) {
      throw new Error('Failed to obtain access token');
    }
    return this.accessToken;
  }

  /**
   * Find a user by email
   *
   * @param email - User email to search for
   * @returns User ID if found, null otherwise
   */
  private async findUserByEmail(email: string): Promise<string | null> {
    const token = await this.getToken();

    const response = await fetch(`${this.adminBaseUrl}/users?email=${encodeURIComponent(email)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    const users = (await response.json()) as User[];
    return users.length > 0 ? users[0].id : null;
  }

  /**
   * Create a test user in Keycloak
   * If user already exists, delete and recreate for clean state
   *
   * @param email - User email (also used as username)
   * @param password - User password
   * @returns User object with id
   */
  async createUser(email: string, password: string): Promise<User> {
    const token = await this.getToken();

    // Check if user already exists and delete if found
    const existingUserId = await this.findUserByEmail(email);
    if (existingUserId) {
      await this.deleteUser(existingUserId);
    }

    const userData = {
      username: email,
      email,
      firstName: 'Test',
      lastName: 'User',
      enabled: true,
      emailVerified: true,
      credentials: [
        {
          type: 'password',
          value: password,
          temporary: false,
        },
      ],
    };

    const response = await fetch(`${this.adminBaseUrl}/users`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userData),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create user: ${response.status} ${error}`);
    }

    // Get user ID from Location header
    const location = response.headers.get('Location');
    if (!location) {
      throw new Error('User created but no Location header returned');
    }

    const userId = location.split('/').pop();
    if (!userId) {
      throw new Error('Could not extract user ID from Location header');
    }

    // Track for cleanup
    this.testUsers.push(userId);

    return {
      id: userId,
      username: email,
      email,
      enabled: true,
    };
  }

  /**
   * Find an organization by name
   *
   * @param name - Organization name to search for
   * @returns Organization ID if found, null otherwise
   */
  private async findOrganizationByName(name: string): Promise<string | null> {
    const token = await this.getToken();

    const response = await fetch(`${this.adminBaseUrl}/organizations`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    const orgs = (await response.json()) as Organization[];
    const found = orgs.find((org) => org.name === name);
    return found ? found.id : null;
  }

  /**
   * Create a test organization in Keycloak
   * If organization already exists, delete and recreate for clean state
   *
   * @param name - Organization name
   * @returns Organization object with id
   */
  async createOrganization(name: string): Promise<Organization> {
    const token = await this.getToken();

    // Check if organization already exists and delete if found
    const existingOrgId = await this.findOrganizationByName(name);
    if (existingOrgId) {
      await this.deleteOrganization(existingOrgId);
    }

    const alias = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    const orgData = {
      name,
      alias,
      enabled: true,
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
      throw new Error(`Failed to create organization: ${response.status} ${error}`);
    }

    const location = response.headers.get('Location');
    if (!location) {
      throw new Error('Organization created but no Location header returned');
    }

    const orgId = location.split('/').pop();
    if (!orgId) {
      throw new Error('Could not extract organization ID from Location header');
    }

    // Track for cleanup
    this.testOrgs.push(orgId);

    return {
      id: orgId,
      name,
      alias,
    };
  }

  /**
   * Assign a user to an organization
   *
   * @param userId - Keycloak user ID
   * @param organizationId - Keycloak organization ID
   */
  async assignUserToOrg(userId: string, organizationId: string): Promise<void> {
    const token = await this.getToken();

    const response = await fetch(`${this.adminBaseUrl}/organizations/${organizationId}/members`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userId),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to assign user to organization: ${response.status} ${error}`);
    }
  }

  /**
   * Remove a user from an organization
   *
   * @param userId - Keycloak user ID
   * @param organizationId - Keycloak organization ID
   */
  async removeUserFromOrg(userId: string, organizationId: string): Promise<void> {
    const token = await this.getToken();

    const response = await fetch(
      `${this.adminBaseUrl}/organizations/${organizationId}/members/${userId}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to remove user from organization: ${response.status} ${error}`);
    }
  }

  /**
   * Authenticate as a user and get session cookie
   *
   * @param email - User email
   * @param password - User password
   * @param baseUrl - Application base URL (e.g., http://devbox:3000)
   * @returns Session cookie string for use in Playwright requests
   */
  async loginAs(email: string, password: string, baseUrl: string): Promise<string> {
    // Initiate login flow
    const loginResponse = await fetch(`${baseUrl}/auth/login`, {
      redirect: 'manual',
    });

    const authUrl = loginResponse.headers.get('Location');
    if (!authUrl) {
      throw new Error('No redirect to Keycloak login');
    }

    // Extract session cookie from login redirect
    const setCookie = loginResponse.headers.get('set-cookie');
    const sessionMatch = setCookie?.match(/connect\.sid=([^;]+)/);
    const sessionCookie = sessionMatch ? sessionMatch[1] : null;

    // Submit login form to Keycloak
    const keycloakResponse = await fetch(authUrl, {
      redirect: 'manual',
    });

    const loginFormUrl = keycloakResponse.url;
    const actionMatch = await keycloakResponse.text().then((html) => {
      const match = html.match(/action="([^"]+)"/);
      return match ? match[1].replace(/&amp;/g, '&') : null;
    });

    if (!actionMatch) {
      throw new Error('Could not find login form action');
    }

    const formData = new URLSearchParams({
      username: email,
      password: password,
    });

    const submitResponse = await fetch(actionMatch, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
      redirect: 'manual',
    });

    // Follow redirect back to app
    const callbackUrl = submitResponse.headers.get('Location');
    if (!callbackUrl) {
      throw new Error('No redirect after login');
    }

    const callbackResponse = await fetch(callbackUrl, {
      headers: {
        Cookie: `connect.sid=${sessionCookie}`,
      },
      redirect: 'manual',
    });

    // Extract updated session cookie
    const finalCookie = callbackResponse.headers.get('set-cookie');
    const finalSessionMatch = finalCookie?.match(/connect\.sid=([^;]+)/);

    return finalSessionMatch
      ? `connect.sid=${finalSessionMatch[1]}`
      : `connect.sid=${sessionCookie}`;
  }

  /**
   * Delete a user from Keycloak
   *
   * @param userId - Keycloak user ID
   */
  async deleteUser(userId: string): Promise<void> {
    const token = await this.getToken();

    const response = await fetch(`${this.adminBaseUrl}/users/${userId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok && response.status !== 404) {
      const error = await response.text();
      throw new Error(`Failed to delete user: ${response.status} ${error}`);
    }
  }

  /**
   * Delete an organization from Keycloak
   *
   * @param organizationId - Keycloak organization ID
   */
  async deleteOrganization(organizationId: string): Promise<void> {
    const token = await this.getToken();

    const response = await fetch(`${this.adminBaseUrl}/organizations/${organizationId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok && response.status !== 404) {
      const error = await response.text();
      throw new Error(`Failed to delete organization: ${response.status} ${error}`);
    }
  }

  /**
   * Cleanup all test users and organizations created during the test session
   */
  async cleanup(): Promise<void> {
    // Delete users
    for (const userId of this.testUsers) {
      try {
        await this.deleteUser(userId);
      } catch (error) {
        console.error(`Failed to cleanup user ${userId}:`, error);
      }
    }

    // Delete organizations
    for (const orgId of this.testOrgs) {
      try {
        await this.deleteOrganization(orgId);
      } catch (error) {
        console.error(`Failed to cleanup organization ${orgId}:`, error);
      }
    }

    // Clear tracking arrays
    this.testUsers.length = 0;
    this.testOrgs.length = 0;
  }
}

/**
 * Create a Keycloak helper instance with default configuration
 */
export function createKeycloakHelper(): KeycloakTestHelper {
  return new KeycloakTestHelper({
    url: process.env.KEYCLOAK_URL || 'https://sso.next.takaro.dev',
    realm: process.env.KEYCLOAK_REALM || 'takaro',
    adminClientId: process.env.KEYCLOAK_ADMIN_CLIENT_ID || 'admin-cli',
    adminClientSecret: process.env.KEYCLOAK_ADMIN_CLIENT_SECRET || '',
  });
}
