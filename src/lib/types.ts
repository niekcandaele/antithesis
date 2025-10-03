/**
 * Branded type for tenant IDs to prevent accidental use of raw strings
 *
 * @example
 * ```typescript
 * const rawId = 'tenant-123';
 * if (isTenantId(rawId)) {
 *   const tenantId: TenantId = rawId;
 *   // Can now use tenantId safely with type safety
 * }
 * ```
 */
export type TenantId = string & { readonly __brand: 'TenantId' };

/**
 * Type guard to validate if a value is a valid TenantId
 *
 * @param value - The value to check
 * @returns True if the value is a non-empty string (valid TenantId)
 *
 * @example
 * ```typescript
 * const input: unknown = getUserInput();
 * if (isTenantId(input)) {
 *   // input is now typed as TenantId
 *   processTenant(input);
 * }
 * ```
 */
export function isTenantId(value: unknown): value is TenantId {
  return typeof value === 'string' && value.length > 0;
}
