import { describe, it } from 'node:test';
import assert from 'node:assert';
import type { Request, Response } from 'express';
import { isHtmxRequest, htmxRedirect, htmxTrigger } from './htmx.js';

void describe('htmx middleware helpers', () => {
  void describe('isHtmxRequest', () => {
    void it('should return true when HX-Request header is "true"', () => {
      const req = {
        headers: {
          'hx-request': 'true',
        },
      } as unknown as Request;

      assert.strictEqual(isHtmxRequest(req), true);
    });

    void it('should return false when HX-Request header is missing', () => {
      const req = {
        headers: {},
      } as unknown as Request;

      assert.strictEqual(isHtmxRequest(req), false);
    });

    void it('should return false when HX-Request header is not "true"', () => {
      const req = {
        headers: {
          'hx-request': 'false',
        },
      } as unknown as Request;

      assert.strictEqual(isHtmxRequest(req), false);
    });

    void it('should be case-sensitive for header value', () => {
      const req = {
        headers: {
          'hx-request': 'True',
        },
      } as unknown as Request;

      assert.strictEqual(isHtmxRequest(req), false);
    });
  });

  void describe('htmxRedirect', () => {
    void it('should set HX-Redirect header with the provided URL', () => {
      const headers: Record<string, string> = {};
      const res = {
        setHeader: (name: string, value: string) => {
          headers[name] = value;
        },
      } as unknown as Response;

      htmxRedirect(res, '/albums');

      assert.strictEqual(headers['HX-Redirect'], '/albums');
    });

    void it('should handle complex URLs with query parameters', () => {
      const headers: Record<string, string> = {};
      const res = {
        setHeader: (name: string, value: string) => {
          headers[name] = value;
        },
      } as unknown as Response;

      htmxRedirect(res, '/albums?page=2&sort=name');

      assert.strictEqual(headers['HX-Redirect'], '/albums?page=2&sort=name');
    });
  });

  void describe('htmxTrigger', () => {
    void it('should set HX-Trigger header with the provided event name', () => {
      const headers: Record<string, string> = {};
      const res = {
        setHeader: (name: string, value: string) => {
          headers[name] = value;
        },
      } as unknown as Response;

      htmxTrigger(res, 'albumCreated');

      assert.strictEqual(headers['HX-Trigger'], 'albumCreated');
    });

    void it('should handle event names with hyphens', () => {
      const headers: Record<string, string> = {};
      const res = {
        setHeader: (name: string, value: string) => {
          headers[name] = value;
        },
      } as unknown as Response;

      htmxTrigger(res, 'album-created');

      assert.strictEqual(headers['HX-Trigger'], 'album-created');
    });
  });
});
