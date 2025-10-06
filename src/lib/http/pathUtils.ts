/**
 * Join controller base path with endpoint path
 * Handles leading/trailing slashes correctly
 */
export function joinPaths(basePath: string, endpointPath: string): string {
  // Root controller - no prefix
  if (basePath === '/' || basePath === '') {
    return endpointPath;
  }

  // Normalize paths - ensure leading slash
  const base = basePath.startsWith('/') ? basePath : `/${basePath}`;
  const endpoint = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;

  // Join and remove double slashes
  return `${base}${endpoint}`.replace(/\/+/g, '/');
}
