import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { HTTP } from './index.js';
import { controller, get } from './index.js';
import { getAvailablePort } from './test-utils.js';

void describe('HTTP App - Static Assets and CSS', () => {
  let server: HTTP;
  let port: number;

  const testController = controller('/').endpoints([
    get('/test', 'test').handler(() => Promise.resolve({ message: 'test' })),
  ]);

  before(async () => {
    port = await getAvailablePort();

    server = new HTTP(
      { controllers: [testController] },
      {
        port,
        oasInfo: {
          title: 'Test API',
          version: '1.0.0',
        },
      },
    );

    await server.start();
  });

  after(async () => {
    await server.stop();
  });

  void it('should serve CSS from /css/main.css', async () => {
    const response = await fetch(`http://localhost:${String(port)}/css/main.css`);

    assert.strictEqual(response.status, 200, 'CSS endpoint should return 200');
    const contentType = response.headers.get('content-type');
    assert.ok(
      contentType?.includes('css'),
      `Expected content-type to include css, got: ${contentType ?? 'null'}`,
    );
  });

  void it('should contain Bulma CSS classes in compiled CSS', async () => {
    const response = await fetch(`http://localhost:${String(port)}/css/main.css`);
    const css = await response.text();

    // Check for Bulma CSS components
    assert.ok(css.includes('.button'), 'CSS should contain Bulma button classes');
    assert.ok(css.length > 1000, 'CSS should be substantially compiled (more than 1KB)');
  });

  void it('should contain Bulma component styles', async () => {
    const response = await fetch(`http://localhost:${String(port)}/css/main.css`);
    const css = await response.text();

    // Bulma includes common components
    // Check for Bulma patterns (navbar, footer, section classes)
    assert.ok(
      css.includes('.navbar') || css.includes('.footer') || css.includes('.section'),
      'CSS should contain Bulma component styles',
    );
  });
});
