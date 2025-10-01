import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import { HTTP } from './app.ts';
import { controller } from './controller.ts';
import { get } from './endpoint.ts';
import { getServerContext } from './serverContext.ts';

void describe('ServerContext with AsyncLocalStorage', () => {
  let httpServer: HTTP | undefined;

  after(() => {
    httpServer?.stop();
  });

  void it('should maintain context across async operations in HTTP handler', async () => {
    const results: string[] = [];

    const testController = controller('test')
      .description('Test controller for context')
      .endpoints([
        get('/context-test', 'testContext').handler(async () => {
          const ctx = getServerContext();
          results.push('handler-start');

          // Simulate async operation
          await new Promise((resolve) => setTimeout(resolve, 10));

          // Context should still be available after async operation
          const ctxAfterAsync = getServerContext();
          results.push('handler-after-async');

          assert.strictEqual(
            ctx,
            ctxAfterAsync,
            'Context should be the same after async operation',
          );
          assert.ok(ctx.oas, 'OAS should be available in context');

          // Simulate nested async function
          const nestedResult = await nestedAsyncFunction();
          results.push(nestedResult);

          return { success: true, results };
        }),
      ]);

    async function nestedAsyncFunction(): Promise<string> {
      await new Promise((resolve) => setTimeout(resolve, 5));
      const ctx = getServerContext();
      assert.ok(ctx.oas, 'OAS should be available in nested async function');
      return 'nested-async-complete';
    }

    httpServer = new HTTP(
      {
        controllers: [testController],
      },
      {
        port: 3001,
      },
    );

    httpServer.start();

    // Give server time to start
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Make request to test endpoint
    const response = await fetch('http://localhost:3001/context-test');
    const data = (await response.json()) as { success: boolean; results: string[] };

    assert.ok(response.ok, 'Response should be ok');
    assert.strictEqual(data.success, true);
    assert.deepStrictEqual(data.results, [
      'handler-start',
      'handler-after-async',
      'nested-async-complete',
    ]);

    httpServer.stop();
  });

  void it('should throw error when accessing context outside of request scope', () => {
    assert.throws(
      () => {
        getServerContext();
      },
      (err: Error) => {
        return (
          err instanceof Error &&
          err.message === 'No server context found, was the getServerContextMiddleware used?'
        );
      },
    );
  });

  void it('should maintain separate contexts for concurrent requests', async () => {
    const results = new Map<string, string>();

    const testController = controller('test')
      .description('Test controller for concurrent context')
      .endpoints([
        get('/concurrent/:id', 'testConcurrent').handler(async (_input, req) => {
          const id = req.params.id;
          const ctx = getServerContext();

          results.set(`${id}-start`, ctx.oas.constructor.name);

          // Simulate different processing times
          const delay = id === '1' ? 50 : 10;
          await new Promise((resolve) => setTimeout(resolve, delay));

          const ctxAfter = getServerContext();
          results.set(`${id}-end`, ctxAfter.oas.constructor.name);

          return { id, contextPreserved: ctx === ctxAfter };
        }),
      ]);

    httpServer = new HTTP(
      {
        controllers: [testController],
      },
      {
        port: 3002,
      },
    );

    httpServer.start();

    // Give server time to start
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Make concurrent requests
    const [response1, response2] = await Promise.all([
      fetch('http://localhost:3002/concurrent/1'),
      fetch('http://localhost:3002/concurrent/2'),
    ]);

    const data1 = (await response1.json()) as { id: string; contextPreserved: boolean };
    const data2 = (await response2.json()) as { id: string; contextPreserved: boolean };

    assert.ok(response1.ok);
    assert.ok(response2.ok);
    assert.strictEqual(data1.contextPreserved, true);
    assert.strictEqual(data2.contextPreserved, true);

    // Verify both requests maintained their contexts
    assert.strictEqual(results.size, 4);
    assert.ok(results.has('1-start'));
    assert.ok(results.has('1-end'));
    assert.ok(results.has('2-start'));
    assert.ok(results.has('2-end'));

    httpServer.stop();
  });
});
