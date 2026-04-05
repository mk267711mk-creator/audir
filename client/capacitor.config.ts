import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.audir.app',
  appName: 'Audir',
  webDir: 'dist',
  server: {
    // Для разработки: укажи IP своего компьютера в локальной сети
    // Например: 'http://192.168.1.100:3001'
    // Для продакшна: закомментируй url и используй задеплоенный бэкенд
    androidScheme: 'http',
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
