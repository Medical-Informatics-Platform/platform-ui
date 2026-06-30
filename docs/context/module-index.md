# Module Index

## `src/app`
Purpose: Main Angular application source.
Key files: `app.routes.ts`, `app.config.ts`, `app.component.*`.
Used by: Angular bootstrap from `src/main.ts`.
Rules: Keep app-wide providers, route definitions, and shell wiring here; avoid feature logic in the root shell.
Tests: Root component and route behavior are covered indirectly by page/service specs.
Notes: Uses standalone Angular and zoneless change detection.

## `src/app/guards`
Purpose: Route access control and onboarding gates.
Key files: `auth.guard.ts`, `terms.guard.ts`, `studio-guide-onboarding.guard.ts`.
Used by: `app.routes.ts`.
Rules: Preserve auth and NDA boundaries; do not duplicate guard decisions in unrelated UI code.
Tests: Add focused guard tests when route access behavior changes.
Notes: `/terms` intentionally skips `TermsGuard`; `/notebook` also uses `TermsGuard` and runtime `NOTEBOOK_ENABLED` canMatch.

## `src/app/services`
Purpose: Cross-feature state, backend calls, auth/session, exports, runtime env, rules, and errors.
Key files: `auth.service.ts`, `experiment-studio.service.ts`, `experiments-dashboard.service.ts`, `algorithm-rules.service.ts`, `runtime-env.service.ts`.
Used by: Pages, guards, shared components, and visualization/export flows.
Rules: Keep orchestration and API access here; prefer existing services before adding new shared state.
Tests: Service specs live beside services as `*.spec.ts`.
Notes: `ExperimentStudioService` is high-risk because it coordinates selection state, transient calls, run/edit flows, and sessionStorage persistence.

## `src/app/models`
Purpose: Backend DTOs, frontend models, and shared interfaces.
Key files: `backend-experiment.model.ts`, `backend-algorithms.model.ts`, `algorithm-definition.model.ts`, `data-model.interface.ts`, `filters.model.ts`.
Used by: Services, mappers, page components, and visualization logic.
Rules: Keep API shape changes explicit and compatibility-aware.
Tests: Model changes are usually validated through service/mapper/component tests.
Notes: Prefer extending existing interfaces over ad hoc `any` where practical.

## `src/app/core`
Purpose: Algorithm/result mapping, constants, and utility logic.
Key files: `algorithm-mappers.ts`, `algorithm-result-enum-mapper.ts`, `constants/algorithm.constants.ts`, `outlier-rules.ts`.
Used by: Experiment Studio, result rendering, services, and tests.
Rules: Treat algorithm key aliases and result schema mappings as compatibility-sensitive.
Tests: `algorithm-mappers.spec.ts`, `algorithm-result-enum-mapper.spec.ts`.
Notes: Stored historical experiment payloads may depend on legacy algorithm keys.

## `src/app/pages/experiment-studio`
Purpose: Experiment composition workflow.
Key files: `experiment-studio.component.*`, `variables-panel/*`, `algorithm-panel/*`, `statistic-analysis-panel/*`, `guide/*`.
Used by: `/experiment-studio` route and dashboard edit flows.
Rules: Keep page-specific UI here; use `ExperimentStudioService` for shared selection/run state.
Tests: Component specs live near components.
Notes: Browser validation often requires a backend with data models, algorithms, and authenticated user state.

## `src/app/pages/experiment-studio/visualisations`
Purpose: Chart/table rendering for algorithm outputs, histograms, metadata browsers, and auto-rendered results.
Key files: `charts/chart-registry.ts`, `charts/chart-builder.service.ts`, `auto-renderer/algorithm-table-registry.ts`, renderer files under `charts/renderers`.
Used by: Algorithm result panels, dashboard detail/compare, and statistics views.
Rules: Register new algorithm outputs in the existing registries; preserve legacy aliases when changing algorithm keys.
Tests: Registry and renderer specs live in this subtree.
Notes: See `docs/exareme3-frontend-visualization-audit.md` for historical visualization gaps and compatibility notes.

