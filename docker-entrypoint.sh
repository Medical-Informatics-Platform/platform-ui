#!/bin/sh

set -eu

escape_js() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

FRONTEND_VERSION_ESCAPED=$(escape_js "${FRONTEND_VERSION:-}")
BACKEND_VERSION_ESCAPED=$(escape_js "${BACKEND_VERSION:-}")
EXAFLOW_VERSION_ESCAPED=$(escape_js "${EXAFLOW_VERSION:-}")
MIP_VERSION_ESCAPED=$(escape_js "${MIP_VERSION:-}")
NOTEBOOK_ENABLED_ESCAPED=$(escape_js "${NOTEBOOK_ENABLED:-0}")
JUPYTER_CONTEXT_ESCAPED=$(escape_js "${JUPYTER_CONTEXT:-notebook}")
JUPYTER_LANDING_PATH_ESCAPED=$(escape_js "${JUPYTER_LANDING_PATH:-/hub/spawn}")

envsubst '$PLATFORM_BACKEND_SERVER $PLATFORM_BACKEND_CONTEXT $NOTEBOOK_ENABLED $JUPYTER_SERVER $JUPYTER_CONTEXT' \
  < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf

mkdir -p /usr/share/nginx/html/assets

cat > /usr/share/nginx/html/assets/env.js <<EOF
(function (window) {
    window.__env = window.__env || {};

    // Environment variables
    window.__env.FRONTEND_VERSION = "${FRONTEND_VERSION_ESCAPED}";
    window.__env.BACKEND_VERSION = "${BACKEND_VERSION_ESCAPED}";
    window.__env.EXAFLOW_VERSION = "${EXAFLOW_VERSION_ESCAPED}";
    window.__env.MIP_VERSION = "${MIP_VERSION_ESCAPED}";
    window.__env.NOTEBOOK_ENABLED = "${NOTEBOOK_ENABLED_ESCAPED}";
    window.__env.JUPYTER_CONTEXT_PATH = "/${JUPYTER_CONTEXT_ESCAPED}";
    window.__env.JUPYTER_LANDING_PATH = "${JUPYTER_LANDING_PATH_ESCAPED}";
}(this));
EOF

exec nginx -g 'daemon off;'
