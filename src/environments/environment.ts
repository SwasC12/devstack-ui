// DEFAULT / PRODUCTION environment.
// Used by `ng build` (production) — i.e. the Vercel deployment.
// Points at the LIVE API over https.
export const environment = {
  production: true,
  apiBase: 'https://devstack-api.runasp.net/api',
  cloudinary: {
    // Your Cloudinary cloud name and an UNSIGNED upload preset.
    // Create the preset in Cloudinary: Settings → Upload → Upload presets →
    // add one with Signing Mode = "Unsigned".
    cloudName: 'YOUR_CLOUD_NAME',
    uploadPreset: 'YOUR_UNSIGNED_PRESET',
  },
};
