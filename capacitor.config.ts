import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'za.co.coffeeshoppro.pos',
  appName: 'CoffeeShop Pro',
  webDir: 'dist/devstack-ui/browser',
  plugins: {
    PushNotifications: {
      // Show pushes as a banner/sound even when the app is in the foreground.
      presentationOptions: ['badge', 'sound', 'alert', 'banner', 'list'],
    },
  },
};

export default config;
