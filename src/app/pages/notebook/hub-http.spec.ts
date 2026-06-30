import { clearHubXsrfCache, hubFetch, hubUrl, readXsrfToken } from './hub-http';

const HUB_HOME_HTML = '<script>xsrf_token: "page-xsrf-token",</script>';

describe('hub-http', () => {
    beforeEach(() => {
        clearHubXsrfCache();
        document.cookie = '_xsrf=; Max-Age=0';
    });

    afterEach(() => {
        document.cookie = '_xsrf=; Max-Age=0';
        clearHubXsrfCache();
    });

    it('hubUrl joins base path and hub route', () => {
        expect(hubUrl('/notebook', '/hub/api/user')).toBe('/notebook/hub/api/user');
    });

    it('readXsrfToken returns the _xsrf cookie', () => {
        document.cookie = '_xsrf=test-token';
        expect(readXsrfToken()).toBe('test-token');
    });

    it('hubFetch parses xsrf_token from /hub/home when the cookie is not readable', async () => {
        const fetchSpy = spyOn(window, 'fetch').and.callFake(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes('/hub/home')) {
                return new Response(HUB_HOME_HTML, { status: 200 });
            }
            if (url.includes('/hub/api/user')) {
                return new Response(null, { status: 200 });
            }
            return new Response(null, { status: 404 });
        });

        await hubFetch('/notebook', '/hub/api/user');

        const homeCall = fetchSpy.calls.allArgs().find(([url]) => String(url).includes('/hub/home'));
        const apiCall = fetchSpy.calls.allArgs().find(([url]) => String(url).includes('/hub/api/user'));
        expect(homeCall).toBeDefined();
        expect(apiCall).toBeDefined();
        expect(String(apiCall![0])).toContain('_xsrf=page-xsrf-token');
        expect((apiCall![1] as RequestInit).headers).toEqual(jasmine.any(Headers));
        expect(((apiCall![1] as RequestInit).headers as Headers).get('X-XSRFToken')).toBe('page-xsrf-token');
    });

    it('hubFetch uses the readable cookie token when available', async () => {
        document.cookie = '_xsrf=cookie-xsrf-token';
        const fetchSpy = spyOn(window, 'fetch').and.resolveTo(new Response(null, { status: 200 }));

        await hubFetch('/notebook', '/hub/api/user');

        const apiCall = fetchSpy.calls.allArgs().find(([url]) => String(url).includes('/hub/api/user'));
        expect(String(apiCall![0])).toContain('_xsrf=cookie-xsrf-token');
        expect(((apiCall![1] as RequestInit).headers as Headers).get('X-XSRFToken')).toBe('cookie-xsrf-token');
        expect(fetchSpy.calls.allArgs().some(([url]) => String(url).includes('/hub/home'))).toBeFalse();
    });
});
