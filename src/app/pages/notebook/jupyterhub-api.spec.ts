import type { MockInstance } from 'vitest';
import {
    HubApiError,
    buildLabUrl,
    ensureServerRunning,
    getHubUser,
    isServerReady,
    startServer,
    waitForServer,
} from './jupyterhub-api';

function hubUserResponse(name: string, ready: boolean, pending: string | null = null): Response {
    return new Response(JSON.stringify({
        name,
        servers: {
            '': {
                ready,
                pending,
            },
        },
    }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}

describe('jupyterhub-api', () => {
    let fetchSpy: MockInstance<typeof fetch>;

    beforeEach(() => {
        fetchSpy = vi.spyOn(window, 'fetch').mockReturnValue(undefined as any);
        document.cookie = '_xsrf=test-token';
    });

    afterEach(() => {
        document.cookie = '_xsrf=; Max-Age=0';
    });

    it('buildLabUrl returns the lab path for a user', () => {
        expect(buildLabUrl('/notebook', 'alice')).toBe('/notebook/user/alice/lab');
    });

    it('getHubUser loads the current hub user', async () => {
        fetchSpy.mockResolvedValue(hubUserResponse('alice', true));

        const user = await getHubUser('/notebook');

        expect(user.name).toBe('alice');
        expect(isServerReady(user)).toBe(true);
    });

    it('startServer sends POST with XSRF header', async () => {
        fetchSpy.mockResolvedValue(new Response(null, { status: 202 }));

        await startServer('/notebook', 'alice');

        expect(fetchSpy).toHaveBeenCalled();
        const [, init] = fetchSpy.mock.lastCall! as [string, RequestInit];
        expect(init.method).toBe('POST');
        expect((init.headers as Headers).get('X-XSRFToken')).toBe('test-token');
    });

    it('ensureServerRunning skips POST when server is already ready', async () => {
        fetchSpy.mockResolvedValue(hubUserResponse('alice', true));

        const user = await ensureServerRunning('/notebook');

        expect(user.name).toBe('alice');
        const userCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/hub/api/user'));
        expect(userCalls.length).toBe(1);
    });

    it('ensureServerRunning does not repeat start POST while polling', async () => {
        let userCalls = 0;
        fetchSpy.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (url.includes('/hub/api/users/alice/server') && init?.method === 'POST') {
                return new Response(null, { status: 202 });
            }
            if (url.includes('/hub/api/user')) {
                userCalls += 1;
                return hubUserResponse('alice', userCalls >= 4, null);
            }
            return new Response(null, { status: 404 });
        });

        const user = await ensureServerRunning('/notebook', {
            pollIntervalMs: 10,
            timeoutMs: 200,
        });

        const startCalls = fetchSpy.mock.calls.filter(([url, init]) => (
            String(url).includes('/hub/api/users/alice/server')
            && (init as RequestInit | undefined)?.method === 'POST'
        ));
        expect(user.name).toBe('alice');
        expect(startCalls.length).toBe(1);
    });

    it('waitForServer times out when server never becomes ready', async () => {
        fetchSpy.mockImplementation(async () => hubUserResponse('alice', false, 'spawn'));

        await expect(waitForServer('/notebook', {
            pollIntervalMs: 10,
            timeoutMs: 50,
        })).rejects.toEqual(expect.objectContaining({
            name: 'HubApiError',
            status: 408,
        }));
    });

    it('getHubUser throws HubApiError on 401', async () => {
        fetchSpy.mockResolvedValue(new Response(null, { status: 401 }));

        await expect(getHubUser('/notebook')).rejects.toEqual(
            new HubApiError('Hub session is not authenticated', 401),
        );
    });
});
