// utils/qrCodeUtils.ts
import { QRCodeType } from '../database/types';
import * as FileSystem from 'expo-file-system';

export interface QRCodeInfo {
  id: string; // уникальный ID QR-кода
  data: string; // данные для QR-кода (URL или JSON)
  boxIndex?: number; // индекс коробки (для per_box)
  size?: number | string; // размер товара (для per_item)
  itemIndex?: number; // индекс пары/единицы товара (для per_item)
}

/**
 * Генерирует уникальный ID для QR-кода
 */
export const generateQRId = (): string => {
  return `qr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Генерирует данные для QR-кода
 * @param itemId - локальный ID товара (для обратной совместимости)
 * @param itemName - название товара
 * @param itemCode - код товара
 * @param itemUuid - UUID товара (уникальный идентификатор для кросс-девайс синхронизации)
 * @param boxIndex - индекс коробки
 * @param size - размер товара
 */
export const generateQRData = (itemId: number, itemName: string, itemCode: string, itemUuid?: string, boxIndex?: number, size?: number | string): string => {
  const baseData = {
    itemId,
    itemName,
    itemCode,
    itemUuid, // UUID для поиска на других устройствах после синхронизации
    type: 'warehouse_item',
  };

  if (boxIndex !== undefined) {
    return JSON.stringify({ ...baseData, boxIndex });
  }

  if (size !== undefined) {
    return JSON.stringify({ ...baseData, size });
  }

  return JSON.stringify(baseData);
};

/**
 * Создает QR-коды для товара
 */
export const createQRCodesForItem = (
  itemId: number,
  itemName: string,
  itemCode: string,
  itemUuid: string | undefined,
  qrCodeType: QRCodeType,
  numberOfBoxes: number,
  boxSizeQuantities: string
): QRCodeInfo[] => {
  const qrCodes: QRCodeInfo[] = [];

  if (qrCodeType === 'none') {
    return qrCodes;
  }

  if (qrCodeType === 'per_box') {
    // Создаем QR-код для каждой коробки
    for (let i = 0; i < numberOfBoxes; i++) {
      qrCodes.push({
        id: generateQRId(),
        data: generateQRData(itemId, itemName, itemCode, itemUuid, i),
        boxIndex: i,
      });
    }
  } else if (qrCodeType === 'per_item') {
    // Создаем QR-код для каждого товара (размера) в каждой коробке
    try {
      const parsedBoxes = JSON.parse(boxSizeQuantities || '[]');
      if (Array.isArray(parsedBoxes)) {
        parsedBoxes.forEach((box, boxIndex) => {
          if (Array.isArray(box)) {
            box.forEach((sizeQuantity: any) => {
              if (sizeQuantity && sizeQuantity.quantity > 0) {
                // Для каждого размера создаем QR-код для каждой пары/единицы
                for (let itemIndex = 0; itemIndex < sizeQuantity.quantity; itemIndex++) {
                  qrCodes.push({
                    id: generateQRId(),
                    data: generateQRData(itemId, itemName, itemCode, itemUuid, boxIndex, sizeQuantity.size),
                    boxIndex,
                    size: sizeQuantity.size,
                    itemIndex: itemIndex + 1, // Номер пары/единицы (начинается с 1)
                  });
                }
              }
            });
          }
        });
      }
    } catch (error) {
      console.error('Error parsing box sizes for QR generation:', error);
    }
  }

  return qrCodes;
};

/**
 * Парсит QR-коды из JSON строки
 */
export const parseQRCodes = (qrCodes: string | null): QRCodeInfo[] => {
  if (!qrCodes) return [];
  try {
    return JSON.parse(qrCodes);
  } catch {
    return [];
  }
};

/**
 * Сохраняет QR-код как изображение (будет реализовано позже при скачивании)
 */
export const saveQRCodeImage = async (qrCodeSvg: string, filename: string): Promise<string> => {
  const path = `${FileSystem.documentDirectory}${filename}.png`;
  // Здесь будет логика сохранения SVG как PNG
  // Пока просто возвращаем путь
  return path;
};

/**
 * Получает URL для просмотра товара по QR-коду
 * В будущем это может быть веб-ссылка
 */
export const getItemUrlFromQRData = (qrData: string): string | null => {
  try {
    const data = JSON.parse(qrData);
    if (data.itemId) {
      // В будущем можно сделать веб-интерфейс
      return `warehouse://item/${data.itemId}`;
    }
  } catch {
    return null;
  }
  return null;
};
