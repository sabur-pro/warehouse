import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import AuthService from './AuthService';
import { getDatabaseInstance, runWithRetry, getFirstWithRetry } from '../../database/database';

// Конфигурация уведомлений
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

class NotificationService {
  private notificationListener: Notifications.Subscription | null = null;
  private responseListener: Notifications.Subscription | null = null;

  /**
   * Зарегистрировать Expo Push Token на сервере
   */
  async registerPushToken(): Promise<void> {
    try {
      // Проверить что это реальное устройство
      if (!Device.isDevice) {
        console.warn('Push notifications only work on physical devices');
        return;
      }

      // Получить токен
      const token = await this.getExpoPushToken();
      if (!token) {
        console.warn('Failed to get push token');
        return;
      }

      console.log('📲 Expo Push Token:', token);

      // Сохранить локально
      await this.savePushTokenLocally(token);

      // Отправить на сервер
      const accessToken = await AuthService.getAccessToken();
      if (!accessToken) {
        console.warn('No access token, skipping server registration');
        return;
      }

      const api = AuthService.getApiInstance();
      const deviceInfo = {
        brand: Device.brand,
        manufacturer: Device.manufacturer,
        modelName: Device.modelName,
        osName: Device.osName,
        osVersion: Device.osVersion,
        platform: Platform.OS,
      };

      await api.post('/notifications/register-token', {
        token,
        deviceInfo,
      }, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      console.log('✅ Push token registered successfully');
    } catch (error) {
      console.error('❌ Failed to register push token:', error);
    }
  }

  /**
   * Получить Expo Push Token
   */
  private async getExpoPushToken(): Promise<string | null> {
    try {
      // Запросить разрешения
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.warn('Permission for notifications not granted');
        return null;
      }

      // Получить токен
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: 'a8b23124-dac2-49fe-9d0c-fc62754bda89',
      });

      return tokenData.data;
    } catch (error) {
      console.error('Error getting push token:', error);
      return null;
    }
  }

  /**
   * Сохранить токен в локальную БД
   */
  private async savePushTokenLocally(token: string): Promise<void> {
    const db = await getDatabaseInstance();
    
    // Проверить существует ли токен
    const existing = await getFirstWithRetry<{ id: number }>(
      db,
      'SELECT id FROM push_token WHERE token=?',
      [token]
    );

    if (!existing) {
      await runWithRetry(db, `
        INSERT INTO push_token (id, token, isActive) 
        VALUES (1, ?, 1)
        ON CONFLICT(id) DO UPDATE SET token=?, isActive=1
      `, [token, token]);
    }
  }

  /**
   * Настроить обработчики уведомлений
   */
  setupNotificationListeners(onNotificationReceived?: (notification: any) => void): void {
    // Обработчик входящих уведомлений (когда приложение открыто)
    this.notificationListener = Notifications.addNotificationReceivedListener(notification => {
      console.log('📬 Notification received:', notification);
      
      if (onNotificationReceived) {
        onNotificationReceived(notification);
      }
    });

    // Обработчик нажатий на уведомления
    this.responseListener = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('👆 Notification tapped:', response);
      
      const data = response.notification.request.content.data;
      
      // Обработка разных типов уведомлений
      if (data.type === 'pending_action') {
        // Перейти к экрану pending actions
        console.log('Navigate to pending action:', data.id);
      } else if (data.type === 'action_approved') {
        // Показать сообщение или обновить данные
        console.log('Action approved:', data.id);
      } else if (data.type === 'action_rejected') {
        // Показать сообщение
        console.log('Action rejected:', data.id);
      }
    });
  }

  /**
   * Удалить обработчики
   */
  removeNotificationListeners(): void {
    if (this.notificationListener) {
      Notifications.removeNotificationSubscription(this.notificationListener);
      this.notificationListener = null;
    }
    if (this.responseListener) {
      Notifications.removeNotificationSubscription(this.responseListener);
      this.responseListener = null;
    }
  }

  /**
   * Показать локальное уведомление
   */
  async showLocalNotification(title: string, body: string, data?: any): Promise<void> {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: true,
      },
      trigger: null, // Показать сразу
    });
  }

  /**
   * Деактивировать токен на сервере (при выходе)
   */
  async deactivatePushToken(): Promise<void> {
    try {
      const db = await getDatabaseInstance();
      const tokenData = await getFirstWithRetry<{ token: string }>(
        db,
        'SELECT token FROM push_token WHERE id=1'
      );

      if (!tokenData?.token) {
        return;
      }

      const accessToken = await AuthService.getAccessToken();
      if (!accessToken) {
        return;
      }

      const api = AuthService.getApiInstance();
      await api.delete(`/notifications/deactivate-token/${tokenData.token}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      // Обновить локально
      await runWithRetry(db, 'UPDATE push_token SET isActive=0 WHERE id=1', []);

      console.log('✅ Push token deactivated');
    } catch (error) {
      console.error('❌ Failed to deactivate push token:', error);
    }
  }
}

export default new NotificationService();
