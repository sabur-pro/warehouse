
/**
 * API Configuration
 * 
 * Все запросы идут на продакшн сервер
 */

const API_URL = 'https://api-warehouse.intelligent.tj';

export const API_CONFIG = {
  development: API_URL,
  production: API_URL,
};

export const BASE_URL = API_URL;

export const getBaseUrl = (): string => {
  return BASE_URL;
};

if (__DEV__) {
  console.log('🌐 API Configuration:');
  console.log(`   Base URL: ${BASE_URL}`);
}
