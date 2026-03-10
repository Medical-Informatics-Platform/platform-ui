# Step 1: Build the Angular app
FROM node:20-alpine AS build
WORKDIR /app

# Install dependencies with cache mount for npm cache
# Some branches intentionally do not track package-lock.json.
# Copy whichever npm manifest files exist and install accordingly.
COPY package*.json ./
RUN npm config set fetch-retries 10 \
    && npm config set fetch-retry-mintimeout 30000 \
    && npm config set fetch-retry-maxtimeout 300000

RUN --mount=type=cache,target=/root/.npm \
    if [ -f package-lock.json ]; then \
      npm ci --legacy-peer-deps --no-audit --no-fund --registry=https://registry.npmjs.org/; \
    else \
      npm install --legacy-peer-deps --no-audit --no-fund --registry=https://registry.npmjs.org/; \
    fi


# Copy source code
COPY . .

# Build the app with cache mount for Angular cache
ARG BUILD_CONFIGURATION=production
ENV NG_BUILD_SKIP_FONT_GENERATION=1
RUN --mount=type=cache,target=/app/.angular/cache \
    npm run build -- --configuration ${BUILD_CONFIGURATION}

# Step 2: Use Nginx to serve the Angular app
FROM nginx:alpine
RUN apk add --no-cache gettext
ENV PLATFORM_BACKEND_SERVER=platform-backend-service:8080 \
    PLATFORM_BACKEND_CONTEXT=services \
    NOTEBOOK_ENABLED=0 \
    JUPYTER_SERVER=jupyterhub:8000 \
    JUPYTER_CONTEXT=notebook \
    JUPYTER_LANDING_PATH=/hub/spawn
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
RUN rm -rf /usr/share/nginx/html/*
COPY --from=build /app/dist/fl-platform/browser /usr/share/nginx/html
EXPOSE 80
CMD ["/bin/sh", "-c", "envsubst '$$PLATFORM_BACKEND_SERVER $$PLATFORM_BACKEND_CONTEXT $$NOTEBOOK_ENABLED $$JUPYTER_SERVER $$JUPYTER_CONTEXT' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && envsubst '$$FRONTEND_VERSION $$BACKEND_VERSION $$EXAFLOW_VERSION $$MIP_VERSION $$NOTEBOOK_ENABLED $$JUPYTER_CONTEXT $$JUPYTER_LANDING_PATH' < /usr/share/nginx/html/assets/env.template.js > /usr/share/nginx/html/assets/env.js && exec nginx -g 'daemon off;'"]
