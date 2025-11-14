export type TokenResponse = {
  /** JWT access token (short time expiration) */
  token: string;
};

export type TokenRequest = {
  /** JWT proxy token */
  token: string;
};

export type ProxyPayload = {
  /** JWT expiration */
  exp: number;
  /** JWT audience */
  aud: string;
  /** JWT scope */
  scope?: string;
};

/**
 * Configuration options for the Bridggy client
 */
export type Config = {
  /** Access token for authenticated requests */
  token: string;
  /** Onetime retry GET requests with 2-second delay, when failed on proxy side. Set explicit false to disable */
  retry?: boolean;
};
