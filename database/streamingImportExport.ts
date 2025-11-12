// database/streamingImportExport.ts
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { getItems, getAllTransactions, insertItemImport, insertTransactionImport } from './database';
import { Item, Transaction } from './types';

/**
 * Потоковый экспорт для больших объемов данных
 * Создает файлы по частям без загрузки всего в память
 */

const BATCH_SIZE = 100; // Обрабатываем по 100 записей за раз
const IMAGES_DIR = `${FileSystem.documentDirectory}images/`;
const EXPORT_DIR = `${FileSystem.documentDirectory}streaming_export/`;

export interface StreamingExportProgress {
  stage: 'preparing' | 'items' | 'transactions' | 'images' | 'packaging' | 'complete';
  current: number;
  total: number;
  message: string;
}

export interface StreamingImportProgress {
  stage: 'reading' | 'items' | 'transactions' | 'images' | 'complete';
  current: number;
  total: number;
  message: string;
}

/**
 * Потоковый экспорт базы данных
 */
export const streamingExportDatabase = async (
  onProgress?: (progress: StreamingExportProgress) => void
): Promise<string> => {
  try {
    // Подготовка
    onProgress?.({ stage: 'preparing', current: 0, total: 100, message: 'Подготовка экспорта...' });
    
    // Создаем папку для экспорта
    const exportInfo = await FileSystem.getInfoAsync(EXPORT_DIR);
    if (exportInfo.exists) {
      await FileSystem.deleteAsync(EXPORT_DIR, { idempotent: true });
    }
    await FileSystem.makeDirectoryAsync(EXPORT_DIR, { intermediates: true });
    
    // Получаем общее количество записей
    const items = await getItems();
    const transactions = await getAllTransactions();
    
    onProgress?.({ stage: 'preparing', current: 25, total: 100, message: `Найдено ${items.length} товаров и ${transactions.length} транзакций` });

    // 1. Экспорт товаров частями
    await exportItemsInBatches(items, onProgress);
    
    // 2. Экспорт транзакций частями
    await exportTransactionsInBatches(transactions, onProgress);
    
    // 3. Экспорт изображений
    await exportImagesStreaming(items, onProgress);
    
    // 4. Создание итогового архива
    onProgress?.({ stage: 'packaging', current: 90, total: 100, message: 'Создание архива...' });
    
    const zipPath = await createFinalArchive();
    
    // Очистка временных файлов
    await FileSystem.deleteAsync(EXPORT_DIR, { idempotent: true });
    
    onProgress?.({ stage: 'complete', current: 100, total: 100, message: 'Экспорт завершен!' });
    
    return zipPath;
  } catch (error) {
    // Очистка при ошибке
    try {
      await FileSystem.deleteAsync(EXPORT_DIR, { idempotent: true });
    } catch {}
    
    throw error;
  }
};

/**
 * Экспорт товаров по частям
 */
const exportItemsInBatches = async (
  items: Item[],
  onProgress?: (progress: StreamingExportProgress) => void
): Promise<void> => {
  const itemsCsvPath = `${EXPORT_DIR}items.csv`;
  
  // Записываем заголовок
  const headers = 'id,name,code,warehouse,numberOfBoxes,boxSizeQuantities,sizeType,row,position,side,imageFileName,totalQuantity,totalValue,createdAt\n';
  await FileSystem.writeAsStringAsync(itemsCsvPath, headers, { encoding: FileSystem.EncodingType.UTF8 });
  
  // Обрабатываем по частям
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    let csvContent = '';
    
    for (const item of batch) {
      const imageFileName = item.imageUri ? `${item.id}_${item.imageUri.split('/').pop()}` : '';
      const row = [
        item.id,
        csvEscape(item.name),
        csvEscape(item.code),
        csvEscape(item.warehouse),
        item.numberOfBoxes,
        csvEscape(item.boxSizeQuantities),
        csvEscape(item.sizeType),
        csvEscape(item.row),
        csvEscape(item.position),
        csvEscape(item.side),
        csvEscape(imageFileName),
        item.totalQuantity,
        item.totalValue,
        item.createdAt
      ];
      csvContent += row.join(',') + '\n';
    }
    
    // Дописываем к файлу (используем конкатенацию через чтение и запись, т.к. нет прямого append в expo-file-system)
    const existingContent = await FileSystem.readAsStringAsync(itemsCsvPath, { encoding: FileSystem.EncodingType.UTF8 });
    await FileSystem.writeAsStringAsync(itemsCsvPath, existingContent + csvContent, { encoding: FileSystem.EncodingType.UTF8 });
    
    onProgress?.({
      stage: 'items',
      current: Math.min(i + BATCH_SIZE, items.length),
      total: items.length,
      message: `Экспорт товаров: ${Math.min(i + BATCH_SIZE, items.length)}/${items.length}`
    });
    
    // Небольшая пауза для освобождения памяти
    await new Promise(resolve => setTimeout(resolve, 10));
  }
};

