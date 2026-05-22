# Risk Register

| Area | Risk | Evidence | Agent guidance | Human review required? |
|---|---|---|---|---|
| Authentication/session | Login, logout, redirect, and session state can break access to the whole app. | `AuthService`, `AuthGuard`, `/services/activeUser`, Keycloak redirect URLs. | Keep redirects same-origin, preserve `redirect_url`, test login/logout manually. | Yes |
| Terms/NDA gate | Users may bypass or get stuck behind acceptance flow. | `TermsGuard`, `TermsService`, `/terms`, `agreeNDA`, `tos_redirect_url`. | Preserve route guard order and post-acceptance redirect behavior. | Yes |
| Same-origin credentials/XSRF | API calls can lose cookies or XSRF headers. | `auth.interceptor.ts`, `provideHttpClient`, XSRF config in `app.config.ts`. | Do not bypass the interceptor; validate authenticated API calls. | Yes |
| Experiment run/edit state | User selections and experiment payloads can become inconsistent. | `ExperimentStudioService` manages selections, configs, run/polling, transient calls, and sessionStorage. | Make focused changes; add service/component tests and manual Studio validation. | Usually |
| Experiment deletion | Optimistic UI changes may hide failed backend deletion or delete wrong item. | `ExperimentsDashboardService.deleteExperiment` updates UI before backend response and rolls back on failure. | Preserve rollback and error reporting; manually test failure paths when possible. | Yes |
| Experiment sharing | Incorrect sharing state can expose or hide experiments. | Dashboard service patches `shared` and updates list state. | Treat `shared` changes as permission-sensitive; verify backend contract. | Yes |
| Algorithm availability | Algorithms can become incorrectly enabled/disabled. | `AlgorithmRulesService` and related specs. | Add tests for changed role/type/count rules. | Usually |
| Result mapping and visualization | Supported algorithm outputs may render blank or incorrectly. | `algorithm-mappers.ts`, table/chart registries, existing visualization audit docs. | Preserve legacy aliases; add registry/renderer tests for payload shape changes. | Usually |
| Runtime environment | Wrong env injection can break version display, notebook, or proxy context. | `docker-entrypoint.sh`, `RuntimeEnvService`, `nginx.conf.template`. | Do not read env values ad hoc; validate container runtime when changed. | Yes |
| Notebook proxy | Notebook route/proxy can expose unavailable or unintended upstreams. | `/notebook` route, `NOTEBOOK_ENABLED`, nginx notebook location. | Keep Angular gating aligned with nginx gating. | Yes |
| Docker image publishing | Release workflow uses registry credentials and pushes images. | `.github/workflows/publish_images.yml`. | Never print secrets; review registry/tag changes carefully. | Yes |
| EBRAINS mirroring | Workflow pushes code/tags to an external GitLab mirror. | `.github/workflows/ebrains.yml`. | Avoid changing mirror refs or credentials handling without owner review. | Yes |
| Dependencies | Updates can affect Angular build, bundle output, and chart/export libraries. | `package.json`, `package-lock.json`. | Explain need, review lockfile, run build/tests. | Yes |
| Design and branding | UI changes can violate MIP brand guidelines. | `DESIGN_SYSTEM.yaml`, logos/assets. | Follow approved colors, logo rules, and UI hierarchy. | For visible brand changes |
