// DEFAULT / PRODUCTION environment.
// Used by `ng build` (production) — i.e. the Vercel deployment.
// Points at the LIVE API over https.
export const environment = {
  production: true,
  apiBase: 'https://devstack-api.runasp.net/api',
  cloudinary: {
    // Same Cloudinary account as development — uploads are unsigned and
    // client-side, so the cloud name + preset are public by design.
    cloudName: 'dpuvlgxsa',
    uploadPreset: 'nvblarup',
  },
};
