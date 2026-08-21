// DEFAULT / PRODUCTION environment.
// Used by `ng build` (production) — i.e. the Vercel deployment.
// Points at the LIVE API over https.
export const environment = {
  production: true,
  apiBase: 'https://devstack-api.runasp.net/api',
  // Public web origin (this deployed web app) used to build the customer
  // loyalty JOIN QR: <webBase>/join/<SHOPCODE>. On the web build the app also
  // falls back to window.location.origin, so this only needs to be right for
  // the QR generated inside the NATIVE admin app. CONFIRM this matches your
  // Vercel domain.
  webBase: 'https://devstack-one.vercel.app',
  cloudinary: {
    // Same Cloudinary account as development — uploads are unsigned and
    // client-side, so the cloud name + preset are public by design.
    cloudName: 'dpuvlgxsa',
    uploadPreset: 'nvblarup',
  },
};
