import { describe, it } from 'node:test';
import assert from 'node:assert';
import { get } from './endpoint.js';

void describe('Endpoint.renderView()', () => {
  void it('should set responseContentType to text/html', () => {
    const endpoint = get('/test', 'testEndpoint').renderView('pages/test', () => ({
      data: 'test',
    }));

    assert.strictEqual(endpoint.getResponseContentType(), 'text/html');
  });

  void it('should store template path correctly', () => {
    const templatePath = 'pages/dashboard';
    const endpoint = get('/test', 'testEndpoint').renderView(templatePath, () => ({
      data: 'test',
    }));

    assert.strictEqual(endpoint.getViewTemplate(), templatePath);
  });

  void it('should store data handler function', () => {
    const dataHandler = () => ({ data: 'test' });
    const endpoint = get('/test', 'testEndpoint').renderView('pages/test', dataHandler);

    assert.strictEqual(endpoint.getViewDataHandler(), dataHandler);
  });

  void it('should allow chaining with other endpoint methods', () => {
    const endpoint = get('/test', 'testEndpoint')
      .description('Test endpoint')
      .renderView('pages/test', () => ({ data: 'test' }));

    assert.strictEqual(endpoint.getDescription(), 'Test endpoint');
    assert.strictEqual(endpoint.getViewTemplate(), 'pages/test');
    assert.strictEqual(endpoint.getResponseContentType(), 'text/html');
  });
});
