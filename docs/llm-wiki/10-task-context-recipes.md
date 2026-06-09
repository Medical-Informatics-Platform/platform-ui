# Task Context Recipes

Use when the task is mixed or the entrypoint topic map is not enough.

## Compact Recipes

| Task | Wiki pages | Source lookup | Avoid first |
|---|---|---|---|
| route change | routing, architecture | route path -> target component -> guard | unrelated pages |
| backend API | services, models | endpoint/resource -> service -> model | all services/components |
| auth/session | auth, routing | route -> guard -> `AuthService` | broad UI scan |
| algorithm output | algorithm mapping | algorithm/result key -> mapper case -> registry if needed | whole mapper |
| studio variable/filter | feature, models | selected field -> studio component/service -> model | dashboard/export |
| dashboard display/export | feature, UI, algorithm if result-related | visible label/result key -> detail/compare/export service | studio internals |
| styling | UI | visible text/class -> template -> component CSS | TypeScript services |
| build/deploy | build runbook | config name -> exact build/proxy/Docker file | feature code |

## Escalation Rule

Open broader context only when:

- behavior crosses multiple feature areas;
- targeted search finds multiple plausible owners;
- a shared contract, auth boundary, or runtime/deploy behavior changes;
- the first exact file does not explain the flow.

When escalating, prefer one index page plus one source file at a time.

## Search Before Reading

Use exact route paths, endpoint strings, component selectors, visible labels,
DTO names, algorithm names, result keys, CSS classes, or function names. Use
CodeGraph for callers/callees/signatures when available.
