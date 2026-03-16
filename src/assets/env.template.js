(function (window) {
    window.__env = window.__env || {};

    // Environment variables
    window.__env.FRONTEND_VERSION = '${FRONTEND_VERSION}';
    window.__env.BACKEND_VERSION = '${BACKEND_VERSION}';
    window.__env.EXAFLOW_VERSION = '${EXAFLOW_VERSION}';
    window.__env.MIP_VERSION = '${MIP_VERSION}';
    window.__env.NOTEBOOK_ENABLED = '${NOTEBOOK_ENABLED}';
    window.__env.JUPYTER_CONTEXT_PATH = '/${JUPYTER_CONTEXT}';
    window.__env.JUPYTER_LANDING_PATH = '${JUPYTER_LANDING_PATH}';
}(this));
