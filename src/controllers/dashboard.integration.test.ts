import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { HTTP, controller, get } from '../lib/http/index.js';

// Create a test-specific dashboard controller without authentication
// to test the rendering functionality in isolation
const testDashboardController = controller('/').endpoints([
  get('/dashboard', 'getDashboard').renderView('pages/dashboard', () => {
    return {
      title: 'Dashboard',
      currentTenantId: null,
      stats: {
        users: 1234,
        requests: 5678,
        sessions: 42,
      },
      data: [
        { id: 1, name: 'Example Item 1', status: 'active' },
        { id: 2, name: 'Example Item 2', status: 'active' },
        { id: 3, name: 'Example Item 3', status: 'active' },
      ],
    };
  }),
]);

void describe('Dashboard Controller', () => {
  let server: HTTP;
  const port = 3051; // Use a fixed test port

  before(() => {
    server = new HTTP(
      { controllers: [testDashboardController] },
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

  void it('should return HTML with content-type text/html', async () => {
    const response = await fetch(`http://localhost:${String(port)}/dashboard`);

    assert.strictEqual(response.status, 200);
    const contentType = response.headers.get('content-type');
    assert.ok(
      contentType?.includes('text/html'),
      `Expected content-type to include text/html, got: ${contentType ?? 'null'}`,
    );
  });

  void it('should contain DaisyUI component classes', async () => {
    const response = await fetch(`http://localhost:${String(port)}/dashboard`);
    const html = await response.text();

    // Check for DaisyUI components
    assert.ok(html.includes('navbar'), 'HTML should contain navbar class');
    assert.ok(html.includes('stats'), 'HTML should contain stats class');
    assert.ok(html.includes('card'), 'HTML should contain card class');
    assert.ok(html.includes('footer'), 'HTML should contain footer class');
  });

  void it('should contain Tailwind utility classes', async () => {
    const response = await fetch(`http://localhost:${String(port)}/dashboard`);
    const html = await response.text();

    // Check for common Tailwind classes used in dashboard
    assert.ok(html.includes('container'), 'HTML should contain Tailwind container class');
    assert.ok(html.includes('mx-auto'), 'HTML should contain Tailwind mx-auto class');
  });

  void it('should include global context values', async () => {
    const response = await fetch(`http://localhost:${String(port)}/dashboard`);
    const html = await response.text();

    // Check for config.APP_NAME (should be 'antithesis' from config)
    assert.ok(html.includes('antithesis'), 'HTML should contain app name from config');

    // Check for dark theme attribute
    assert.ok(html.includes('data-theme="dark"'), 'HTML should have dark theme data attribute');
  });

  void it('should render passed data correctly', async () => {
    const response = await fetch(`http://localhost:${String(port)}/dashboard`);
    const html = await response.text();

    // Check that data from controller is rendered
    assert.ok(html.includes('1234'), 'HTML should contain users stat (1234)');
    assert.ok(html.includes('5678'), 'HTML should contain requests stat (5678)');
    assert.ok(html.includes('Example Item 1'), 'HTML should contain data table items');
  });
});
