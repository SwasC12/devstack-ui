// DEVELOPMENT environment.
// Used by `ng serve` (the default local dev server).
// Points at your LOCAL API. Both UI and API are http here, so no
// mixed-content issue. Adjust the port if your API runs on a different one.
export const environment = {
  production: false,
  apiBase: 'http://localhost:5099/api',
};
