// database/zipStreamImport.ts
import * as FileSystem from 'expo-file-system';
import { streamingImportFromFolder, StreamingImportProgress } from './streamingImportExport';

/**
 * Потоковый импорт из ZIP файла через временную распаковку
 */
export const streamingImportFromZip = async (
  zipUri: string,
  onProgress?: (progress: StreamingImportProgress) => void
): Promise<{ itemsWithoutPrice: number }> => {
  const tempDir = `${FileSystem.documentDirectory}temp_import_${Date.now()}/`;
  
  try {
    onProgress?.({ stage: 'reading', current: 10, total: 100, message: 'Подготовка к импорту...' });
    
    // Создаем временную папку
    await FileSystem.makeDirectoryAsync(tempDir, { intermediates: true });
    
    onProgress?.({ stage: 'reading', current: 20, total: 100, message: 'Распаковка архива...' });
    
    // Распаковываем ZIP во временную папку
    await extractZipToFolder(zipUri, tempDir, onProgress);
    
    onProgress?.({ stage: 'reading', current: 50, total: 100, message: 'Начинаем импорт данных...' });
    
    // Импортируем из папки
    const result = await streamingImportFromFolder(tempDir, (progress) => {
      // Корректируем прогресс (50-100%)
      const adjustedProgress = {
        ...progress,
        current: Math.round(50 + (progress.current / progress.total) * 50),
        total: 100
      };
      onProgress?.(adjustedProgress);
    });
    
    return result;
  } finally {
    // Очищаем временную папку
    try {
      const tempInfo = await FileSystem.getInfoAsync(tempDir);
      if (tempInfo.exists) {
        await FileSystem.deleteAsync(tempDir, { idempotent: true });
      }
    } catch (error) {
      console.warn('Не удалось очистить временную папку:', error);
    }
  }
};

/**
 * Распаковка ZIP архива во временную папку
 * ПРОБЛЕМА: JSZip всё ещё требует загрузки всего файла в память
 * Для действительно больших файлов нужно рекомендовать ручную распаковку
 */
const extractZipToFolder = async (
  zipUri: string, 
  destFolder: string,
  onProgress?: (progress: StreamingImportProgress) => void
): Promise<void> => {
  const JSZip = require('jszip');
  
  try {
    // ВНИМАНИЕ: Этот метод всё ещё загружает весь файл в память!
    // Для очень больших файлов (>100MB) может потребоваться много памяти
    const fileInfo = await FileSystem.getInfoAsync(zipUri);
    if (fileInfo.exists && (fileInfo as any).size) {
      const fileSizeMB = (fileInfo as any).size / (1024 * 1024);
      console.log(`extractZipToFolder: processing ${fileSizeMB.toFixed(2)} MB file`);
      
      // Предупреждаем о больших файлах, но не блокируем
      if (fileSizeMB > 100) {
        console.warn(`Very large file (${fileSizeMB.toFixed(2)} MB) - this may take a while and consume significant memory`);
      }
    }
    
    // Читаем ZIP файл (всё ещё в памяти, но с ограничением размера)
    const base64 = await FileSystem.readAsStringAsync(zipUri, { 
      encoding: FileSystem.EncodingType.Base64 
    });
    const zip = await JSZip.loadAsync(base64, { base64: true });
    
    // Получаем список файлов
    const fileNames = Object.keys(zip.files).filter(name => !zip.files[name].dir);
    let processedFiles = 0;
    
    // Извлекаем файлы по одному
    for (const fileName of fileNames) {
      const file = zip.files[fileName];
      if (file && !file.dir) {
        try {
          const destPath = `${destFolder}${fileName}`;
          
          // Создаем папки если нужно
          const dirPath = destPath.substring(0, destPath.lastIndexOf('/'));
          const dirInfo = await FileSystem.getInfoAsync(dirPath);
          if (!dirInfo.exists) {
            await FileSystem.makeDirectoryAsync(dirPath, { intermediates: true });
          }
          
          // Определяем тип файла и метод извлечения
          if (fileName.endsWith('.csv')) {
            // CSV файлы как текст
            const content = await file.async('string');
            await FileSystem.writeAsStringAsync(destPath, content, {
              encoding: FileSystem.EncodingType.UTF8
            });
          } else {
            // Изображения как base64
            const base64Content = await file.async('base64');
            await FileSystem.writeAsStringAsync(destPath, base64Content, {
              encoding: FileSystem.EncodingType.Base64
            });
          }
          
          processedFiles++;
          
          onProgress?.({
            stage: 'reading',
            current: Math.round(20 + (processedFiles / fileNames.length) * 30),
            total: 100,
            message: `Извлечение файлов: ${processedFiles}/${fileNames.length}`
          });
          
          // Пауза для освобождения памяти
          if (processedFiles % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        } catch (error) {
          console.warn(`Ошибка извлечения файла ${fileName}:`, error);
        }
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('OutOfMemoryError')) {
      throw new Error('Недостаточно памяти для распаковки архива. Попробуйте разархивировать файл вручную и использовать импорт из папки.');
    }
    throw error;
  }
};

/**
 * Проверяет можно ли обработать ZIP файл в памяти
 */
export const canProcessZipInMemory = async (zipUri: string): Promise<boolean> => {
  try {
    const fileInfo = await FileSystem.getInfoAsync(zipUri);
    if (fileInfo.exists && (fileInfo as any).size) {
      const fileSizeMB = (fileInfo as any).size / (1024 * 1024);
      
      // Для мобильных устройств: файлы больше 50MB рискованно обрабатывать в памяти
      // Но для 30-50MB можем попробовать с предупреждением
      console.log(`canProcessZipInMemory: file size ${fileSizeMB.toFixed(2)} MB`);
      return fileSizeMB <= 50;
    }
    return false; // Если размер неизвестен, используем безопасный метод
  } catch {
    return false; // При ошибке используем безопасный метод
  }
};
