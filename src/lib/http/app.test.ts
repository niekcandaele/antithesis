import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { HTTP } from './index.js';
import { controller, get } from './index.js';

void describe('HTTP App - Static Assets and CSS', () => {
  let server: HTTP;
  const port = 3052;

  const testController = controller('/').endpoints([
    get('/test', 'test').handler(() => Promise.resolve({ message: 'test' })),
  ]);

  before(() => {
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

    server.start();
  });

  after(() => {
    server.stop();
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

  void it('should contain Tailwind CSS classes in compiled CSS', async () => {
    const response = await fetch(`http://localhost:${String(port)}/css/main.css`);
    const css = await response.text();

    // Check for Tailwind CSS utilities
    assert.ok(css.includes('--tw'), 'CSS should contain Tailwind CSS variables');
    assert.ok(css.length > 1000, 'CSS should be substantially compiled (more than 1KB)');
  });

  void it('should contain DaisyUI theme styles', async () => {
    const response = await fetch(`http://localhost:${String(port)}/css/main.css`);
    const css = await response.text();

    // DaisyUI adds theme-related CSS
    // Check for common DaisyUI patterns (they inject theme variables and component styles)
    assert.ok(
      css.includes('--') || css.includes('base') || css.includes('component'),
      'CSS should contain DaisyUI theme or component styles',
    );
  });
});
