import { cliTokenSignInUrl, codeChallenge, finishCliTokenSignIn, isSignInReturn } from './cli-token';

const config = { issuer: 'https://idp.example/realms/MIP', clientId: 'mip-cli-handson' };
const redirectUri = 'https://portal.example/account';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('cli-token', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => vi.restoreAllMocks());
  afterAll(() => sessionStorage.clear());

  it('derives the PKCE challenge as base64url(SHA-256(verifier)) without padding', async () => {
    // Expected value computed independently with Python's hashlib.
    expect(await codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFXmFDjwM')).toBe(
      '4CLSnxkUKEUvyrSkXOVODl4ymFB08uOtK9zimkO4PAA',
    );
  });

  it('starts an offline sign-in as the public client with PKCE', async () => {
    const url = new URL(await cliTokenSignInUrl(config, redirectUri));

    expect(url.origin + url.pathname).toBe('https://idp.example/realms/MIP/protocol/openid-connect/auth');
    expect(url.searchParams.get('client_id')).toBe('mip-cli-handson');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('openid offline_access');
    expect(url.searchParams.get('redirect_uri')).toBe(redirectUri);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.get('state')).toBeTruthy();
    expect(isSignInReturn(new URLSearchParams({ code: 'c', state: url.searchParams.get('state')! }))).toBe(true);
  });

  it('exchanges the code with the verifier and returns the refresh token', async () => {
    const state = new URL(await cliTokenSignInUrl(config, redirectUri)).searchParams.get('state')!;
    const fetchFn = vi.spyOn(window, 'fetch').mockResolvedValue(
      jsonResponse(200, { access_token: 'a', refresh_token: 'offline-token' }),
    );

    const token = await finishCliTokenSignIn(new URLSearchParams({ code: 'the-code', state }), redirectUri);

    expect(token).toBe('offline-token');
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://idp.example/realms/MIP/protocol/openid-connect/token');
    const body = new URLSearchParams(init!.body as URLSearchParams);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('the-code');
    expect(body.get('client_id')).toBe('mip-cli-handson');
    expect(body.get('redirect_uri')).toBe(redirectUri);
    expect(body.get('code_verifier')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(sessionStorage.length).toBe(0);
  });

  it('refuses a return it did not start, and never sends the code', async () => {
    await cliTokenSignInUrl(config, redirectUri);
    const fetchFn = vi.spyOn(window, 'fetch');

    await expect(
      finishCliTokenSignIn(new URLSearchParams({ code: 'the-code', state: 'forged' }), redirectUri),
    ).rejects.toThrow('not started on this page');
    expect(fetchFn).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
  });

  it('reports Keycloak refusals without the code', async () => {
    const state = new URL(await cliTokenSignInUrl(config, redirectUri)).searchParams.get('state')!;
    vi.spyOn(window, 'fetch').mockResolvedValue(jsonResponse(400, { error: 'invalid_grant' }));

    const failure = finishCliTokenSignIn(new URLSearchParams({ code: 'the-code', state }), redirectUri);

    await expect(failure).rejects.toThrow('invalid_grant');
    await expect(failure).rejects.not.toThrow('the-code');
  });

  it('reports a sign-in the user refused', async () => {
    const state = new URL(await cliTokenSignInUrl(config, redirectUri)).searchParams.get('state')!;

    await expect(
      finishCliTokenSignIn(new URLSearchParams({ error: 'access_denied', state }), redirectUri),
    ).rejects.toThrow('access_denied');
  });
});
