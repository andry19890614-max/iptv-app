import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.myapp.iptv',
  appName: 'IPTV Player',
  webDir: 'build',
  server: {
    androidScheme: 'https'
  },
  android: {
    backgroundColor: '#08080f',
    allowMixedContent: true
  }
};

export default config;
