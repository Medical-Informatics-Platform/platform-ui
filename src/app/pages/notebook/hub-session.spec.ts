import {
    buildHubLoginUrl,
    buildHubReturnPath,
    clearHubLoginState,
    ensureHubSession,
    hasHubSession,
    markHubLoginPending,
    markHubLoginRedirect,
    redirectToHubLogin,
    shouldRedirectToHubLogin,
    waitForHubSession,
} from './hub-session';

function isHubUserRequest(url: string): boolean {
    return url.includes('/hub/api/user');
}

function isHubHomeRequest(url: string): boolean {
    return url.includes('/hub/home');
}

describe('hub-session', () => {
    beforeEach(() => {
        document.cookie = '_xsrf=test-token';
    });

    afterEach(() => {
        window.history.replaceState({}, '', '/');
        sessionStorage.clear();
        document.cookie = '_xsrf=; Max-Age=0';
    });

    it('buildHubReturnPath uses the Hub home route', () => {
        expect(buildHubReturnPath('/notebook')).toBe('/notebook/hub/home');
    });

    it('buildHubLoginUrl encodes the return path', () => {
        expect(buildHubLoginUrl('/notebook')).toBe('/notebook/hub/login?next=%2Fnotebook%2Fhub%2Fhome');
    });

    it('hasHubSession returns true when /hub/api/user responds with 200', async () => {
        const fetchSpy = spyOn(window, 'fetch').and.resolveTo(new Response(null, { status: 200 }));

        await expectAsync(hasHubSession('/notebook')).toBeResolvedTo(true);

        const apiCall = fetchSpy.calls.allArgs().find(([url]) => isHubUserRequest(String(url)));
        expect(apiCall).toBeDefined();
        expect(String(apiCall![0])).toContain('_xsrf=');
        expect((apiCall![1] as RequestInit).credentials).toBe('include');
    });

    it('hasHubSession returns false when /hub/api/user is unauthorized', async () => {
        spyOn(window, 'fetch').and.resolveTo(new Response(null, { status: 401 }));

        await expectAsync(hasHubSession('/notebook')).toBeResolvedTo(false);
    });

    it('waitForHubSession retries until the Hub session is available', async () => {
        let apiCalls = 0;
        spyOn(window, 'fetch').and.callFake(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (isHubUserRequest(url)) {
                apiCalls += 1;
                if (apiCalls < 3) {
                    return new Response(null, { status: 401 });
                }
                return new Response(null, { status: 200 });
            }
            if (isHubHomeRequest(url)) {
                return new Response(null, { status: 200 });
            }
            return new Response(null, { status: 404 });
        });

        await expectAsync(waitForHubSession('/notebook', { retries: 4, delayMs: 0 }))
            .toBeResolvedTo(true);
        expect(apiCalls).toBe(3);
    });

    it('redirectToHubLogin marks pending state and calls navigate', () => {
        const navigate = jasmine.createSpy('navigate');

        redirectToHubLogin('/notebook', undefined, navigate);

        expect(navigate).toHaveBeenCalledWith(buildHubLoginUrl('/notebook'));
        expect(sessionStorage.getItem('mip_notebook_hub_login_pending')).toBe('1');
    });

    it('shouldRedirectToHubLogin blocks repeated redirects within the cooldown window', () => {
        markHubLoginRedirect();

        expect(shouldRedirectToHubLogin()).toBeFalse();
    });

    it('clearHubLoginState allows another redirect attempt', () => {
        markHubLoginRedirect();
        markHubLoginPending();
        clearHubLoginState();

        expect(shouldRedirectToHubLogin()).toBeTrue();
        expect(sessionStorage.getItem('mip_notebook_hub_login_pending')).toBeNull();
    });

    it('ensureHubSession returns ready when the Hub session already exists', async () => {
        spyOn(window, 'fetch').and.resolveTo(new Response(null, { status: 200 }));

        await expectAsync(ensureHubSession('/notebook')).toBeResolvedTo('ready');
    });

    it('ensureHubSession uses extended wait when login is pending', async () => {
        markHubLoginPending();
        let apiCalls = 0;
        spyOn(window, 'fetch').and.callFake(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (isHubUserRequest(url)) {
                apiCalls += 1;
                if (apiCalls < 5) {
                    return new Response(null, { status: 401 });
                }
                return new Response(null, { status: 200 });
            }
            if (isHubHomeRequest(url)) {
                return new Response(null, { status: 200 });
            }
            return new Response(null, { status: 404 });
        });

        await expectAsync(ensureHubSession('/notebook')).toBeResolvedTo('ready');
        expect(apiCalls).toBe(5);
    }, 15000);

    it('ensureHubSession returns failed when redirect is throttled', async () => {
        markHubLoginRedirect();
        spyOn(window, 'fetch').and.resolveTo(new Response(null, { status: 401 }));

        await expectAsync(ensureHubSession('/notebook')).toBeResolvedTo('failed');
    }, 15000);
});