## `src/app/pages/experiments-dashboard`
Purpose: Experiment listing, filtering, detail, compare, sharing, rename, and deletion UI.
Key files: `experiments-dashboard.component.*`, `experiments-dashboard.mapper.ts`, `experiment-list/*`, `experiment-detail/*`, `experiments-compare/*`, `experiment-search/*`.
Used by: `/experiments-dashboard` route.
Rules: Keep backend-to-frontend mapping in the mapper; preserve rollback behavior for optimistic deletion.
Tests: Add component/mapper tests when list, filter, compare, or detail rendering changes.
Notes: Sharing and deletion are human-review areas.

## `src/app/pages/terms-page`
Purpose: Terms/NDA gate.
Key files: `terms-page.component.*`.
Used by: `/terms` route and `TermsGuard`.
Rules: Preserve acceptance flow and intended redirect behavior.
Tests: Add tests for markdown load, acceptance, and redirect changes.
Notes: Loads `src/assets/tos.md`.

## `src/app/pages/account-page`
Purpose: User account/profile view.
Key files: `account-page.component.*`.
Used by: `/account` route.
Rules: Avoid logging or exposing sensitive user/session data.
Tests: Add component tests for profile/logout behavior changes.
Notes: Logout is implemented in `AuthService`.

## `src/app/pages/notebook`
Purpose: Optional JupyterHub entry route with separate Hub OAuth session.
Key files: `notebook.component.*`, `hub-session.ts`, `hub-http.ts`, `jupyterhub-api.ts`.
Used by: `/notebook` route when runtime env enables it.
Rules: Respect `NOTEBOOK_ENABLED`, `JUPYTER_CONTEXT_PATH`; keep Hub login as top-level navigation; do not pass platform tokens into the iframe.
Tests: `notebook.component.spec.ts`, `hub-session.spec.ts`, `hub-http.spec.ts`, `jupyterhub-api.spec.ts`.
Notes: Platform auth/terms gate entry; Hub session is probed separately. Nginx returns top-level Hub/Lab URLs to `/notebook`. Footer sits below a full-viewport notebook area; scroll to reach it.

## `src/app/pages/shared`
Purpose: Shared shell components and generic helpers.
Key files: `header/*`, `footer/*`, `spinner/*`, `utils/form-control.factory.ts`.
Used by: Root shell and feature pages.
Rules: Keep shared components generic; avoid feature-specific behavior here unless already established.
Tests: Footer has a spec; add focused tests for shared behavior changes.
Notes: Footer displays runtime MIP version. Notebook pill uses `NotebookNavService` (`mip.notebook.nav.seen`) for first-visit glow.

## `src/assets` and `public`
Purpose: Runtime env, brand assets, icons, markdown, and static public files.
Key files: `env.js`, `tos.md`, logos/footer assets.
Used by: App runtime, Angular build assets, nginx container output.
Rules: Do not commit secrets into `env.js`; it is runtime-populated in containers.
Tests: Build verifies asset paths.
Notes: Brand/logo usage should follow `DESIGN_SYSTEM.yaml`.

## `Dockerfile`, `docker-entrypoint.sh`, `nginx.conf.template`
Purpose: Build and serve the Angular app in nginx with runtime environment injection.
Key files: all three root files.
Used by: Docker builds and release image publishing workflow.
Rules: Treat proxy, notebook, and env injection changes as deployment-sensitive.
Tests: Validate with `npm run build`; Docker image build is recommended for container changes.
Notes: Dockerfile uses `npm ci` when `package-lock.json` exists.

## `.github/workflows`
Purpose: Release image publishing and EBRAINS mirroring.
Key files: `publish_images.yml`, `ebrains.yml`.
Used by: GitHub Actions on release, master pushes, and tags.
Rules: Never expose workflow secrets; avoid changing registry/mirror behavior without human review.
Tests: Use workflow syntax review and, if available, CI dry runs.
Notes: No pull-request test/build workflow is currently present.
