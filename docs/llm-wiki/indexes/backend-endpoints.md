# Backend Endpoints Index

Two relative upstreams: `/services` (platform backend; dev proxy -> `:8080`,
nginx -> `PLATFORM_BACKEND_SERVER`) and `/notebook` (JupyterHub; dev proxy ->
`:8000`). Both are same-origin, so `auth.interceptor.ts` covers the `/services`
side and `hub-http.ts` carries the Hub XSRF header.

## Platform backend - base path `/services`

| Area | Method | Endpoint | Notes |
|---|---|---|---|
| auth | GET | `/services/activeUser` | session check behind `AuthGuard` |
| auth | GET | `/services/oauth2/authorization/keycloak` | full-page login redirect, `frontend_redirect` |
| auth | POST | `/services/logout` | full-page sign-out form with `_csrf` |
| terms | POST | `/services/activeUser/agreeNDA` | acceptance from `/terms`; the text itself is the static `assets/tos.md` |
| catalog | GET | `/services/data-models` | models, datasets, variables |
| specifications | GET | `/services/specifications/inputdata` | input DTO |
| specifications | GET | `/services/specifications/preprocessing` | preprocessing step DTOs |
| specifications | GET | `/services/specifications/algorithms` | algorithm catalog and config schema |
| analyses | GET | `/services/analyses` | server page `{ analyses, currentPage, totalPages, totalAnalyses }`; `page,size,mine,notMine,includeShared,orderBy,descending[,algorithm,shared]` |
| analyses | POST | `/services/analyses` | `{ runId, name }` Save a kept run: no re-run; 201 with `result: null`; 404 once expired (24h) |
| analyses | POST | `/services/analyses/preview` | body `{ name, analysisRequest }`; preview without storing |
| analyses | POST | `/services/analyses/runs` | body `{ name, analysisRequest }`; studio Run; the backend keeps a successful result, `uuid` is the run id |
| analyses | GET | `/services/analyses/:uuid` | detail/compare; item field is `analysisRequest` |
| analyses | PATCH | `/services/analyses/:uuid` | `{ name }` rename, `{ shared }` share; `analysisRequest` is not editable |
| analyses | DELETE | `/services/analyses/:uuid` | delete; study membership prunes on 404 |
| studies | GET, POST | `/services/studies` | `{ studies }` / create `{ name, analysisId? }` |
| studies | PATCH, DELETE | `/services/studies/:studyId` | rename / delete |
| studies | POST, DELETE | `/services/studies/:studyId/members[/:analysisId]` | add `{ analysisId }` / remove a run |
| studies | PATCH | `/services/studies/:studyId/members/:analysisId/group` | `{ groupId }`, or `null` to unassign |
| studies | POST | `/services/studies/:studyId/groups` | create a group `{ name, analysisId? }` |
| studies | PATCH, DELETE | `/services/studies/:studyId/groups/:groupId` | rename / delete a group |

No `/services/algorithms` exists: the catalog is read from
`/services/specifications/algorithms`.

## JupyterHub - base path from `JUPYTER_CONTEXT_PATH`, default `/notebook`

| Area | Method | Endpoint | Notes |
|---|---|---|---|
| hub | GET | `/notebook/hub/home` | XSRF prime, `pages/notebook/hub-http.ts` |
| hub | GET | `/notebook/hub/api/user` | session and server state |
| hub | POST | `/notebook/hub/api/users/:username/server` | start the server, retried once after an XSRF prime |
| hub | GET | `/notebook/hub/login?next=...` | full-page login redirect |
| lab | GET | `/notebook/user/:username/lab` | iframe target |

Only `auth.service.ts`, `experiment-studio.service.ts`,
`experiments-dashboard.service.ts`, `experiment-folders.service.ts`,
`terms-page.component.ts` and `src/app/pages/notebook/hub-*.ts` hit the network.

Search exact endpoint strings before opening services.
