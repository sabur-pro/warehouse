import * as FileSystem from 'expo-file-system';
import { BASE_URL } from '../config/api';
import AuthService from './AuthService';

class ImageService {
  private readonly LOCAL_IMAGES_DIR = `${FileSystem.documentDirectory}images/`;

  /**
   * Загрузить изображение на сервер
   * @param localUri - локальный путь к изображению
   * @param accessToken - JWT токен
   * @returns imageUrl на сервере (/storage/{adminId}/{filename})
   */
  async uploadImage(localUri: string, accessToken: string): Promise<string> {
    // Создать FormData
    const formData = new FormData();
    
    // Получить информацию о файле
    const fileInfo = await FileSystem.getInfoAsync(localUri);
    if (!fileInfo.exists) {
      throw new Error('File not found');
    }

    // Определить mime type
    const ext = localUri.split('.').pop()?.toLowerCase();
    const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';

    // Добавить в FormData (React Native требует специального формата)
    const filename = localUri.split('/').pop() || `image.${ext}`;
    formData.append('image', {
      uri: localUri,
      type: mimeType,
      name: filename,
    } as any);

    // Отправить на сервер через AuthService API instance (с автоматическим refresh токена)
    const api = AuthService.getApiInstance();
    const response = await api.post(
      '/storage/upload',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    return response.data.imageUrl;
  }

  /**
   * Скачать изображение с сервера и сохранить локально
   * @param imageUrl - URL на сервере (/storage/{adminId}/{filename})
   * @param accessToken - JWT токен
   * @returns localUri - локальный путь к сохраненному файлу
   */
  async downloadImage(imageUrl: string, accessToken: string): Promise<string> {
    // Создать папку если не существует
    const dirInfo = await FileSystem.getInfoAsync(this.LOCAL_IMAGES_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(this.LOCAL_IMAGES_DIR, { intermediates: true });
    }

    // Получить имя файла из URL
    const filename = imageUrl.split('/').pop() || `image_${Date.now()}.jpg`;
    const localUri = `${this.LOCAL_IMAGES_DIR}${filename}`;

    // Проверить если уже скачан
    const localInfo = await FileSystem.getInfoAsync(localUri);
    if (localInfo.exists) {
      return localUri;
    }

    // Скачать
    const downloadResult = await FileSystem.downloadAsync(
      `${BASE_URL}${imageUrl}`,
      localUri,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    return downloadResult.uri;
  }

  /**
   * Удалить локальное изображение
   */
  async deleteLocalImage(localUri: string): Promise<void> {
    try {
      await FileSystem.deleteAsync(localUri, { idempotent: true });
    } catch (error) {
      console.warn('Failed to delete local image:', error);
    }
  }

  /**
   * Получить локальный путь к изображению или скачать если нет
   */
  async getImageUri(
    serverImageUrl: string | null, 
    localImageUri: string | null, 
    accessToken: string
  ): Promise<string | null> {
    // Если есть локальное изображение - вернуть его
    if (localImageUri) {
      const info = await FileSystem.getInfoAsync(localImageUri);
      if (info.exists) {
        return localImageUri;
      }
    }

    // Если есть серверное - скачать
    if (serverImageUrl) {
      try {
        return await this.downloadImage(serverImageUrl, accessToken);
      } catch (error) {
        console.error('Failed to download image:', error);
        return null;
      }
    }

    return null;
  }

  /**
   * Очистить все локальные изображения (при смене аккаунта)
   */
  async clearAllImages(): Promise<void> {
    try {
      const dirInfo = await FileSystem.getInfoAsync(this.LOCAL_IMAGES_DIR);
      if (dirInfo.exists) {
        await FileSystem.deleteAsync(this.LOCAL_IMAGES_DIR, { idempotent: true });
      }
    } catch (error) {
      console.warn('Failed to clear images:', error);
    }
  }
}

export default new ImageService();
