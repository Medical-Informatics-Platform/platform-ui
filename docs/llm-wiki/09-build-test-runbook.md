# Build and Test Runbook

Use for dependency, build, test, proxy, Docker, nginx, and runtime env tasks.

## Requirements

- Node `>=20.0.0`
- npm `>=10.0.0`

## Commands

| Command | Purpose |
|---|---|
| `npm start` | dev server with proxy |
| `npm run build` | production build to `dist/fl-platform` |
| `npm run watch` | development build watch |
| `npm test` | Karma unit tests |

## Key Files

- build: `angular.json`, `tsconfig*.json`, `package.json`
- proxy: `src/proxy.conf.json`
- Docker/nginx: `Dockerfile`, `docker-entrypoint.sh`, `nginx.conf.template`
- runtime env: `src/assets/env.js`, runtime env service

## Proxy

- `/services` -> `http://localhost:8080`
- `/notebook/` -> `http://localhost:8000` with websockets

## Validation

- TypeScript/app change: `npm run build`
- Tested utility/service change: focused spec if available, otherwise
  `npm test`
- Dependency change: `npm ci`, build, tests
- Docker/nginx change: build app, then Docker/manual runtime validation

Avoid `package-lock.json`, Docker, nginx, and broad test output unless the task
requires them.