/**
 * Экспорт транзакций по частям
 */
const exportTransactionsInBatches = async (
  transactions: Transaction[],
  onProgress?: (progress: StreamingExportProgress) => void
): Promise<void> => {
  const transactionsCsvPath = `${EXPORT_DIR}transactions.csv`;
  
  // Записываем заголовок
  const headers = 'id,action,itemId,itemName,timestamp,details\n';
  await FileSystem.writeAsStringAsync(transactionsCsvPath, headers, { encoding: FileSystem.EncodingType.UTF8 });
  
  // Обрабатываем по частям
  for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
    const batch = transactions.slice(i, i + BATCH_SIZE);
    let csvContent = '';
    
    for (const tx of batch) {
      const row = [
        tx.id,
        csvEscape(tx.action),
        tx.itemId ?? '',
        csvEscape(tx.itemName),
        tx.timestamp,
        csvEscape(tx.details)
      ];
      csvContent += row.join(',') + '\n';
    }
    
    // Дописываем к файлу (используем конкатенацию через чтение и запись)
    const existingContent = await FileSystem.readAsStringAsync(transactionsCsvPath, { encoding: FileSystem.EncodingType.UTF8 });
    await FileSystem.writeAsStringAsync(transactionsCsvPath, existingContent + csvContent, { encoding: FileSystem.EncodingType.UTF8 });
    
    onProgress?.({
      stage: 'transactions',
      current: Math.min(i + BATCH_SIZE, transactions.length),
      total: transactions.length,
      message: `Экспорт транзакций: ${Math.min(i + BATCH_SIZE, transactions.length)}/${transactions.length}`
    });
    
    // Небольшая пауза для освобождения памяти
    await new Promise(resolve => setTimeout(resolve, 10));
  }
};

/**
 * Потоковый экспорт изображений
 */
const exportImagesStreaming = async (
  items: Item[],
  onProgress?: (progress: StreamingExportProgress) => void
): Promise<void> => {
  const imagesExportDir = `${EXPORT_DIR}images/`;
  await FileSystem.makeDirectoryAsync(imagesExportDir, { intermediates: true });
  
  const itemsWithImages = items.filter(item => item.imageUri);
  
  for (let i = 0; i < itemsWithImages.length; i++) {
    const item = itemsWithImages[i];
    if (!item.imageUri) continue;
    
    try {
      const originalName = item.imageUri.split('/').pop() || `img_${item.id}`;
      const safeName = `${item.id}_${originalName}`;
      const destPath = `${imagesExportDir}${safeName}`;
      
      // Копируем файл напрямую (без загрузки в память)
      await FileSystem.copyAsync({ from: item.imageUri, to: destPath });
      
      onProgress?.({
        stage: 'images',
        current: i + 1,
        total: itemsWithImages.length,
        message: `Экспорт изображений: ${i + 1}/${itemsWithImages.length}`
      });
      
      // Пауза каждые 10 изображений
      if ((i + 1) % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    } catch (error) {
      console.warn(`Не удалось экспортировать изображение для товара ${item.id}:`, error);
    }
  }
};

/**
 * Создание итогового архива без загрузки в память
 * ВАЖНО: Для React Native мы используем JSZip, который все равно загружает в память
 * Но мы создаем ZIP по частям для меньшего пикового потребления памяти
 */
const createFinalArchive = async (): Promise<string> => {
  const JSZip = require('jszip');
  const zip = new JSZip();
  
  // Добавляем CSV файлы
  const itemsCsvPath = `${EXPORT_DIR}items.csv`;
  const transactionsCsvPath = `${EXPORT_DIR}transactions.csv`;
  
  const itemsCsvExists = (await FileSystem.getInfoAsync(itemsCsvPath)).exists;
  if (itemsCsvExists) {
    const itemsCsv = await FileSystem.readAsStringAsync(itemsCsvPath);
    zip.file('items.csv', itemsCsv);
  }
  
  const transactionsCsvExists = (await FileSystem.getInfoAsync(transactionsCsvPath)).exists;
  if (transactionsCsvExists) {
    const transactionsCsv = await FileSystem.readAsStringAsync(transactionsCsvPath);
    zip.file('transactions.csv', transactionsCsv);
  }
  
  // Добавляем изображения по одному для экономии памяти
  const imagesDir = `${EXPORT_DIR}images/`;
  const imagesDirExists = (await FileSystem.getInfoAsync(imagesDir)).exists;
  if (imagesDirExists) {
    const imageFiles = await FileSystem.readDirectoryAsync(imagesDir);
    for (const imageFile of imageFiles) {
      try {
        const imagePath = `${imagesDir}${imageFile}`;
        const base64 = await FileSystem.readAsStringAsync(imagePath, { 
          encoding: FileSystem.EncodingType.Base64 
        });
        zip.file(`images/${imageFile}`, base64, { base64: true });
        
        // Небольшая пауза для освобождения памяти
        if (imageFiles.indexOf(imageFile) % 5 === 0) {
          await new Promise(resolve => setTimeout(resolve, 20));
        }
      } catch (error) {
        console.warn(`Не удалось добавить изображение ${imageFile} в архив:`, error);
      }
    }
  }
  
  // Генерируем ZIP
  const base64Zip = await zip.generateAsync({ 
    type: 'base64',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 } // Средний уровень сжатия
  });
  
  const timestamp = Date.now();
  const zipFilename = `warehouse_export_${timestamp}.zip`;
  const zipPath = `${FileSystem.documentDirectory}${zipFilename}`;
  
  await FileSystem.writeAsStringAsync(zipPath, base64Zip, { 
    encoding: FileSystem.EncodingType.Base64 
  });
  
  return zipPath;
};

