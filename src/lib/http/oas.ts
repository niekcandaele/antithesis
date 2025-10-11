import {
  extendZodWithOpenApi,
  OpenApiGeneratorV3,
  OpenAPIRegistry,
} from '@asteasolutions/zod-to-openapi';
import z from 'zod';

import { Controller } from './controller.js';
import { Endpoint } from './endpoint.js';
import { joinPaths } from './pathUtils.js';

extendZodWithOpenApi(z);

function pathToTitle(input: string): string {
  return (
    input
      // Split the string on non-alphanumeric characters.
      .split(/[^a-zA-Z0-9]/)
      // Map each word, capitalizing the first letter of each word except the first.
      .map((word) => {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      // Join the words back together.
      .join('')
  );
}

/**
 * Normalize controller name into a consistent OpenAPI tag for grouping
 * @example
 * normalizeTag('/albums') → 'Albums'
 * normalizeTag('albums') → 'Albums'
 * normalizeTag('albums/:albumId/photos') → 'Albums'
 * normalizeTag('/auth') → 'Auth'
 * normalizeTag('/') → '/'
 */
function normalizeTag(controllerName: string | undefined): string | undefined {
  if (!controllerName) return undefined;

  // Keep root as-is
  if (controllerName === '/') return '/';

  // Remove leading slash
  const withoutLeadingSlash = controllerName.startsWith('/')
    ? controllerName.slice(1)
    : controllerName;

  // Extract base resource from nested paths like 'albums/:albumId/photos' → 'albums'
  // Split on '/' and take the first segment
  const baseResource = withoutLeadingSlash.split('/')[0];

  // Capitalize first letter
  return baseResource.charAt(0).toUpperCase() + baseResource.slice(1);
}

export type OASInfo = Partial<Parameters<OpenApiGeneratorV3['generateDocument']>[0]['info']>;
export type EndpointOasInfo = Parameters<OpenAPIRegistry['registerPath']>['0'];
interface TagObject {
  name: string;
  description?: string;
}

const zAnyResponse = z.any().openapi('UntypedResponse');

export class Oas {
  private registry: OpenAPIRegistry;
  private document: ReturnType<OpenApiGeneratorV3['generateDocument']> | undefined;
  private tags: TagObject[];
  private jsonTainted = false;

  constructor(private oasInfo: OASInfo | undefined) {
    this.registry = new OpenAPIRegistry();
    this.tags = [];
  }

  addController(controller: Controller) {
    controller.getEndpoints().forEach((endpoint) => {
      // Skip endpoints marked as hidden from OpenAPI
      if (!endpoint.getHideFromOpenAPI()) {
        this.addEndpoint(endpoint, controller.getName());
      }
    });

    // Create tag and description using normalized tag name
    const controllerName = controller.getName();
    const description = controller.getDescription();
    if (controllerName == null) {
      return;
    }

    // Normalize the tag name for consistent grouping
    const normalizedTag = normalizeTag(controllerName);
    if (normalizedTag == null) {
      return;
    }

    // Find existing tag or create new one
    const tagObj = this.tags.find((t) => t.name === normalizedTag);
    if (!tagObj) {
      this.tags.push({
        name: normalizedTag,
        description,
      });
    } else {
      // Merge descriptions - prefer non-empty ones, or append if both have content
      if (description && !tagObj.description) {
        tagObj.description = description;
      } else if (description && tagObj.description && description !== tagObj.description) {
        // If both have different descriptions, keep the more detailed one
        if (description.length > tagObj.description.length) {
          tagObj.description = description;
        }
      }
    }
  }

  private addEndpoint(endpoint: Endpoint, controllerName?: string) {
    const name = endpoint.getName();
    const backupName = `${endpoint.getMethod().toLowerCase()}${pathToTitle(endpoint.getPath())}`;
    // Construct full path by joining controller name with endpoint path
    const fullPath = joinPaths(controllerName ?? '/', endpoint.getPath());
    // Normalize controller name to create consistent tag grouping
    const tag = normalizeTag(controllerName);
    this.registry.registerPath({
      operationId: `${controllerName != null ? `${controllerName}.` : ''}${name ?? backupName}`,
      summary: name,
      description: endpoint.getDescription(),
      method: endpoint.getMethod(),
      // Turn express paths into oas paths (path param conversion)
      path: fullPath.replace(/:(\w+)/g, '{$1}'),
      tags: tag != null ? [tag] : undefined,
      request: {
        params: endpoint.getInputValidationSchema()?.shape.params,
        query: endpoint.getInputValidationSchema()?.shape.query,
        body:
          endpoint.getInputValidationSchema()?.shape.body != null
            ? {
                content: {
                  'application/json': {
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    schema: endpoint.getInputValidationSchema()!.shape.body!,
                  },
                },
              }
            : undefined,
      },
      responses: {
        200: {
          description: 'Response body',
          content: {
            [endpoint.getResponseContentType()]: {
              schema: endpoint.getResponseValidationSchema() ?? zAnyResponse,
            },
          },
        },
      },
      ...endpoint.getOasInfo(),
    });
    this.jsonTainted = true;
  }

  getJsonSpec() {
    if (this.document == null || this.jsonTainted) {
      const generator = new OpenApiGeneratorV3(this.registry.definitions);
      this.document = generator.generateDocument({
        openapi: '3.0.0',
        tags: this.tags,
        info: {
          title: 'API',
          version: '1.0.0',
          ...this.oasInfo,
        },
        servers: [{ url: '/' }],
      });
    }

    return JSON.stringify(this.document);
  }
}
