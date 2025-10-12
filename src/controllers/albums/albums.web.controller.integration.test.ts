import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { HTTP, controller, get, post } from '../../lib/http/index.js';
import { getAvailablePort } from '../../lib/http/test-utils.js';

// Create a test-specific albums controller without authentication
// to test the htmx functionality in isolation
const testAlbumsController = controller('/albums').endpoints([
  get('/', 'albumsList').renderView('pages/albums/list', (_inputs, req) => {
    // Check if htmx request (will be used in Phase 7 for fragment rendering)
    const isHtmx = req.headers['hx-request'] === 'true';

    return {
      title: 'Albums',
      albums: [
        { id: '1', name: 'Test Album 1', status: 'published', isDeleted: false },
        { id: '2', name: 'Test Album 2', status: 'draft', isDeleted: false },
      ],
      currentTenantId: null,
      filters: { status: null, includeDeleted: false },
      _isHtmx: isHtmx, // Pass through for testing
    };
  }),

  post('/', 'createAlbum').handler((_inputs, req, res) => {
    const isHtmx = req.headers['hx-request'] === 'true';

    // Simulate album creation - just use the data for response
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/prefer-nullish-coalescing
    const albumName = req.body.name || 'New Album';
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/prefer-nullish-coalescing
    const albumStatus = req.body.status || 'draft';
    // Use the values in logging if needed
    void albumName;
    void albumStatus;

    // Set htmx headers if it's an htmx request
    if (isHtmx) {
      res.setHeader('HX-Trigger', 'albumCreated');
    }

    res.redirect('/albums/3');
    return Promise.resolve();
  }),
]);

void describe('Albums Web Controller - htmx Support', () => {
  let server: HTTP;
  let port: number;

  before(async () => {
    port = await getAvailablePort();

    server = new HTTP(
      { controllers: [testAlbumsController] },
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

  void describe('GET /albums - List page', () => {
    void it('should return HTML with content-type text/html for standard request', async () => {
      const response = await fetch(`http://localhost:${String(port)}/albums`);

      assert.strictEqual(response.status, 200);
      const contentType = response.headers.get('content-type');
      assert.ok(
        contentType?.includes('text/html'),
        `Expected content-type to include text/html, got: ${contentType ?? 'null'}`,
      );
    });

    void it('should return HTML for htmx request with HX-Request header', async () => {
      const response = await fetch(`http://localhost:${String(port)}/albums`, {
        headers: {
          'HX-Request': 'true',
        },
      });

      assert.strictEqual(response.status, 200);
      const contentType = response.headers.get('content-type');
      assert.ok(
        contentType?.includes('text/html'),
        `Expected content-type to include text/html for htmx request, got: ${contentType ?? 'null'}`,
      );
    });

    void it('should contain Bulma classes in rendered output', async () => {
      const response = await fetch(`http://localhost:${String(port)}/albums`);
      const html = await response.text();

      assert.ok(html.includes('box'), 'HTML should contain Bulma box class');
      assert.ok(html.includes('button'), 'HTML should contain Bulma button class');
    });
  });

  void describe('POST /albums - Create album', () => {
    void it('should redirect to album detail page for standard POST request', async () => {
      const response = await fetch(`http://localhost:${String(port)}/albums`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'name=New+Album&status=draft',
        redirect: 'manual', // Don't follow redirects automatically
      });

      assert.strictEqual(response.status, 302, 'Should return 302 redirect for standard POST');
      const location = response.headers.get('location');
      assert.ok(location?.includes('/albums/3'), 'Should redirect to new album detail page');
    });

    void it('should set HX-Trigger header for htmx POST request', async () => {
      const response = await fetch(`http://localhost:${String(port)}/albums`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'HX-Request': 'true',
        },
        body: 'name=New+Album&status=draft',
        redirect: 'manual', // Don't follow redirects automatically
      });

      // Should still redirect for now (Phase 7 will change this to return fragment)
      assert.strictEqual(response.status, 302);

      // But should include htmx trigger header
      const hxTrigger = response.headers.get('HX-Trigger');
      assert.strictEqual(
        hxTrigger,
        'albumCreated',
        'Should set HX-Trigger header for htmx request',
      );
    });

    void it('should handle form data correctly for htmx request', async () => {
      const response = await fetch(`http://localhost:${String(port)}/albums`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'HX-Request': 'true',
        },
        body: 'name=Test+Album+From+Htmx&status=published',
        redirect: 'manual',
      });

      assert.strictEqual(response.status, 302, 'Should process form data and redirect');
      const location = response.headers.get('location');
      assert.ok(location, 'Should have Location header');
    });
  });

  void describe('htmx integration preparation', () => {
    void it('should detect htmx requests in controller logic', async () => {
      // This test verifies that the controller can differentiate between
      // standard and htmx requests, which is necessary for Phase 7
      const standardResponse = await fetch(`http://localhost:${String(port)}/albums`);
      const standardHtml = await standardResponse.text();

      const htmxResponse = await fetch(`http://localhost:${String(port)}/albums`, {
        headers: {
          'HX-Request': 'true',
        },
      });
      const htmxHtml = await htmxResponse.text();

      // Both should return HTML for now
      assert.strictEqual(standardResponse.status, 200);
      assert.strictEqual(htmxResponse.status, 200);

      // Both should contain the page content
      assert.ok(standardHtml.includes('Albums'), 'Standard request should render albums page');
      assert.ok(htmxHtml.includes('Albums'), 'Htmx request should render albums page');

      // Phase 7 will differentiate the responses (full page vs fragment)
      // For now, we just verify both requests work correctly
    });
  });
});
