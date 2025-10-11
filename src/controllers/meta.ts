import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { controller, get, getServerContext } from '../lib/http/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const metaController = controller('/')
  .description('API metadata and documentation endpoints')
  .endpoints([
    get('/openapi.json', 'getOpenAPISpec')
      .description('Get the OpenAPI specification in JSON format')
      .responseContentType('application/json')
      .handler(() => {
        const ctx = getServerContext();
        return Promise.resolve(ctx.oas.getJsonSpec());
      }),

    get('/rapidoc.js', 'getRapidocScript')
      .description('Serve RapiDoc JavaScript library locally')
      .responseContentType('application/javascript')
      .hideFromOpenAPI()
      .handler(async () => {
        const rapidocPath = join(__dirname, '../../node_modules/rapidoc/dist/rapidoc-min.js');
        const script = await readFile(rapidocPath, 'utf-8');
        return script;
      }),

    get('/api.html', 'getOpenAPIHtml')
      .description('Interactive API documentation using RapiDoc')
      .responseContentType('text/html')
      .handler(() => {
        const html = `<!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <script
          type="module"
          src="/rapidoc.js"
        ></script>
      </head>
      <body>
        <rapi-doc
          spec-url="/openapi.json"
          render-style="read"
          fill-request-fields-with-example="false"
          persist-auth="true"

          sort-tags="true"
          sort-endpoints-by="method"

          show-method-in-nav-bar="as-colored-block"
          show-header="false"
          allow-authentication="true"
          allow-server-selection="false"
          use-path-in-nav-bar="true"

          schema-style="table"
          schema-expand-level="1"
          default-schema-tab="schema"

          primary-color="#3b82f6"
          bg-color="#151515"
          text-color="#c2c2c2"
          header-color="#353535"
        />
      </body>
    </html>
    `;
        return Promise.resolve(html);
      }),
  ]);
