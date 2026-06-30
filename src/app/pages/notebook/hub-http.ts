function normalizeBasePath(basePath: string): string {
    if (!basePath) {
        return '/notebook';
    }
    const withLeadingSlash = basePath.startsWith('/') ? basePath : `/${basePath}`;
    return withLeadingSlash.endsWith('/') ? withLeadingSlash.slice(0, -1) : withLeadingSlash;
}

export function hubUrl(basePath: string, path: string): string {
    const normalizedBase = normalizeBasePath(basePath);
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${normalizedBase}${normalizedPath}`;
}

const XSRF_TOKEN_PATTERN = /xsrf_token:\s*"([^"]+)"/;
const XSRF_CACHE_MS = 30_000;

let cachedXsrf: { token: string; fetchedAt: number } | null = null;

function readXsrfTokenFromDocument(doc: Document): string | null {
    const match = doc.cookie.match(/(?:^|;\s*)_xsrf=([^;]*)/);
    if (!match) {
        return null;
    }
    return match[1];
}

export function readXsrfToken(): string | null {
    return readXsrfTokenFromDocument(document);
}

export function clearHubXsrfCache(): void {
    cachedXsrf = null;
}

function cacheXsrfToken(token: string): string {
    cachedXsrf = { token, fetchedAt: Date.now() };
    return token;
}

function parseXsrfTokenFromHtml(html: string): string | null {
    const match = html.match(XSRF_TOKEN_PATTERN);
    return match?.[1] ?? null;
}

async function fetchXsrfTokenFromHubPage(basePath: string): Promise<string | null> {
    try {
        const response = await fetch(hubUrl(basePath, '/hub/home'), {
            method: 'GET',
            credentials: 'include',
            cache: 'no-store',
        });
        if (!response.ok) {
            return null;
        }
        const html = await response.text();
        return parseXsrfTokenFromHtml(html);
    } catch {
        return null;
    }
}

export async function ensureHubXsrf(basePath: string, forceRefresh = false): Promise<string | null> {
    if (!forceRefresh && cachedXsrf && (Date.now() - cachedXsrf.fetchedAt) < XSRF_CACHE_MS) {
        return cachedXsrf.token;
    }

    const cookieToken = readXsrfToken();
    if (cookieToken && !forceRefresh) {
        return cacheXsrfToken(cookieToken);
    }

    const pageToken = await fetchXsrfTokenFromHubPage(basePath);
    if (pageToken) {
        return cacheXsrfToken(pageToken);
    }

    cachedXsrf = null;
    return null;
}

export async function primeHubSession(basePath: string): Promise<void> {
    await ensureHubXsrf(basePath);
}

function appendXsrfQuery(url: string, xsrf: string): string {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}_xsrf=${encodeURIComponent(xsrf)}`;
}

export async function hubFetch(
    basePath: string,
    path: string,
    init: RequestInit = {},
    retryOnXsrf = true,
): Promise<Response> {
    const xsrf = await ensureHubXsrf(basePath);
    const headers = new Headers(init.headers);
    if (xsrf) {
        headers.set('X-XSRFToken', xsrf);
    }

    let url = hubUrl(basePath, path);
    if (xsrf && (!init.method || init.method === 'GET')) {
        url = appendXsrfQuery(url, xsrf);
    }

    const response = await fetch(url, {
        ...init,
        credentials: 'include',
        cache: 'no-store',
        headers,
    });

    if (
        retryOnXsrf
        && (response.status === 403 || response.status === 400)
        && xsrf
    ) {
        const body = await response.clone().text();
        if (body.includes('_xsrf') || body.includes('XSRF')) {
            clearHubXsrfCache();
            return hubFetch(basePath, path, init, false);
        }
    }

    return response;
}
