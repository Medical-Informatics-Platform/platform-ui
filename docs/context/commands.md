# Commands

## Package Manager
Detected: npm.

Evidence:
- `package-lock.json` exists.
- `package.json` defines npm scripts.
- Dockerfile uses `npm ci` when a lockfile exists.

## Install
```bash
npm ci
```

Use Node 20+ and npm 10+.

## Run Locally
```bash
npm start
```

Runs `ng serve`. `angular.json` configures `src/proxy.conf.json` for the dev server:
- `/services` -> `http://localhost:8080`
- `/notebook/` -> `http://localhost:8000`

## Build
```bash
npm run build
```

Runs `ng build` with production as the default configuration. Build output is `dist/fl-platform`.

Development watch build:
```bash
npm run watch
```

## Test
```bash
npm test
```

Runs Angular CLI Karma tests with Jasmine.

## Lint
Unknown / TODO: verify. No lint script is defined in `package.json`.

## Format
Unknown / TODO: verify. No format script is defined in `package.json`.

## Typecheck
Unknown / TODO: verify. No standalone typecheck script is defined in `package.json`.

Use `npm run build` as the available strict TypeScript/template validation path.

## Database / Migrations
Not applicable in this frontend repository.

## Docker
Build:
```bash
docker build -t fl-platform .
```

Run:
```bash
docker run -e PLATFORM_BACKEND_SERVER=platform-backend-service:8080 -e PLATFORM_BACKEND_CONTEXT=services -p 80:80 fl-platform
```

Runtime env values are written to `assets/env.js` by `docker-entrypoint.sh`.

## CI
Detected workflows:
- `.github/workflows/publish_images.yml`: on published releases, builds and pushes Docker images to Docker Hub and EBRAINS Harbor.
- `.github/workflows/ebrains.yml`: mirrors `master` and tags to EBRAINS GitLab.

Unknown / TODO: verify whether another pipeline outside this repository runs pull-request tests.
