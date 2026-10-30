# Testing

## Frameworks Detected
- Unit/component tests: Vitest through the Angular CLI `unit-test` builder, in headless Chromium (Vitest browser mode with Playwright, 1280x720 viewport).
- Test configuration: `angular.json` test target and `tsconfig.spec.json`.
- Test setup file: `src/test-setup.ts`. It suppresses known noisy console messages and restores `vi.spyOn` spies after each test.
- `createSpyObj` in `src/app/testing/spy-obj.testing.ts` builds a typed object of `vi.fn()` methods.

## Test Structure
- Specs live beside source files as `*.spec.ts`.
- Service specs are under `src/app/services`.
- Component specs are under their feature directories.
- Visualization registry/renderer specs are under `src/app/pages/experiment-studio/visualisations`.

## Test Output Guardrails
`npm test` maps to `ng test`, which watches when run in a terminal. Do not start full interactive/watch test runs unless the user requested them or has confirmed after being told they may consume substantial runtime/tokens. Prefer focused specs or a verified non-watch command when available.

## Unit Test Command
```bash
npm test
```

Agents should not start it autonomously unless the user requested tests or confirmed the token/runtime cost. A bounded run:

```bash
npm test -- --watch=false                                   # whole suite
npm test -- --watch=false --include src/app/services/x.spec.ts  # one spec
```

The tests need Chromium: run `npx playwright install chromium` once, or set `CHROME_BIN` to an installed Chrome. CI runs the whole suite on pull requests (`.github/workflows/unit-tests.yml`).

## Static Checks (no browser, no backend)
```bash
npm run typecheck       # tsc over the app and spec projects, no emit
npm run check:dead-code # unused exports, orphan CSS/keyframes, unused :root tokens
npm run verify          # typecheck + dead-code + build, in that order
```

## Full Local Validation
```bash
npm run verify
npm test
```

Run the full validation sequence only when warranted by the change and after applying the test output guardrails above.

For authenticated flows, also run manual browser QA against a working backend and Keycloak-compatible auth setup.

## Frontend Manual QA
There is no separate QA checklist file; the list below is it. Walk the affected surface in a browser against a working backend, especially when changing:
- Algorithm result mapping.
- Visualization registries/renderers.
- Histogram and descriptive statistics rendering.
- Dashboard detail or compare views.

## Backend Tests
Not applicable in this frontend repository. Backend behavior must be validated in the backend repository or against a deployed/local backend.

## E2E Tests
Playwright flows live in `e2e/`. They run headless and in parallel against `ng serve`, with every `/services` call mocked in the browser, so they need no backend and no secrets. CI runs them on pull requests (`.github/workflows/e2e-experiment-studio.yml`).

```bash
npm run e2e                              # every spec in e2e/
npm run e2e -- e2e/dashboard.spec.ts     # one file
npm run e2e -- -g "save shows"           # tests whose name matches
```

- `experiment-studio.flows.spec.ts`: studio flows, preprocessing and filter payloads, histogram and describe previews, run and save lifecycle, result rendering. Includes an ordered-transformation flow (PCA columns → K-means on those outputs → `logistic_regression`) that asserts preprocessing step order and `inputdata.variables`.
- `dashboard.spec.ts`: rename, share, delete (with rollback), compare, duplicate.
- `access.spec.ts`: Keycloak redirect, terms acceptance, notebook route on and off.
- `fixtures.ts`: the `test` every spec imports. It installs the mock (`api`), and fails the test if the app called a `/services` endpoint the mock does not answer.
- `experiment-studio-api.ts`: the mock and its data. Linear regression, `describe`, `histogram`, and `pca` answers follow the shapes Exaflow returns (PCA includes `variables`, `components`, and `reusable_preprocessing`). Preprocessing specs expose creators with the `outputs` shape (`pca_column_creator`, `categorical_column_creator`, `kmeans_cluster_creator`). `api.requests` holds every request body, so tests check the payload the studio sent, not only the labels it shows. A test overrides one endpoint with its own `page.route`, which runs before the mock.
- `studio.ts`: shared page steps (open the studio, add variables, apply preprocessing, add PCA/K-means columns, run, save).

### Manual QA (PCA / ordered transformations)
Against a stack with Exaflow `ed9d6982b` or later and the aggregation server deployed:

- Two PCA cards (fit and/or reuse a finished PCA run).
- One K-means card whose clustering variables are PCA output columns.
- Logistic regression on the derived outputs.
- Edit and rerun the saved experiment.
- Confirm creators send `new_column_names` (not `code`) and that there is no `pca_with_transformation` path.

Failed tests keep a trace and a screenshot in `e2e/test-results/`; CI uploads that folder as the `e2e-test-results` artifact. Open a trace with `npx playwright show-trace <trace.zip>`. Locally the tests use the installed Chrome; CI uses Playwright's Chromium.

## Fixtures and Mocks
- Existing unit tests define local fixtures inside specs.
- Component tests commonly provide service stubs and Angular Signals through `TestBed`.
- Shared unit-test helpers live in `src/app/testing/` (for example `createSpyObj`); e2e fixtures and the `/services` mock live in `e2e/`.

## Critical Paths That Need Strong Coverage
- Auth and redirect handling.
- Terms/NDA gating and post-acceptance redirect behavior.
- Experiment creation/run/polling and edit hydration.
- Experiment sharing, rename, and deletion rollback behavior.
- Algorithm availability rules and result mapping.
- Visualization registry compatibility for current and legacy algorithm keys.
- Runtime env and notebook route gating.

## Validation Matrix
| Change type | Required validation |
|---|---|
| UI-only component change | Relevant component spec if available, `npm run build`, and manual browser check for affected route. |
| Styling-only change | `npm run build`, responsive browser check, and `DESIGN.md` review. |
| Service/API integration change | Focused service/component specs, `npm run build`, and backend-backed manual check. |
| Auth/permission/NDA change | Guard/service specs, `npm run build`, manual login/logout/redirect/NDA check, human review. |
| Algorithm availability change | `algorithm-rules.service.spec.ts`, relevant component specs, `npm run build`, manual Studio check. |
| Visualization/result mapping change | Registry/renderer specs, `npm run build`, manual result rendering check using representative payloads. |
| Experiment deletion/sharing change | Service/component specs, rollback/error-path check, manual Dashboard check, human review. |
| Runtime env/nginx/Docker change | `npm run build`, Docker build when practical, runtime env smoke test, human review. |
| Dependency update | `npm ci`, `npm run build`, `npm test`, lockfile review, bundle/runtime smoke check. |
| Refactor without behavior change | Existing relevant specs, `npm run build`, focused manual smoke check for touched feature. |
| Documentation-only change | Path/link sanity check; build is optional unless repo instructions require it. |
