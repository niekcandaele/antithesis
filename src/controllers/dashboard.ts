import { controller, get } from '../lib/http/index.js';
import { requireAuth } from '../lib/http/middleware/auth.middleware.js';

export const dashboardController = controller('/').endpoints([
  get('/dashboard', 'getDashboard')
    .middleware(requireAuth)
    .renderView('pages/dashboard', (_inputs, req) => {
      return {
        title: 'Dashboard',
        currentTenantId: req.session.currentTenantId ?? null,
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

  get('/components', 'getComponentsDemo')
    .description('DaisyUI components demonstration page')
    .renderView('pages/components-demo', () => {
      return {
        title: 'Components Demo',
      };
    }),
]);
