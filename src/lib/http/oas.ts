import {
  extendZodWithOpenApi,
  OpenApiGeneratorV3,
  OpenAPIRegistry,
} from '@asteasolutions/zod-to-openapi';
import z from 'zod';

import { Controller } from './controller.js';
import { Endpoint } from './endpoint.js';

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

    // Create tag and description
    const name = controller.getName();
    const description = controller.getDescription();
    if (name == null) {
      return;
    }
    const tagObj = this.tags.find((t) => t.name === name);
    if (!tagObj) {
      this.tags.push({
        name,
        description,
      });
    } else {
      tagObj.description = description;
    }
  }

  private addEndpoint(endpoint: Endpoint, controllerName?: string) {
    const name = endpoint.getName();
    const backupName = `${endpoint.getMethod().toLowerCase()}${pathToTitle(endpoint.getPath())}`;
    this.registry.registerPath({
      operationId: `${controllerName != null ? `${controllerName}.` : ''}${name ?? backupName}`,
      summary: name,
      description: endpoint.getDescription(),
      method: endpoint.getMethod(),
      // Turn express paths into oas paths (path param conversion)
      path: endpoint.getPath().replace(/:(\w+)/g, '{$1}'),
      tags: controllerName != null ? [controllerName] : undefined,
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
