import type { CapacitorConfig } from '@capacitor/cli';

// Native shells for the App Store and Google Play. The interface is the web app
// built into dist/app; the server address is baked in at build time (VITE_API_URL).
const config: CapacitorConfig = {
  // The store identifier of the app. It can never change once the app is published:
  // pick the final one (usually your domain reversed) before the first upload.
  appId: 'com.olimtalk.app',
  appName: 'OlimTalk',
  webDir: 'dist/app',
  backgroundColor: '#F4F2EE',
  plugins: {
    SplashScreen: {
      // Hidden by the app as soon as it is ready; this is only a safety net.
      launchAutoHide: true,
      launchShowDuration: 3000,
      backgroundColor: '#2F6BFF',
      showSpinner: false,
    },
    SystemBars: {
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
    },
  },
};

export default config;
