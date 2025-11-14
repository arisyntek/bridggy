import { Config, ProxyPayload, TokenRequest, TokenResponse } from './types.js';

// Headers
export const HeaderStatus = 'gg-x-status';
export const HeaderError = 'gg-x-error';

const HeaderOrigin = 'Origin';
const HeaderToken = 'gg-x-token';
const HeaderTimestamp = 'gg-x-timestamp';
const HeaderSource = 'gg-x-source';

// List of privacy headers to be removed
const NonProxyHeaders = [
  'user-agent',
  'x-forwarded-for',
  'cookie',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade-insecure-requests',
  'priority'
];

// Values
const SourceName = 'client';
const RetryDelay = 2000; // 2 sec

const encoder = new TextEncoder();

/**
 * Bridggy API Client
 */
class Bridggy {
  private proxyToken!: string;
  private token!: string;
  private retry!: boolean;

  constructor(config?: Config) {
    if (config) this.configure(config);
  }

  /**
   * Add configuration. Required to set before fetch() call
   * @param config
   */
  configure(config: Config) {
    this.proxyToken = config.token;
    this.retry = config.retry ?? true;
  }

  /**
   * Execute HTTP request to proxy
   * @param input
   * @param init
   * @return Response
   */
  async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    if (!this.proxyToken) throw new Error('Config not provided');

    if (this.isTokenExpired()) await this.exchange();

    const url = this.getUrl(input);

    // rewrite to proxy URL
    const proxyUrl = `https://${this.getTokenPayload(this.token).scope}.bridggy.com/proxy?u=${this.b64urlEncode(url.href)}`;

    // merge headers
    const headers = new Headers(input instanceof Request ? input.headers : init?.headers);

    headers.set(HeaderSource, SourceName);
    headers.set(HeaderToken, this.token);
    if (typeof window !== 'undefined') headers.set(HeaderOrigin, window.location.origin);

    // remove privacy/browser specific headers
    headers.forEach((_, key) => {
      const lowerKey = key.toLowerCase();
      if (NonProxyHeaders.includes(lowerKey) || lowerKey.startsWith('sec-')) {
        headers.delete(key);
      }
    });

    // create request - spread init first, then override with proxy headers
    const { headers: _initHeaders, ...restInit } = init || {};
    const req: RequestInit = {
      method: input instanceof Request ? input.method : init?.method,
      body: input instanceof Request ? input.body : init?.body,
      redirect: input instanceof Request ? input.redirect : init?.redirect,
      ...restInit, // other init properties
      headers
    };

    for (let i = 0; i < 2; i++) {
      const resp = await fetch(proxyUrl, req);
      const proxyError = resp.headers.get(HeaderError);
      const proxyStatus = resp.headers.get(HeaderStatus);

      // throw error if present
      if (proxyError) {
        // onetime retry on GET
        if (this.retry && i === 0 && req.method === 'GET' && proxyStatus === '502') {
          await this.sleep(RetryDelay);
          continue;
        }
        throw new Error(`status: ${proxyStatus} ${proxyError}`);
      }

      // return response
      return resp;
    }

    // this should never be reached, but TS requires a return
    throw new Error('proxy: unexpected fetch failed after retries');
  }

  /**
   * Exchange main proxy token to access token
   * @private
   */
  private async exchange() {
    const req: TokenRequest = { token: this.proxyToken };

    const headers = [
      ['Content-Type', 'application/json'],
      [HeaderTimestamp, Date.now().toString()],
      [HeaderSource, SourceName]
    ];

    const resp = await fetch(`${this.getTokenPayload(this.proxyToken).aud}/token/exchange`, {
      method: 'POST',
      headers: Object.fromEntries(headers),
      body: JSON.stringify(req)
    });

    if (!resp.ok) {
      throw new Error(`status: ${resp.status} proxy: Token exchange failed`);
    }

    const tokenResp: TokenResponse = await resp.json();

    this.token = tokenResp.token;
  }

  /**
   * Normalize the input to a URL object and get origin
   * @param input
   * @private
   */
  private getUrl(input: RequestInfo | URL): URL {
    let url: URL;

    if (typeof input === 'string') {
      try {
        url = new URL(input);
      } catch {
        throw new TypeError(`input string must be an absolute URL, got "${input}"`);
      }
    } else if (input instanceof URL) {
      url = input;
    } else if (input instanceof Request) {
      url = new URL(input.url);
    } else {
      throw new TypeError('Unsupported input type');
    }

    return url;
  }

  /**
   * Checks token expiration
   * @private
   */
  private isTokenExpired(): boolean {
    if (!this.token) return true;

    try {
      const data = this.getTokenPayload(this.token);

      if (typeof data.exp !== 'number') throw new Error('Malformed token');

      // set expired if less than a minute before expiration
      return Date.now() > data.exp * 1000 - 60_000;
    } catch {
      throw new Error('invalid or malformed token');
    }
  }

  private getTokenPayload(token: string): ProxyPayload {
    const payload = token.split('.')[1];
    if (!payload) throw new Error('Invalid token');

    const p = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(p);
  }

  private b64urlEncode(str: string): string {
    const utf8 = encoder.encode(str);
    let bin = '';
    for (const byte of utf8) bin += String.fromCharCode(byte);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const bridggy = new Bridggy();

export * from './types.js';
