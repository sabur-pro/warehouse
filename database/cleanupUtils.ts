// database/cleanupUtils.ts
import * as FileSystem from 'expo-file-system';

/**
 * Утилиты для очистки временных файлов и папок
 */

const TEMP_PATTERNS = [
  'temp_import_',
  'export_images',
  'streaming_export',
  'warehouse_export_'
];

const MAX_TEMP_AGE_MS = 24 * 60 * 60 * 1000; // 24 часа

/**
 * Очистка всех временных файлов старше 24 часов
 */
export const cleanupOldTempFiles = async (): Promise<void> => {
  try {
    const docDir = FileSystem.documentDirectory;
    if (!docDir) return;

    const files = await FileSystem.readDirectoryAsync(docDir);
    const now = Date.now();

    for (const file of files) {
      // Проверяем соответствие паттернам временных файлов
      const isTemp = TEMP_PATTERNS.some(pattern => file.includes(pattern));
      if (!isTemp) continue;

      const filePath = `${docDir}${file}`;
      const fileInfo = await FileSystem.getInfoAsync(filePath);

      if (fileInfo.exists) {
        // Проверяем возраст файла
        const modificationTime = (fileInfo as any).modificationTime;
        if (modificationTime) {
          const ageMs = now - modificationTime * 1000;
          
          if (ageMs > MAX_TEMP_AGE_MS) {
            console.log(`Удаляем старый временный файл/папку: ${file}`);
            await FileSystem.deleteAsync(filePath, { idempotent: true });
          }
        }
      }
    }

    console.log('Очистка временных файлов завершена');
  } catch (error) {
    console.warn('Ошибка при очистке временных файлов:', error);
  }
};

/**
 * Принудительная очистка всех временных файлов (независимо от возраста)
 */
export const cleanupAllTempFiles = async (): Promise<void> => {
  try {
    const docDir = FileSystem.documentDirectory;
    if (!docDir) return;

    const files = await FileSystem.readDirectoryAsync(docDir);

    for (const file of files) {
      const isTemp = TEMP_PATTERNS.some(pattern => file.includes(pattern));
      if (!isTemp) continue;

      const filePath = `${docDir}${file}`;
      const fileInfo = await FileSystem.getInfoAsync(filePath);

      if (fileInfo.exists) {
        console.log(`Удаляем временный файл/папку: ${file}`);
        await FileSystem.deleteAsync(filePath, { idempotent: true });
      }
    }

    console.log('Принудительная очистка всех временных файлов завершена');
  } catch (error) {
    console.warn('Ошибка при принудительной очистке:', error);
  }
};

/**
 * Очистка конкретной временной папки
 */
export const cleanupTempDirectory = async (dirPath: string): Promise<void> => {
  try {
    const dirInfo = await FileSystem.getInfoAsync(dirPath);
    if (dirInfo.exists) {
      await FileSystem.deleteAsync(dirPath, { idempotent: true });
      console.log(`Очищена временная папка: ${dirPath}`);
    }
  } catch (error) {
    console.warn(`Не удалось очистить папку ${dirPath}:`, error);
  }
};

/**
 * Получение размера временных файлов
 */
export const getTempFilesSize = async (): Promise<number> => {
  let totalSize = 0;
  
  try {
    const docDir = FileSystem.documentDirectory;
    if (!docDir) return 0;

    const files = await FileSystem.readDirectoryAsync(docDir);

    for (const file of files) {
      const isTemp = TEMP_PATTERNS.some(pattern => file.includes(pattern));
      if (!isTemp) continue;

      const filePath = `${docDir}${file}`;
      const fileInfo = await FileSystem.getInfoAsync(filePath);

      if (fileInfo.exists && (fileInfo as any).size) {
        totalSize += (fileInfo as any).size;
      }
    }
  } catch (error) {
    console.warn('Ошибка при подсчете размера временных файлов:', error);
  }

  return totalSize;
};