/**
 * Потоковый импорт из папки (не ZIP)
 */
export const streamingImportFromFolder = async (
  folderUri: string,
  onProgress?: (progress: StreamingImportProgress) => void
): Promise<{ itemsWithoutPrice: number; imagesImported?: number; imagesTotal?: number }> => {
  onProgress?.({ stage: 'reading', current: 0, total: 100, message: 'Чтение файлов...' });
  
  // Проверяем наличие необходимых файлов
  const itemsCsvPath = `${folderUri}items.csv`;
  const transactionsCsvPath = `${folderUri}transactions.csv`;
  const imagesDir = `${folderUri}images/`;
  
  const itemsCsvExists = (await FileSystem.getInfoAsync(itemsCsvPath)).exists;
  if (!itemsCsvExists) {
    throw new Error('Файл items.csv не найден в папке импорта');
  }
  
  // Подсчитываем изображения
  let imagesTotal = 0;
  try {
    const imagesDirInfo = await FileSystem.getInfoAsync(imagesDir);
    if (imagesDirInfo.exists && imagesDirInfo.isDirectory) {
      const imageFiles = await FileSystem.readDirectoryAsync(imagesDir);
      imagesTotal = imageFiles.length;
      console.log(`Found ${imagesTotal} images in import folder`);
    }
  } catch (e) {
    console.log('No images folder found');
  }
  
  // Импорт товаров
  const { itemsWithoutPrice, imagesImported } = await importItemsFromCsv(itemsCsvPath, imagesDir, onProgress);
  
  // Импорт транзакций (если есть)
  const transactionsCsvExists = (await FileSystem.getInfoAsync(transactionsCsvPath)).exists;
  if (transactionsCsvExists) {
    await importTransactionsFromCsv(transactionsCsvPath, onProgress);
  }
  
  onProgress?.({ stage: 'complete', current: 100, total: 100, message: 'Импорт завершен!' });
  
  return { itemsWithoutPrice, imagesImported, imagesTotal };
};

/**
 * Импорт товаров из CSV файла по частям
 */
