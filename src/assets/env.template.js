(function (window) {
    window.__env = window.__env || {};

    // Environment variables
    window.__env.MIP_VERSION = '${MIP_VERSION}';
    window.__env.NOTEBOOK_ENABLED = '${NOTEBOOK_ENABLED}';
    window.__env.JUPYTER_CONTEXT_PATH = '/${JUPYTER_CONTEXT}';
    window.__env.JUPYTER_LANDING_PATH = '${JUPYTER_LANDING_PATH}';
    window.__env.GUIDE_COVARIATE = '${GUIDE_COVARIATE}';
    window.__env.GUIDE_VARIABLE = '${GUIDE_VARIABLE}';
}(this));
