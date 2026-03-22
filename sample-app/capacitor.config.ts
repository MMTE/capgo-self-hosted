import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.capgo.demo',
  appName: 'Capgo Demo',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    CapacitorUpdater: {
      autoUpdate: false,
      updateUrl: 'http://localhost:3001/v1/updates',
      statsUrl: 'http://localhost:3001/v1/stats',
      channelUrl: 'http://localhost:3001/v1/channel_self'
    }
  }
};

export default config;
