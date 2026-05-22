# Decision Log

Use this file for durable architectural decisions.

## Template

### Decision: <title>

Status: Proposed / Accepted / Deprecated

Context:

Decision:

Consequences:

Files affected:

Date:

## Inferred / Verify Decisions

### Decision: Use Angular standalone application structure

Status: Inferred / verify

Context: `angular.json`, `app.config.ts`, and routes use standalone Angular entrypoints and lazy `loadComponent`.

Decision: Keep new UI code in standalone components and configure app-wide providers in `app.config.ts`.

Consequences: Avoid introducing NgModules unless there is a clear compatibility reason.

Files affected: `src/main.ts`, `src/app/app.config.ts`, `src/app/app.routes.ts`.

Date: Unknown / TODO: verify.

### Decision: Use zoneless change detection

Status: Inferred / verify

Context: `app.config.ts` calls `provideZonelessChangeDetection()`.

Decision: Prefer Signal-driven and explicit reactive patterns that work under zoneless change detection.

Consequences: Be careful with code that assumes Zone.js-triggered view updates.

Files affected: `src/app/app.config.ts`, component/service state code.

Date: Unknown / TODO: verify.

### Decision: Keep backend API under same-origin `/services`

Status: Inferred / verify

Context: Services call `/services/...`; local proxy and nginx route this path to the backend.

Decision: Keep frontend API calls relative to `/services` instead of hard-coding backend hosts.

Consequences: Local dev, nginx deployment, credentials, and XSRF behavior stay aligned.

Files affected: `src/proxy.conf.json`, `nginx.conf.template`, `src/app/services/*`.

Date: Unknown / TODO: verify.

### Decision: Inject runtime config through `assets/env.js`

Status: Inferred / verify

Context: `docker-entrypoint.sh` writes `assets/env.js`; `RuntimeEnvService` reads `window.__env`.

Decision: Keep deployment-specific values out of the compiled Angular bundle when possible.

Consequences: Container runtime can change backend/notebook/version settings without rebuilding the app.

Files affected: `docker-entrypoint.sh`, `src/assets/env.js`, `src/app/services/runtime-env.service.ts`.

Date: Unknown / TODO: verify.
