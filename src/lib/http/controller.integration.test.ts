/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/require-await */
import { describe, test } from 'node:test';
import assert from 'node:assert';
import { controller, bindControllerToApp } from './controller.js';
import { get } from './endpoint.js';
import express from 'express';

describe('Controller path joining', () => {
  test('joins controller base path with endpoint path - both with leading slashes', () => {
    const app = express();
    const routes: string[] = [];

    // Mock app methods to capture registered paths
    const mockMethod = (method: string) => {
      return (path: string, ..._handlers: unknown[]) => {
        routes.push(`${method.toUpperCase()} ${path}`);
      };
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.get = mockMethod('get') as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.post = mockMethod('post') as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.put = mockMethod('put') as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.delete = mockMethod('delete') as any;

    const testController = controller('/api').endpoints([
      get('/users', 'getUsers').handler(async () => ({})),
    ]);

    bindControllerToApp(testController, app);

    assert.strictEqual(routes[0], 'GET /api/users');
  });

  test('joins controller base path with endpoint path - no leading slashes', () => {
    const app = express();
    const routes: string[] = [];

    const mockMethod = (method: string) => {
      return (path: string, ..._handlers: unknown[]) => {
        routes.push(`${method.toUpperCase()} ${path}`);
      };
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.get = mockMethod('get') as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.post = mockMethod('post') as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.put = mockMethod('put') as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.delete = mockMethod('delete') as any;

    const testController = controller('api').endpoints([
      get('users', 'getUsers').handler(async () => ({})),
    ]);

    bindControllerToApp(testController, app);

    assert.strictEqual(routes[0], 'GET /api/users');
  });

  test('handles root controller correctly', () => {
    const app = express();
    const routes: string[] = [];

    const mockMethod = (method: string) => {
      return (path: string, ..._handlers: unknown[]) => {
        routes.push(`${method.toUpperCase()} ${path}`);
      };
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.get = mockMethod('get') as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.post = mockMethod('post') as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.put = mockMethod('put') as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.delete = mockMethod('delete') as any;

    const testController = controller('/').endpoints([
      get('/dashboard', 'getDashboard').handler(async () => ({})),
    ]);

    bindControllerToApp(testController, app);

    assert.strictEqual(routes[0], 'GET /dashboard');
  });

  test('handles empty controller name correctly', () => {
    const app = express();
    const routes: string[] = [];

    const mockMethod = (method: string) => {
      return (path: string, ..._handlers: unknown[]) => {
        routes.push(`${method.toUpperCase()} ${path}`);
      };
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.get = mockMethod('get') as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.post = mockMethod('post') as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.put = mockMethod('put') as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.delete = mockMethod('delete') as any;

    const testController = controller('').endpoints([
      get('/dashboard', 'getDashboard').handler(async () => ({})),
    ]);

    bindControllerToApp(testController, app);

    assert.strictEqual(routes[0], 'GET /dashboard');
  });

  test('joins auth controller with relative login path', () => {
    const app = express();
    const routes: string[] = [];

    const mockMethod = (method: string) => {
      return (path: string, ..._handlers: unknown[]) => {
        routes.push(`${method.toUpperCase()} ${path}`);
      };
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.get = mockMethod('get') as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.post = mockMethod('post') as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.put = mockMethod('put') as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.delete = mockMethod('delete') as any;

    const testController = controller('auth').endpoints([
      get('login', 'login').handler(async () => ({})),
    ]);

    bindControllerToApp(testController, app);

    assert.strictEqual(routes[0], 'GET /auth/login');
  });

  test('joins auth controller with absolute login path', () => {
    const app = express();
    const routes: string[] = [];

    const mockMethod = (method: string) => {
      return (path: string, ..._handlers: unknown[]) => {
        routes.push(`${method.toUpperCase()} ${path}`);
      };
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.get = mockMethod('get') as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.post = mockMethod('post') as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.put = mockMethod('put') as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.delete = mockMethod('delete') as any;

    const testController = controller('/auth').endpoints([
      get('/login', 'login').handler(async () => ({})),
    ]);

    bindControllerToApp(testController, app);

    assert.strictEqual(routes[0], 'GET /auth/login');
  });

  test('handles parameterized routes', () => {
    const app = express();
    const routes: string[] = [];

    const mockMethod = (method: string) => {
      return (path: string, ..._handlers: unknown[]) => {
        routes.push(`${method.toUpperCase()} ${path}`);
      };
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.get = mockMethod('get') as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.post = mockMethod('post') as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.put = mockMethod('put') as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.delete = mockMethod('delete') as any;

    const testController = controller('users').endpoints([
      get('/:id', 'getUserById').handler(async () => ({})),
    ]);

    bindControllerToApp(testController, app);

    assert.strictEqual(routes[0], 'GET /users/:id');
  });

  test('avoids double slashes in joined paths', () => {
    const app = express();
    const routes: string[] = [];

    const mockMethod = (method: string) => {
      return (path: string, ..._handlers: unknown[]) => {
        routes.push(`${method.toUpperCase()} ${path}`);
      };
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.get = mockMethod('get') as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.post = mockMethod('post') as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.put = mockMethod('put') as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.delete = mockMethod('delete') as any;

    const testController = controller('/api/').endpoints([
      get('/users/', 'getUsers').handler(async () => ({})),
    ]);

    bindControllerToApp(testController, app);

    // Should normalize to single slashes
    assert.ok(!routes[0]?.includes('//'), 'Path should not contain double slashes');
  });
});
