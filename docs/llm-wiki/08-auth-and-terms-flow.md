# Auth and Terms Flow

Use for login, logout, active user, route protection, terms, and onboarding.

## Main Files

- `src/app/app.routes.ts`
- `src/app/guards/auth.guard.ts`
- `src/app/guards/terms.guard.ts`
- `src/app/guards/studio-guide-onboarding.guard.ts`
- `src/app/services/auth.service.ts`
- `src/app/services/auth.interceptor.ts`

## Endpoints

- `GET /services/activeUser`
- `/services/oauth2/authorization/keycloak?frontend_redirect=<target>`
- `/services/logout`

## Guard Matrix

| Route | Guards |
|---|---|
| dashboard | auth, terms, onboarding |
| terms | auth |
| account | auth, terms |
| studio | auth, terms |
| notebook | notebook flag, auth |

## Lookup Order

1. Confirm affected route in `app.routes.ts`.
2. Read the specific guard.
3. Read `AuthService` only for session/login/logout data.
4. Read UI page only for copy or button behavior.

Avoid duplicating credential handling; relative requests already pass through the
credentials interceptor.
