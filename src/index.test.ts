import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { MockedFunction } from 'vitest';
import { bridggy } from './index.js';

// Mock global fetch
const mockFetch = vi.fn() as MockedFunction<typeof fetch>;
global.fetch = mockFetch as any;

// Mock global btoa and atob
global.btoa = (str: string) => Buffer.from(str, 'binary').toString('base64');
global.atob = (str: string) => Buffer.from(str, 'base64').toString('binary');

describe('Bridggy Client', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe('configure', () => {
    it('should configure the client with token', () => {
      const config = {
        token: 'test-token'
      };

      bridggy.configure(config);
      expect(bridggy['proxyToken']).toBe('test-token');
    });

    it('should set retry to true by default', () => {
      const config = {
        token: 'test-token'
      };

      bridggy.configure(config);
      expect(bridggy['retry']).toBe(true);
    });
  });

  describe('fetch', () => {
    beforeEach(() => {
      // Create a valid JWT token that expires in the future
      const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const payload = btoa(
        JSON.stringify({
          sub: 'test',
          exp: Math.floor(Date.now() / 1000) + 3600, // expires in 1 hour
          scope: 'localhost:8787'
        })
      );
      const accessToken = `${header}.${payload}.signature`;

      bridggy.configure({
        token: 'proxy-token'
      });

      // Set the access token directly to avoid exchange call
      bridggy['token'] = accessToken;
    });

    it('should throw error if config not provided', async () => {
      const freshBridggy = new (bridggy.constructor as any)();
      await expect(freshBridggy.fetch('https://api.example.com/data')).rejects.toThrow('Config not provided');
    });

    it('should make a request to the proxy URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers()
      } as Response);

      await bridggy.fetch('https://api.example.com/data');

      expect(mockFetch).toHaveBeenCalled();
      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).toContain('https://localhost:8787.bridggy.com/proxy?u=');
    });

    it('should remove NonProxyHeaders from request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers()
      } as Response);

      const headers = new Headers();
      headers.set('Content-Type', 'application/json');
      headers.set('User-Agent', 'test-agent');
      headers.set('Cookie', 'session=123');
      headers.set('X-Custom', 'custom-value');

      await bridggy.fetch('https://api.example.com/data', { headers });

      const requestInit = mockFetch.mock.calls[0][1] as RequestInit;
      const requestHeaders = requestInit.headers as Headers;

      // NonProxyHeaders should be removed
      expect(requestHeaders.has('user-agent')).toBe(false);
      expect(requestHeaders.has('cookie')).toBe(false);

      // Custom headers should be preserved
      expect(requestHeaders.get('x-custom')).toBe('custom-value');
      expect(requestHeaders.get('content-type')).toBe('application/json');
    });

    it('should set required Bridggy headers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers()
      } as Response);

      await bridggy.fetch('https://api.example.com/data');

      const requestInit = mockFetch.mock.calls[0][1] as RequestInit;
      const requestHeaders = requestInit.headers as Headers;

      expect(requestHeaders.get('gg-x-source')).toBe('client');
      expect(requestHeaders.get('gg-x-token')).toBeTruthy();
    });

    it('should handle proxy errors', async () => {
      const errorHeaders = new Headers();
      errorHeaders.set('gg-x-error', 'Proxy error occurred');
      errorHeaders.set('gg-x-status', '500');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: errorHeaders
      } as Response);

      await expect(bridggy.fetch('https://api.example.com/data')).rejects.toThrow('status: 500 Proxy error occurred');
    });

    it('should retry on 502 GET requests', async () => {
      const errorHeaders = new Headers();
      errorHeaders.set('gg-x-error', 'Bad Gateway');
      errorHeaders.set('gg-x-status', '502');

      // First call returns 502, second call succeeds
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          headers: errorHeaders
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers()
        } as Response);

      await bridggy.fetch('https://api.example.com/data', { method: 'GET' });

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should not retry on non-GET requests', async () => {
      const errorHeaders = new Headers();
      errorHeaders.set('gg-x-error', 'Bad Gateway');
      errorHeaders.set('gg-x-status', '502');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: errorHeaders
      } as Response);

      await expect(bridggy.fetch('https://api.example.com/data', { method: 'POST' })).rejects.toThrow(
        'status: 502 Bad Gateway'
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should handle Request objects as input', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers()
      } as Response);

      const request = new Request('https://api.example.com/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      await bridggy.fetch(request);

      const requestInit = mockFetch.mock.calls[0][1] as RequestInit;
      expect(requestInit.method).toBe('POST');
    });

    it('should handle URL objects as input', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers()
      } as Response);

      const url = new URL('https://api.example.com/data');
      await bridggy.fetch(url);

      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).toContain('https://localhost:8787.bridggy.com/proxy?u=');
    });
  });

  describe('exchange', () => {
    beforeEach(() => {
      // Create a valid proxy token with aud field
      const proxyHeader = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const proxyPayload = btoa(
        JSON.stringify({
          sub: 'test',
          exp: Math.floor(Date.now() / 1000) + 3600,
          aud: 'http://localhost:8787'
        })
      );
      const proxyToken = `${proxyHeader}.${proxyPayload}.signature`;

      bridggy.configure({
        token: proxyToken
      });
    });

    it('should exchange proxy token for access token', async () => {
      const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const payload = btoa(
        JSON.stringify({
          sub: 'test',
          exp: Math.floor(Date.now() / 1000) + 3600,
          scope: 'localhost:8787'
        })
      );
      const accessToken = `${header}.${payload}.signature`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: accessToken })
      } as Response);

      await bridggy['exchange']();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8787/token/exchange',
        expect.objectContaining({
          method: 'POST'
        })
      );

      expect(bridggy['token']).toBe(accessToken);
    });

    it('should throw error if exchange fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401
      } as Response);

      await expect(bridggy['exchange']()).rejects.toThrow('status: 401 proxy: Token exchange failed');
    });
  });

  describe('isTokenExpired', () => {
    it('should return true if token is not set', () => {
      bridggy['token'] = undefined as any;
      expect(bridggy['isTokenExpired']()).toBe(true);
    });

    it('should return true for expired token', () => {
      const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const payload = btoa(
        JSON.stringify({
          sub: 'test',
          exp: Math.floor(Date.now() / 1000) - 3600 // expired 1 hour ago
        })
      );
      bridggy['token'] = `${header}.${payload}.signature`;

      expect(bridggy['isTokenExpired']()).toBe(true);
    });

    it('should return true for token expiring within 1 minute', () => {
      const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const payload = btoa(
        JSON.stringify({
          sub: 'test',
          exp: Math.floor(Date.now() / 1000) + 30 // expires in 30 seconds
        })
      );
      bridggy['token'] = `${header}.${payload}.signature`;

      expect(bridggy['isTokenExpired']()).toBe(true);
    });

    it('should throw error for malformed token', () => {
      bridggy['token'] = 'invalid-token';

      expect(() => bridggy['isTokenExpired']()).toThrow('invalid or malformed token');
    });
  });
});
