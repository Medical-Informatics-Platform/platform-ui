// The token for the mip Python client, created on the account page: an OAuth 2.0
// authorization-code sign-in with PKCE as the platform's public Keycloak client (from
// GET /services/auth-config), asking for offline_access. Keycloak hands the long-lived
// refresh token to the browser; the page shows it once and nothing stores it.

export interface AuthConfig {
  issuer: string;
  clientId: string;
}

interface PendingSignIn extends AuthConfig {
  state: string;
  verifier: string;
}

const PENDING_KEY = 'mip-cli-token-sign-in';

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

function randomValue(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

// Keycloak's endpoints under the issuer; its discovery document is not needed in the browser.
function endpoint(issuer: string, name: 'auth' | 'token'): string {
  return `${issuer.replace(/\/+$/, '')}/protocol/openid-connect/${name}`;
}

/** Where to send the browser to start the sign-in; remembers state and verifier for the return. */
export async function cliTokenSignInUrl(config: AuthConfig, redirectUri: string): Promise<string> {
  const pending: PendingSignIn = { ...config, state: randomValue(), verifier: randomValue() };
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    scope: 'openid offline_access',
    redirect_uri: redirectUri,
    state: pending.state,
    code_challenge: await codeChallenge(pending.verifier),
    code_challenge_method: 'S256',
  });
  return `${endpoint(config.issuer, 'auth')}?${params}`;
}

/** True when this page load is an authorization response; finishCliTokenSignIn checks it is ours. */
export function isSignInReturn(query: URLSearchParams): boolean {
  return query.has('state') && (query.has('code') || query.has('error'));
}

/** Exchanges the returned code for the refresh token. Errors never include the code or token. */
export async function finishCliTokenSignIn(query: URLSearchParams, redirectUri: string): Promise<string> {
  const raw = sessionStorage.getItem(PENDING_KEY);
  sessionStorage.removeItem(PENDING_KEY);
  const pending: PendingSignIn | null = raw ? JSON.parse(raw) : null;
  if (!pending || query.get('state') !== pending.state) {
    throw new Error('This sign-in was not started on this page. Create the token again.');
  }
  const error = query.get('error');
  if (error) {
    throw new Error(`Keycloak refused the sign-in (${error}).`);
  }
  const response = await fetch(endpoint(pending.issuer, 'token'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: query.get('code') ?? '',
      redirect_uri: redirectUri,
      client_id: pending.clientId,
      code_verifier: pending.verifier,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || typeof body.refresh_token !== 'string') {
    throw new Error(`Could not create the token (${body.error ?? response.status}).`);
  }
  return body.refresh_token;
}
