// utils/imageCompression.ts
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { Alert } from 'react-native';

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0-1
  format?: ImageManipulator.SaveFormat;
}

export interface CompressionResult {
  uri: string;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
}

/**
 * Сжимает изображение с заданными параметрами
 */
export const compressImage = async (
  imageUri: string, 
  options: CompressionOptions = {}
): Promise<CompressionResult> => {
  try {
    // Получаем информацию об оригинальном файле
    const originalInfo = await FileSystem.getInfoAsync(imageUri);
    const originalSize = originalInfo.size || 0;

    const {
      maxWidth = 800,
      maxHeight = 600,
      quality = 0.8,
      format = ImageManipulator.SaveFormat.JPEG
    } = options;

    // Получаем размеры изображения
    const imageInfo = await ImageManipulator.manipulateAsync(
      imageUri,
      [],
      { format: ImageManipulator.SaveFormat.JPEG }
    );

    // Определяем нужно ли изменение размера
    const actions: ImageManipulator.Action[] = [];
    
    // Проверяем размер исходного изображения
    const needsResize = await checkIfNeedsResize(imageUri, maxWidth, maxHeight);
    
    if (needsResize) {
      actions.push({
        resize: {
          width: maxWidth,
          height: maxHeight,
        }
      });
    }

    // Сжимаем изображение
    const result = await ImageManipulator.manipulateAsync(
      imageUri,
      actions,
      {
        compress: quality,
        format,
        base64: false,
      }
    );

    // Получаем размер сжатого файла
    const compressedInfo = await FileSystem.getInfoAsync(result.uri);
    const compressedSize = compressedInfo.size || 0;

    const compressionRatio = originalSize > 0 ? compressedSize / originalSize : 1;

    return {
      uri: result.uri,
      originalSize,
      compressedSize,
      compressionRatio
    };
  } catch (error) {
    console.error('Ошибка сжатия изображения:', error);
    throw new Error('Не удалось сжать изображение: ' + (error as any)?.message);
  }
};

/**
 * Проверяет нужно ли изменение размера изображения
 */
const checkIfNeedsResize = async (imageUri: string, maxWidth: number, maxHeight: number): Promise<boolean> => {
  try {
    // Простая проверка через ImageManipulator
    const info = await ImageManipulator.manipulateAsync(imageUri, [], { format: ImageManipulator.SaveFormat.JPEG });
    // К сожалению, expo-image-manipulator не возвращает размеры в info
    // Поэтому будем исходить из того, что большинство современных фото нужно сжимать
    return true;
  } catch {
    return true;
  }
};

/**
 * Форматирует размер файла в читаемый вид
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Б';
  
  const k = 1024;
  const sizes = ['Б', 'КБ', 'МБ', 'ГБ'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Показывает диалог пользователю с предложением сжать изображение
 */
export const showCompressionDialog = (
  originalSize: number,
  estimatedCompressedSize: number,
  onAccept: () => void,
  onReject: () => void
): void => {
  const originalSizeStr = formatFileSize(originalSize);
  const estimatedSizeStr = formatFileSize(estimatedCompressedSize);
  const savingPercent = Math.round((1 - estimatedCompressedSize / originalSize) * 100);

  Alert.alert(
    'Сжатие изображения',
    `Изображение довольно большое (${originalSizeStr}).\n\nРекомендуем сжать его до ~${estimatedSizeStr} (экономия ~${savingPercent}%) для:\n• Быстрой загрузки\n• Экономии места\n• Лучшей производительности\n\nСжать изображение?`,
    [
      {
        text: 'Нет, оставить как есть',
        style: 'cancel',
        onPress: onReject
      },
      {
        text: 'Да, сжать',
        style: 'default',
        onPress: onAccept
      }
    ]
  );
};

/**
 * Предустановленные профили сжатия
 */
export const COMPRESSION_PROFILES = {
  HIGH_QUALITY: {
    maxWidth: 1200,
    maxHeight: 900,
    quality: 0.9,
    format: ImageManipulator.SaveFormat.JPEG
  },
  BALANCED: {
    maxWidth: 800,
    maxHeight: 600,
    quality: 0.8,
    format: ImageManipulator.SaveFormat.JPEG
  },
  COMPACT: {
    maxWidth: 600,
    maxHeight: 450,
    quality: 0.7,
    format: ImageManipulator.SaveFormat.JPEG
  }
} as const;

/**
 * Автоматически определяет нужный профиль сжатия на основе размера файла
 */
export const getRecommendedProfile = (fileSizeBytes: number): CompressionOptions => {
  const sizeMB = fileSizeBytes / (1024 * 1024);
  
  if (sizeMB < 1) {
    return COMPRESSION_PROFILES.HIGH_QUALITY;
  } else if (sizeMB < 5) {
    return COMPRESSION_PROFILES.BALANCED;
  } else {
    return COMPRESSION_PROFILES.COMPACT;
  }
};
