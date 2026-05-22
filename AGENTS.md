# Agent Instructions

## Project Overview
This repository contains `fl-platform`, the Angular 21 standalone frontend for the Medical Informatics Platform (MIP). The app lets authenticated users compose and run experiments, configure algorithms, integrate with JupyterHub when enabled, and review/export experiment results from a backend exposed under `/services`.

## Repository Layout
- `src/main.ts`: Angular bootstrap entrypoint.
- `src/app/app.component.*`, `src/app/app.routes.ts`, `src/app/app.config.ts`: app shell, routing, providers, HTTP, XSRF, zoneless change detection, and ECharts setup.
- `src/app/guards/`: route guards for authentication, terms/NDA acceptance, and studio guide onboarding.
- `src/app/services/`: auth/session, experiment orchestration, dashboard data access, algorithm rules, labeling, runtime env, theme, errors, and PDF/CSV exports.
- `src/app/models/`: frontend and backend DTOs/interfaces for users, algorithms, experiments, filters, and data models.
- `src/app/core/`: algorithm mapping, result enum mapping, constants, and result utility logic.
- `src/app/pages/experiment-studio/`: data model/dataset selection, variable/covariate/filter selection, QueryBuilder filter UI, algorithm configuration, run/edit flows, statistics, visualizations, and result rendering.
- `src/app/pages/experiments-dashboard/`: experiment list/search/pagination, detail view, compare mode, sharing, delete/edit/name updates, and result export.
- `src/app/pages/terms-page/`: NDA/TOS display and acceptance flow.
- `src/app/pages/account-page/`: account/profile view and logout entry.
- `src/app/pages/notebook/`: optional notebook route gated by runtime env.
- `src/app/pages/shared/`: header, footer, spinner, and shared form-control utilities.
- `src/assets/`: runtime `env.js`, logos/icons, footer assets, and terms markdown.
- `public/`: static files copied to the Angular build output.
- `src/styles.css`: global styling and QueryBuilder theming.
- `DESIGN_SYSTEM.yaml`: MIP visual/brand guidance; consult before UI styling changes.
- `Dockerfile`, `docker-entrypoint.sh`, `nginx.conf.template`: container build and nginx/runtime environment injection.
- `.github/workflows/`: image publishing and EBRAINS mirror workflows.
- `docs/`: project documentation, QA checklists, visualization audits, and the durable context system under `docs/context/`.

## Stack
- Language/runtime: TypeScript, HTML templates, CSS, Node 20+, npm 10+.
- Framework: Angular 21 standalone application, Angular Router, Angular Material/CDK, Angular Signals, zoneless change detection.
- Data/async: Angular `HttpClient`, RxJS, browser localStorage/sessionStorage.
- Visualization/export: ECharts via `ngx-echarts`, D3, html2canvas, jsPDF, jsPDF AutoTable.
- Test framework: Jasmine/Karma through Angular CLI.
- Package manager: npm with `package-lock.json`; use `npm ci` for clean installs.
- Container/runtime: Docker multi-stage Node 20 build served by nginx alpine; runtime config injected into `assets/env.js`.

## Setup Commands
```bash
npm ci
```

Requirements:
- Node 20+ and npm 10+.
- Backend reachable at `http://localhost:8080/services` for local development unless `src/proxy.conf.json` is changed.
- Keycloak/OAuth2 endpoints available through the backend proxy for authenticated flows.

## Development Commands
```bash
npm start
```
Runs `ng serve` with `src/proxy.conf.json` from `angular.json`. The app is served at `http://localhost:4200/`.

```bash
npm run watch
```
Runs a development build in watch mode.

## Build Commands
```bash
npm run build
```
Runs the production Angular build. Output is `dist/fl-platform`.

Docker:
```bash
docker build -t fl-platform .
docker run -e PLATFORM_BACKEND_SERVER=platform-backend-service:8080 -e PLATFORM_BACKEND_CONTEXT=services -p 80:80 fl-platform
```

## Test Commands
```bash
npm test
```
Runs Jasmine/Karma unit tests through Angular CLI.

Manual browser QA is required for authenticated experiment workflows and backend-dependent chart/result rendering. See `docs/frontend-browser-qa-checklist.md`.

