# Backend Endpoints Index

Base path: `/services`.

| Area | Method | Endpoint | Notes |
|---|---|---|---|
| auth | GET | `/services/activeUser` | current user/session |
| auth | GET | `/services/oauth2/authorization/keycloak` | login redirect |
| auth | GET/POST | `/services/logout` | logout |
| catalog | GET | `/services/algorithms` | algorithm catalog |
| catalog | GET | `/services/data-models` | models, datasets, variables |
| experiments | POST | `/services/experiments` | run experiment |
| experiments | POST | `/services/experiments/transient` | preview/transient results |
| experiments | GET | `/services/experiments/:id` | fetch experiment |
| experiments | PATCH | `/services/experiments/:id` | update metadata/share |
| experiments | DELETE | `/services/experiments/:id` | delete experiment |

Search exact endpoint strings before opening services.
