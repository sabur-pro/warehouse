

import { Platform } from 'react-native';

export const API_CONFIG = {
  // Для Android эмулятора: 10.0.2.2 = localhost компьютера
  // Для физического устройства: используйте IP вашего компьютера (10.231.1.181)
  development: Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000',
  production: 'https://api.sklad.medlife.tj',
};


const ENV = __DEV__ ? 'development' : 'production';

export const BASE_URL =
  (typeof process !== 'undefined' && process.env && process.env.EXPO_PUBLIC_API_URL)
    ? (process.env.EXPO_PUBLIC_API_URL as string)
    : API_CONFIG[ENV];

export const getBaseUrl = (): string => {
  return BASE_URL;
};

if (__DEV__) {
  console.log('🌐 API Configuration:');
  console.log(`   Environment: ${ENV}`);
  console.log(`   Base URL: ${BASE_URL}`);
  console.log(`   Platform: ${Platform.OS}`);
}