const importItemsFromCsv = async (
  csvPath: string,
  imagesDir: string,
  onProgress?: (progress: StreamingImportProgress) => void
): Promise<{ itemsWithoutPrice: number; imagesImported: number }> => {
  const csvContent = await FileSystem.readAsStringAsync(csvPath);
  const rows = parseCsv(csvContent);
  
  let itemsWithoutPrice = 0;
  let imagesImported = 0;
  let startIndex = 0;
  
  // Пропускаем заголовок если есть
  if (rows.length > 0 && String(rows[0][0]).toLowerCase() === 'id') {
    startIndex = 1;
  }
  
  // Фильтруем пустые строки (строки где все ячейки пустые)
  const validRows = rows.slice(startIndex).filter(row => {
    // Проверяем что хотя бы одна ячейка не пустая
    return row.some(cell => cell && cell.trim() !== '');
  });
  
  const totalItems = validRows.length;
  
  console.log(`importItemsFromCsv: found ${totalItems} valid items to import`);
  
  for (let i = 0; i < validRows.length; i++) {
    const cells = validRows[i];
    const parsed = mapItemsCsvRowToItem(cells);
    
    // Проверяем что у товара есть обязательное имя
    if (!parsed.name || parsed.name.trim() === '') {
      console.warn('Пропуск товара без имени:', cells);
      continue;
    }
    
    if (parsed.totalValue === -1) {
      itemsWithoutPrice++;
    }
    
    // Обработка изображения
    let imageUri: string | null = null;
    
    // Пробуем найти изображение
    try {
      const imagesDirInfo = await FileSystem.getInfoAsync(imagesDir);
      if (imagesDirInfo.exists && imagesDirInfo.isDirectory) {
        const filesInDir = await FileSystem.readDirectoryAsync(imagesDir);
        
        if (filesInDir.length > 0) {
          let matchedFile: string | null = null;
          
          // Стратегия 1: Точное совпадение по imageFileName
          if (parsed.imageFileName && filesInDir.includes(parsed.imageFileName)) {
            matchedFile = parsed.imageFileName;
            console.log(`✓ Exact match: ${matchedFile} for item ${parsed.name}`);
          }
          
          // Стратегия 2: Убираем префикс itemId (например "123_image.jpg" -> "image.jpg")
          if (!matchedFile && parsed.imageFileName && parsed.imageFileName.includes('_')) {
            const baseFileName = parsed.imageFileName.split('_').slice(1).join('_');
            if (filesInDir.includes(baseFileName)) {
              matchedFile = baseFileName;
              console.log(`✓ Found by base name: ${matchedFile} for item ${parsed.name}`);
            }
          }
          
          // Стратегия 3: Fuzzy match - ищем по частичному совпадению
          if (!matchedFile && parsed.imageFileName) {
            const searchName = parsed.imageFileName.split('_').pop()?.toLowerCase() || '';
            matchedFile = filesInDir.find(file => 
              file.toLowerCase().includes(searchName) ||
              searchName.includes(file.toLowerCase().replace(/\.(jpg|jpeg|png|webp)$/i, ''))
            ) || null;
            if (matchedFile) {
              console.log(`✓ Fuzzy match: ${matchedFile} for item ${parsed.name}`);
            }
          }
          
          // Стратегия 4: Если есть только одно изображение - используем его
          if (!matchedFile && filesInDir.length === 1) {
            matchedFile = filesInDir[0];
            console.log(`✓ Using single image: ${matchedFile} for item ${parsed.name}`);
          }
          
          // Копируем найденное изображение
          if (matchedFile) {
            const imagePath = `${imagesDir}${matchedFile}`;
            const destPath = `${IMAGES_DIR}${matchedFile}`;
            
            // Создаем папку images если не существует
            const imagesDirInfo = await FileSystem.getInfoAsync(IMAGES_DIR);
            if (!imagesDirInfo.exists) {
              await FileSystem.makeDirectoryAsync(IMAGES_DIR, { intermediates: true });
            }
            
            await FileSystem.copyAsync({ from: imagePath, to: destPath });
            imageUri = destPath;
            imagesImported++;
            console.log(`✓ Image saved: ${matchedFile} for item ${parsed.name}`);
          } else {
            console.warn(`✗ No image match found for item ${parsed.name} (imageFileName: ${parsed.imageFileName})`);
          }
        } else {
          console.warn('✗ Images directory is empty');
        }
      }
    } catch (e) {
      console.warn(`Error processing image for item ${parsed.name}:`, e);
    }
    
    // Вставляем в базу
    try {
      await insertItemImport({ ...parsed, imageUri } as any);
    } catch (error) {
      console.warn('Ошибка импорта товара:', parsed, error);
    }
    
    // Обновляем прогресс
    onProgress?.({
      stage: 'items',
      current: i + 1,
      total: totalItems,
      message: `Импорт товаров: ${i + 1}/${totalItems}`
    });
    
    // Пауза каждые 50 записей
    if ((i + 1) % 50 === 0) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
  
  console.log(`Import complete: ${imagesImported} images imported successfully`);
  return { itemsWithoutPrice, imagesImported };
};

/**
 * Импорт транзакций из CSV файла по частям
 */
const importTransactionsFromCsv = async (
  csvPath: string,
  onProgress?: (progress: StreamingImportProgress) => void
): Promise<void> => {
  const csvContent = await FileSystem.readAsStringAsync(csvPath);
  const rows = parseCsv(csvContent);
  
  let startIndex = 0;
  
  // Пропускаем заголовок если есть
  if (rows.length > 0 && String(rows[0][0]).toLowerCase() === 'id') {
    startIndex = 1;
  }
  
  // Фильтруем пустые строки (строки где все ячейки пустые)
  const validRows = rows.slice(startIndex).filter(row => {
    // Проверяем что хотя бы одна ячейка не пустая
    return row.some(cell => cell && cell.trim() !== '');
  });
  
  const totalTransactions = validRows.length;
  
  console.log(`importTransactionsFromCsv: found ${totalTransactions} valid transactions to import`);
  
  for (let i = 0; i < validRows.length; i++) {
    const cells = validRows[i];
    const parsed = mapTransactionsCsvRowToTransaction(cells);
    
    // Проверяем что у транзакции есть обязательные поля
    if (!parsed.action || !parsed.itemName) {
      console.warn('Пропуск транзакции с недостающими данными:', cells);
      continue;
    }
    
    try {
      await insertTransactionImport(parsed);
    } catch (error) {
      console.warn('Ошибка импорта транзакции:', parsed, error);
    }
    
    // Обновляем прогресс
    onProgress?.({
      stage: 'transactions',
      current: i + 1,
      total: totalTransactions,
      message: `Импорт транзакций: ${i + 1}/${totalTransactions}`
    });
    
    // Пауза каждые 100 записей
    if ((i + 1) % 100 === 0) {
      await new Promise(resolve => setTimeout(resolve, 5));
    }
  }
};

// Утилитарные функции (перенесены из importExport.ts)
const csvEscape = (v: any) => {
  if (v == null) return '';
  const s = String(v);
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
};

const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let cur: string = '';
  let row: string[] = [];
  let inQuotes = false;
  
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"' ) {
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === ',' && !inQuotes) {
      row.push(cur);
      cur = '';
      continue;
    }

    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && next === '\n') {
        i++;
      }
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
      continue;
    }

    cur += ch;
  }
  
  if (cur !== '' || row.length > 0) {
    row.push(cur);
    rows.push(row);
  }
  
  return rows;
};

