/**
 * Пример использования AuthService для создания API сервисов
 * с автоматическим добавлением токена авторизации
 */

import AuthService from './AuthService';

class ApiService {
  /**
   * Пример запроса к защищенному эндпоинту
   */
  async getWarehouseData() {
    const api = AuthService.getApiInstance();
    const accessToken = await AuthService.getAccessToken();
    
    const response = await api.get('/warehouse/items', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    
    return response.data;
  }

  /**
   * Пример POST запроса
   */
  async createItem(data: any) {
    const api = AuthService.getApiInstance();
    const accessToken = await AuthService.getAccessToken();
    
    const response = await api.post('/warehouse/items', data, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    
    return response.data;
  }

  /**
   * Пример PUT запроса
   */
  async updateItem(id: number, data: any) {
    const api = AuthService.getApiInstance();
    const accessToken = await AuthService.getAccessToken();
    
    const response = await api.put(`/warehouse/items/${id}`, data, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    
    return response.data;
  }

  /**
   * Пример DELETE запроса
   */
  async deleteItem(id: number) {
    const api = AuthService.getApiInstance();
    const accessToken = await AuthService.getAccessToken();
    
    const response = await api.delete(`/warehouse/items/${id}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    
    return response.data;
  }
}

export default new ApiService();

/**
 * ВАЖНО: Все запросы, сделанные через AuthService.getApiInstance(),
 * автоматически обрабатывают 401 ошибки и обновляют токены.
 * 
 * Вам не нужно вручную обрабатывать обновление токенов -
 * это делается автоматически в AuthService.
 */

