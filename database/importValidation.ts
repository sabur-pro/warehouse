// database/importValidation.ts
import * as FileSystem from 'expo-file-system';

/**
 * Валидация структуры CSV перед импортом
 */

const REQUIRED_ITEMS_HEADERS = ['id', 'name', 'code', 'warehouse', 'numberOfBoxes', 'boxSizeQuantities', 'sizeType'];
const REQUIRED_TRANSACTIONS_HEADERS = ['id', 'action', 'itemName', 'timestamp'];

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Валидация CSV файла товаров
 */
export const validateItemsCSV = async (csvPath: string): Promise<ValidationResult> => {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: []
  };

  try {
    const csvContent = await FileSystem.readAsStringAsync(csvPath);
    const lines = csvContent.split('\n').filter(line => line.trim() !== '');
    
    if (lines.length === 0) {
      result.valid = false;
      result.errors.push('CSV файл пустой');
      return result;
    }

    // Проверяем заголовки
    const headerLine = lines[0].toLowerCase();
    const missingHeaders = REQUIRED_ITEMS_HEADERS.filter(
      header => !headerLine.includes(header.toLowerCase())
    );

    if (missingHeaders.length > 0) {
      result.valid = false;
      result.errors.push(`Отсутствуют обязательные колонки: ${missingHeaders.join(', ')}`);
      return result;
    }

    // Проверяем данные (первые 10 строк для примера)
    const dataLines = lines.slice(1, Math.min(11, lines.length));
    for (let i = 0; i < dataLines.length; i++) {
      const cells = parseCSVLine(dataLines[i]);
      
      // Базовые проверки
      if (cells.length < REQUIRED_ITEMS_HEADERS.length) {
        result.warnings.push(`Строка ${i + 2}: недостаточно колонок (${cells.length}/${REQUIRED_ITEMS_HEADERS.length})`);
      }

      // Проверка ID
      if (cells[0] && isNaN(parseInt(cells[0]))) {
        result.warnings.push(`Строка ${i + 2}: некорректный ID "${cells[0]}"`);
      }
    }

    // Если только предупреждения - все равно валидный
    if (result.errors.length > 0) {
      result.valid = false;
    }

  } catch (error) {
    result.valid = false;
    result.errors.push(`Ошибка чтения CSV: ${error}`);
  }

  return result;
};

/**
 * Валидация CSV файла транзакций
 */
export const validateTransactionsCSV = async (csvPath: string): Promise<ValidationResult> => {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: []
  };

  try {
    const fileInfo = await FileSystem.getInfoAsync(csvPath);
    if (!fileInfo.exists) {
      // Транзакции опциональны
      result.warnings.push('Файл транзакций отсутствует (это нормально для некоторых экспортов)');
      return result;
    }

    const csvContent = await FileSystem.readAsStringAsync(csvPath);
    const lines = csvContent.split('\n').filter(line => line.trim() !== '');
    
    if (lines.length === 0) {
      result.warnings.push('CSV файл транзакций пустой');
      return result;
    }

    // Проверяем заголовки
    const headerLine = lines[0].toLowerCase();
    const missingHeaders = REQUIRED_TRANSACTIONS_HEADERS.filter(
      header => !headerLine.includes(header.toLowerCase())
    );

    if (missingHeaders.length > 0) {
      result.valid = false;
      result.errors.push(`Отсутствуют обязательные колонки в транзакциях: ${missingHeaders.join(', ')}`);
      return result;
    }

  } catch (error) {
    result.warnings.push(`Ошибка чтения CSV транзакций: ${error}`);
  }

  return result;
};

/**
 * Проверка дубликатов в импортируемых данных
 */
export const checkForDuplicates = (csvContent: string, idColumnIndex: number = 0): { 
  hasDuplicates: boolean; 
  duplicateIds: number[];
} => {
  const lines = csvContent.split('\n').filter(line => line.trim() !== '');
  const ids = new Set<number>();
  const duplicateIds: number[] = [];

  // Пропускаем заголовок
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]);
    const id = parseInt(cells[idColumnIndex]);
    
    if (!isNaN(id)) {
      if (ids.has(id)) {
        duplicateIds.push(id);
      } else {
        ids.add(id);
      }
    }
  }

  return {
    hasDuplicates: duplicateIds.length > 0,
    duplicateIds: Array.from(new Set(duplicateIds)) // Уникальные дубликаты
  };
};

/**
 * Простой парсер CSV строки (с учетом кавычек)
 */
const parseCSVLine = (line: string): string[] => {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
};

/**
 * Валидация ZIP архива перед импортом
 */
export const validateZipStructure = async (zipUri: string): Promise<ValidationResult> => {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: []
  };

  try {
    const fileInfo = await FileSystem.getInfoAsync(zipUri);
    
    if (!fileInfo.exists) {
      result.valid = false;
      result.errors.push('Файл не существует');
      return result;
    }

    // Проверка размера (если доступно)
    if ((fileInfo as any).size) {
      const sizeMB = (fileInfo as any).size / (1024 * 1024);
      if (sizeMB > 100) {
        result.warnings.push(`Файл очень большой (${sizeMB.toFixed(2)} MB). Импорт может занять много времени.`);
      }
    }

  } catch (error) {
    result.valid = false;
    result.errors.push(`Ошибка проверки файла: ${error}`);
  }

  return result;
};
