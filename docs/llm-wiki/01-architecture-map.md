# Architecture Map

Standalone Angular app; no root NgModule.

```text
src/main.ts
  -> bootstrapApplication(AppComponent, appConfig)
src/app/app.config.ts
  -> global providers
src/app/app.routes.ts
  -> lazy route map and guards
```

## Core Providers

`app.config.ts` owns router setup, zoneless change detection, HTTP client,
credentials interceptor, XSRF config, and lazy ECharts provider.

## Ownership

| Concern | Start here |
|---|---|
| app shell | `src/app/app.component.*` |
| routes and guards | `src/app/app.routes.ts`, `src/app/guards/` |
| backend orchestration | `src/app/services/` |
| contracts and DTOs | `src/app/models/` |
| algorithm/result mapping | `src/app/core/` |
| feature UI | `src/app/pages/<feature>/` |
| global style/runtime assets | `src/styles.css`, `src/assets/`, `public/` |

Use `indexes/files-by-feature.md` for exact paths.

## Rules

- Prefer standalone components and lazy route imports.
- Keep feature helpers in the owning feature unless reused.
- Put backend calls in services and data shapes in models.
- Do not duplicate algorithm result logic across components; prefer mappers and
  registries.