## Lint / Format / Typecheck
No dedicated lint, format, or standalone typecheck scripts are defined in `package.json`.

Known available checks:
```bash
npm run build
npm test
```

Unknown / TODO: verify whether the project wants dedicated lint, format, or typecheck scripts added later.

## Architecture Rules
- Keep feature UI under the owning page directory in `src/app/pages/...`.
- Keep cross-feature orchestration and backend calls in Angular services under `src/app/services/`.
- Keep backend DTOs and frontend-facing interfaces in `src/app/models/`; map backend shapes before rendering when needed.
- Keep algorithm/result schema mapping in `src/app/core/algorithm-mappers.ts` and result enum label logic in `src/app/core/algorithm-result-enum-mapper.ts`.
- Keep chart and table rendering logic in the existing visualization registries under `src/app/pages/experiment-studio/visualisations/`.
- Keep route protection in guards; do not duplicate auth or NDA checks inside unrelated components.
- Read runtime configuration through the existing runtime env pattern (`window.__env` and `RuntimeEnvService`) rather than scattered direct environment reads.
- Use the `/services` same-origin API boundary; the credentials interceptor adds `withCredentials` to same-origin API calls.
- Preserve the session/local storage keys used for auth redirects, terms redirects, and experiment studio state unless a migration is explicitly planned.

## Coding Conventions
- Prefer standalone Angular components and `imports` arrays over NgModules.
- Prefer Angular Signals for component and feature state where the surrounding code already uses Signals.
- Use `inject()` consistently with nearby services/components.
- Keep TypeScript strictness intact; `tsconfig.json` enables strict templates, no unused locals/parameters, no implicit returns, and related checks.
- Use CSS component styles (`styleLanguage: css`) and global styles only for app-wide concerns.
- Follow `DESIGN_SYSTEM.yaml` for UI aesthetics, brand colors, logo usage, typography, spacing, and visual hierarchy.
- Keep backend API paths relative (`/services/...`) so proxy/nginx routing continues to work.
- Handle backend errors explicitly through local state or `ErrorService`; avoid hiding failures.
- Use existing mapper, label, and registry helpers before adding new presentation logic.
- Add or update Jasmine specs near the changed code when behavior changes.

## Forbidden Patterns
- Do not silently swallow exceptions or failed HTTP calls.
- Do not introduce global mutable state outside established Angular services or runtime env bootstrapping.
- Do not read or write runtime environment values outside the existing config/runtime env layer without a documented reason.
- Do not bypass `AuthGuard`, `TermsGuard`, or the credentials interceptor for authenticated flows.
- Do not change `/services` API contracts, experiment payload shapes, or algorithm result mappings without documenting compatibility impact.
- Do not remove legacy algorithm aliases unless stored historical experiment compatibility has been reviewed.
- Do not introduce new dependencies without explaining why the existing stack is insufficient.
- Do not reformat unrelated files or rewrite unrelated feature structure.
- Do not modify Docker, nginx, CI, auth, sharing, deletion, or runtime env behavior without focused validation and human review.

## Security and Privacy Rules
- Never commit secrets, tokens, cookies, credentials, or private environment values.
- Never print secrets or sensitive experiment/user data in logs.
- Treat authentication, authorization, terms/NDA gating, experiment sharing, experiment deletion, Docker/CI secrets, runtime proxying, and notebook access as human-review areas.
- Preserve same-origin credential and XSRF behavior unless the backend contract is being intentionally changed.
- Validate redirect, share, delete, and notebook behavior carefully because they affect access boundaries.

## PR Expectations
Every agent change should include:
- Summary of behavior/documentation changed.
- Files changed.
- Tests/checks run and results.
- Risk assessment, including auth/API/data/deployment impact if relevant.
- Rollback notes when changes affect runtime behavior, deployment, migrations, data deletion, or public contracts.

## Definition of Done
- The diff is minimal and directly tied to the request.
- Relevant files and existing patterns were read before editing.
- Public API, route, runtime env, and backend contract changes are documented when made.
- Relevant unit tests, build, or manual QA steps passed, or skipped checks are explicitly reported with reasons.
- No unrelated user work, generated artifacts, lockfiles, or formatting churn were introduced.
- For UI changes, `DESIGN_SYSTEM.yaml` was consulted and responsive/authenticated flows were considered.