const mapItemsCsvRowToItem = (cells: string[]) => {
  const c = (idx: number) => (cells[idx] !== undefined ? cells[idx] : '');
  
  // Проверяем наличие обязательных полей для совместимости со старыми версиями
  // Для totalValue проверяем что cells.length >= 14 (есть и totalValue и createdAt)
  // ИЛИ что значение в колонке 12 является числом (не timestamp)
  const hasTotalValue = cells.length >= 14 && c(12) !== '';
  const hasCode = c(2) !== '';
  const hasWarehouse = c(3) !== '';
  const hasSizeType = c(6) !== '';
  const hasBoxSizeQuantities = c(5) !== '' && c(5) !== '[]';
  
  // Логируем если данные неполные
  if (!hasCode || !hasWarehouse || !hasSizeType || !hasBoxSizeQuantities) {
    console.warn('Импорт товара с неполными данными:', {
      name: c(1),
      hasCode,
      hasWarehouse,
      hasSizeType,
      hasBoxSizeQuantities
    });
  }
  
  return {
    id: c(0) ? parseInt(c(0), 10) : null,
    name: c(1) || 'Без названия',
    code: c(2) || '',
    warehouse: c(3) || '',
    numberOfBoxes: c(4) ? parseInt(c(4), 10) : 1,
    boxSizeQuantities: c(5) || '[]',
    sizeType: c(6) || '',
    row: c(7) || null,
    position: c(8) || null,
    side: c(9) || null,
    imageFileName: c(10) || null,
    totalQuantity: c(11) ? parseInt(c(11), 10) : 0,
    totalValue: hasTotalValue ? parseFloat(c(12)) : 0,
    createdAt: c(13) ? parseInt(c(13), 10) : null
  };
};

const mapTransactionsCsvRowToTransaction = (cells: string[]) => {
  const c = (idx: number) => (cells[idx] !== undefined ? cells[idx] : '');
  return {
    action: c(1) as 'create' | 'update' | 'delete' | 'sale' | 'wholesale',
    itemId: c(2) ? parseInt(c(2), 10) : undefined,
    itemName: c(3),
    timestamp: c(4) ? parseInt(c(4), 10) : Math.floor(Date.now() / 1000),
    details: c(5) || null
  };
};
