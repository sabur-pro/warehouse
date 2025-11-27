
import { Platform } from 'react-native';
import * as Device from 'expo-device';

// Определяем, это физическое устройство или эмулятор
const isPhysicalDevice = Device.isDevice;

// IP адрес вашего компьютера в локальной сети
// ВАЖНО: Обновите этот IP если ваш компьютер получил другой IP в сети
// ИЛИ установите переменную окружения EXPO_PUBLIC_API_URL
const LOCAL_NETWORK_IP = process.env.EXPO_PUBLIC_LOCAL_IP || '192.168.2.1';

/**
 * Конфигурация API URL для разных окружений
 * 
 * Development:
 * - Android эмулятор: 10.0.2.2 (специальный IP эмулятора для localhost хоста)
 * - iOS симулятор: localhost
 * - Физические устройства: IP адрес компьютера в локальной сети
 * 
 * Production: реальный API сервер
 */
export const API_CONFIG = {
  development: (() => {
    if (isPhysicalDevice) {
      // Физическое устройство - используем IP компьютера в сети
      return `http://${LOCAL_NETWORK_IP}:3000`;
    } else {
      // Эмулятор/Симулятор
      return Platform.OS === 'android'
        ? 'http://10.0.2.2:3000'      // Android эмулятор
        : 'http://localhost:3000';     // iOS симулятор
    }
  })(),
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
  console.log(`   Device Type: ${isPhysicalDevice ? 'Physical Device' : 'Emulator/Simulator'}`);
  console.log(`   Base URL: ${BASE_URL}`);
  console.log(`   Platform: ${Platform.OS}`);
}
