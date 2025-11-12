// database/importExport.ts
import JSZip from 'jszip';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { getItems, insertItemImport, getAllTransactions, insertTransactionImport } from './database';
import { Item, Transaction } from './types';
import { streamingImportFromZip, canProcessZipInMemory } from './zipStreamImport';
import { validateItemsCSV, validateTransactionsCSV, validateZipStructure, checkForDuplicates } from './importValidation';
import { cleanupOldTempFiles, cleanupTempDirectory } from './cleanupUtils';

/**
 * Формат CSV для items:
 * id,name,code,warehouse,numberOfBoxes,boxSizeQuantities,sizeType,row,position,side,imageFileName,totalQuantity,totalValue,createdAt
 *
 * Для transactions:
 * id,action,itemId,itemName,timestamp,details
 *
 * В ZIP будут:
 * - items.csv
 * - transactions.csv
 * - images/ (все картинки, имена — базовые имена, без путей)
 */

const IMAGES_DIR = `${FileSystem.documentDirectory}images/`;
const TEMP_EXPORT_IMAGES_DIR = `${FileSystem.documentDirectory}export_images/`;
const BACKUP_DIR = `${FileSystem.documentDirectory}backups/`;
const TEMP_IMPORT_DIR = `${FileSystem.documentDirectory}temp_import/`;

const csvEscape = (v: any) => {
  if (v == null) return '';
  const s = String(v);
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
};

const itemsCsvHeaders = [
  'id',
  'name',
  'code',
  'warehouse',
  'numberOfBoxes',
  'boxSizeQuantities',
  'sizeType',
  'row',
  'position',
  'side',
  'imageFileName',
  'totalQuantity',
  'totalValue',
  'createdAt'
];

const transactionsCsvHeaders = [
  'id',
  'action',
  'itemId',
  'itemName',
  'timestamp',
  'details'
];

export const exportDatabaseToZip = async (): Promise<string> => {
  // 1) Получить все записи items и transactions
  const items = await getItems();
  const transactions = await getAllTransactions();

  // 2) Создать временную папку для картинок экспорта
  try {
    const info = await FileSystem.getInfoAsync(TEMP_EXPORT_IMAGES_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(TEMP_EXPORT_IMAGES_DIR, { intermediates: true });
    }
  } catch (e) {
    // игнорируем
  }

  // 3) Сформировать CSV для items
  const itemsLines: string[] = [];
  itemsLines.push(itemsCsvHeaders.join(','));

  // Скопируем картинки в temp folder с уникальными именами и сохраним имя для CSV
  for (const it of items) {
    let imageFileName: string | null = null;
    if (it.imageUri) {
      try {
        const originalName = it.imageUri.split('/').pop() || `img_${it.id}`;
        const safeName = `${it.id}_${originalName}`;
        const dest = `${TEMP_EXPORT_IMAGES_DIR}${safeName}`;

        // Попробуем скопировать (если источник доступен)
        try {
          await FileSystem.copyAsync({ from: it.imageUri, to: dest });
        } catch {
          // Возможно source is base64 or not accessible; попробуем прочитать как base64 и записать
          try {
            const base64 = await FileSystem.readAsStringAsync(it.imageUri, { encoding: FileSystem.EncodingType.Base64 });
            await FileSystem.writeAsStringAsync(dest, base64, { encoding: FileSystem.EncodingType.Base64 });
          } catch {
            console.warn('Не удалось экспортировать картинку для item id=', it.id);
            imageFileName = null;
          }
        }
        imageFileName = safeName;
      } catch (e) {
        console.warn('Ошибка при копировании картинки для экспорта', e);
        imageFileName = null;
      }
    }

    const row = [
      it.id,
      csvEscape(it.name),
      csvEscape(it.code),
      csvEscape(it.warehouse),
      it.numberOfBoxes,
      csvEscape(it.boxSizeQuantities),
      csvEscape(it.sizeType),
      csvEscape(it.row),
      csvEscape(it.position),
      csvEscape(it.side),
      csvEscape(imageFileName),
      it.totalQuantity,
      it.totalValue,
      it.createdAt
    ];
    itemsLines.push(row.join(','));
  }

  const itemsCsvContent = itemsLines.join('\n');

  // 4) Сформировать CSV для transactions
  const transactionsLines: string[] = [];
  transactionsLines.push(transactionsCsvHeaders.join(','));
  for (const tx of transactions) {
    const row = [
      tx.id,
      csvEscape(tx.action),
      tx.itemId ?? '',
      csvEscape(tx.itemName),
      tx.timestamp,
      csvEscape(tx.details)
    ];
    transactionsLines.push(row.join(','));
  }
  const transactionsCsvContent = transactionsLines.join('\n');

  // 5) Собрать ZIP через JSZip
  const zip = new JSZip();
  zip.file('items.csv', itemsCsvContent);
  zip.file('transactions.csv', transactionsCsvContent);

  // Добавляем папку images (только существующие файлы)
  try {
    const imgFiles = await FileSystem.readDirectoryAsync(TEMP_EXPORT_IMAGES_DIR);
    for (const fname of imgFiles) {
      const fpath = `${TEMP_EXPORT_IMAGES_DIR}${fname}`;
      try {
        const b64 = await FileSystem.readAsStringAsync(fpath, { encoding: FileSystem.EncodingType.Base64 });
        zip.file(`images/${fname}`, b64, { base64: true });
      } catch (e) {
        console.warn('Не удалось добавить картинку в zip:', fpath, e);
      }
    }
  } catch (e) {
    // нет картинок — нормально
  }

  const base64Zip = await zip.generateAsync({ type: 'base64' });

  const timestamp = Date.now();
  const zipFilename = `warehouse_export_${timestamp}.zip`;
  const zipPath = `${FileSystem.documentDirectory}${zipFilename}`;

  // Записать zip как base64
  await FileSystem.writeAsStringAsync(zipPath, base64Zip, { encoding: FileSystem.EncodingType.Base64 });

  // Очистим временную папку export_images
  try {
    const tempInfo = await FileSystem.getInfoAsync(TEMP_EXPORT_IMAGES_DIR);
    if (tempInfo.exists) {
      const files = await FileSystem.readDirectoryAsync(TEMP_EXPORT_IMAGES_DIR);
      for (const f of files) {
        try {
          await FileSystem.deleteAsync(`${TEMP_EXPORT_IMAGES_DIR}${f}`, { idempotent: true });
        } catch {}
      }
    }
  } catch {}

  return zipPath; // путь к zip в documentDirectory
};

export const shareExportedZip = async (zipPath: string) => {
  try {
    const ok = await Sharing.isAvailableAsync();
    if (ok) {
      await Sharing.shareAsync(zipPath);
    } else {
      console.warn('Sharing не доступен на этом устройстве. Файл сохранён по пути:', zipPath);
    }
  } catch (e) {
    console.warn('Ошибка при шаринге zip файла:', e);
    throw e;
  }
};

/**
 * Создание бэкапа текущей базы данных перед импортом
 */
const createBackupBeforeImport = async (): Promise<string> => {
  try {
    // Создаем папку для бэкапов если не существует
    const backupInfo = await FileSystem.getInfoAsync(BACKUP_DIR);
    if (!backupInfo.exists) {
      await FileSystem.makeDirectoryAsync(BACKUP_DIR, { intermediates: true });
    }

    // Экспортируем текущую базу в бэкап
    const timestamp = Date.now();
    const backupZipPath = await exportDatabaseToZip();
    const backupFinalPath = `${BACKUP_DIR}backup_${timestamp}.zip`;
    
    // Перемещаем экспорт в папку бэкапов
    await FileSystem.copyAsync({ from: backupZipPath, to: backupFinalPath });
    await FileSystem.deleteAsync(backupZipPath, { idempotent: true });

    console.log(`Создан бэкап перед импортом: ${backupFinalPath}`);
    return backupFinalPath;
  } catch (error) {
    console.warn('Не удалось создать бэкап:', error);
    // Не прерываем импорт если бэкап не удался
    return '';
  }
};

/**
 * Очистка старых бэкапов (оставляем только последние 5)
 */
const cleanupOldBackups = async (): Promise<void> => {
  try {
    const backupInfo = await FileSystem.getInfoAsync(BACKUP_DIR);
    if (!backupInfo.exists) return;

    const backupFiles = await FileSystem.readDirectoryAsync(BACKUP_DIR);
    const backups = backupFiles
      .filter(f => f.startsWith('backup_') && f.endsWith('.zip'))
      .map(f => ({
        name: f,
        timestamp: parseInt(f.replace('backup_', '').replace('.zip', ''))
      }))
      .sort((a, b) => b.timestamp - a.timestamp);

    // Удаляем все кроме последних 5
    for (let i = 5; i < backups.length; i++) {
      const path = `${BACKUP_DIR}${backups[i].name}`;
      await FileSystem.deleteAsync(path, { idempotent: true });
      console.log(`Удален старый бэкап: ${backups[i].name}`);
    }
  } catch (error) {
    console.warn('Ошибка при очистке старых бэкапов:', error);
  }
};

/**
 * Импорт: принимает uri (локальный файл, полученный от DocumentPicker)
 */
export const importDatabaseFromZipUri = async (
  zipUri: string, 
  onProgress?: (current: number, total: number, message: string) => void
): Promise<{ itemsWithoutPrice: number }> => {
  let backupPath = '';
  
  // 1) Валидация ZIP файла
  onProgress?.(5, 100, 'Проверка файла...');
  const zipValidation = await validateZipStructure(zipUri);
  if (!zipValidation.valid) {
    throw new Error(`Ошибка валидации ZIP: ${zipValidation.errors.join(', ')}`);
  }
  
  // Показываем предупреждения если есть
  if (zipValidation.warnings.length > 0) {
    console.warn('Предупреждения валидации:', zipValidation.warnings.join(', '));
  }
  
  onProgress?.(10, 100, 'Валидация пройдена');

  // 2) Проверяем размер файла и выбираем метод импорта
  try {
    const fileInfo = await FileSystem.getInfoAsync(zipUri);
    if (fileInfo.exists && fileInfo.size) {
      const fileSizeMB = fileInfo.size / (1024 * 1024);
      console.log(`importDatabaseFromZipUri: file size is ${fileSizeMB.toFixed(2)} MB`);
      
      // Для файлов больше 30MB рекомендуем ручную распаковку
      if (fileSizeMB > 30) {
        throw new Error(`Файл очень большой (${fileSizeMB.toFixed(2)} MB). Для файлов больше 30 MB рекомендуется:\n1. Разархивировать файл вручную\n2. Использовать "Импорт больших объемов" из настроек\n\nЭто поможет избежать ошибок памяти.`);
      }
      
      // Для файлов 20-30MB показываем предупреждение но продолжаем
      if (fileSizeMB > 20) {
        console.warn(`importDatabaseFromZipUri: large file detected (${fileSizeMB.toFixed(2)} MB), import may consume significant memory and be slow`);
      }
    }
  } catch (error) {
    // Если ошибка содержит сообщение о размере - пробрасываем её дальше
    if (error instanceof Error && error.message.includes('больше 30 MB')) {
      throw error;
    }
    console.warn('importDatabaseFromZipUri: could not check file size:', error);
  }

  // 3) Создаем бэкап текущей базы данных
  try {
    onProgress?.(15, 100, 'Создание бэкапа...');
    backupPath = await createBackupBeforeImport();
    await cleanupOldBackups();
    onProgress?.(20, 100, 'Бэкап создан');
  } catch (error) {
    console.warn('Ошибка создания бэкапа, продолжаем импорт:', error);
  }

  // 2) прочитать zip как base64
  onProgress?.(25, 100, 'Чтение архива...');
  console.log('importDatabaseFromZipUri: read base64 from', zipUri);
  let base64: string;
  let zip: JSZip;
  
  try {
    base64 = await FileSystem.readAsStringAsync(zipUri, { encoding: FileSystem.EncodingType.Base64 });
    onProgress?.(35, 100, 'Распаковка архива...');
    zip = await JSZip.loadAsync(base64, { base64: true });
  } catch (error: any) {
    if (error.message && error.message.includes('OutOfMemoryError')) {
      throw new Error('Недостаточно памяти для загрузки файла. Попробуйте:\n1. Перезапустить приложение\n2. Использовать файл меньшего размера\n3. Сжать изображения в архиве');
    }
    throw error;
  }

  // 2) Очистка старых временных файлов перед началом импорта
  onProgress?.(40, 100, 'Подготовка к импорту...');
  await cleanupOldTempFiles();

  // 3) получить CSV для items и transactions
  onProgress?.(45, 100, 'Чтение данных...');
  const itemsCsvFile = zip.file('items.csv');
  if (!itemsCsvFile) {
    throw new Error('items.csv not found in zip');
  }
  const itemsCsvText = await itemsCsvFile.async('string');
  
  // Проверка дубликатов в items
  const duplicateCheck = checkForDuplicates(itemsCsvText, 0);
  if (duplicateCheck.hasDuplicates) {
    console.warn(`Обнаружены дубликаты ID в items.csv: ${duplicateCheck.duplicateIds.join(', ')}`);
    // Продолжаем импорт, но предупреждаем - последний дубликат перезапишет предыдущий
  }
  
  onProgress?.(50, 100, 'Данные прочитаны');

  const transactionsCsvFile = zip.file('transactions.csv');
  let transactionsCsvText = '';
  if (transactionsCsvFile) {
    transactionsCsvText = await transactionsCsvFile.async('string');
  } else {
    console.warn('transactions.csv not found in zip — skipping transactions import');
  }

  // 4) прочитать картинки из zip и записать в IMAGES_DIR
  try {
    const dirInfo = await FileSystem.getInfoAsync(IMAGES_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(IMAGES_DIR, { intermediates: true });
    }
  } catch (e) {
    // ignore
  }

  const imageFilesInZip: string[] = [];
  Object.keys(zip.files).forEach(k => {
    if (k.startsWith('images/') && !k.endsWith('/')) {
      imageFilesInZip.push(k);
    }
  });

  console.log(`importDatabaseFromZipUri: found ${imageFilesInZip.length} images to import`);

  // Запись картинок с оптимизацией памяти
  let processedImages = 0;
  for (const zname of imageFilesInZip) {
    const fname = zname.split('/').pop()!;
    try {
      const fileObj = zip.file(zname);
      if (!fileObj) continue;
      
      // Обрабатываем изображения по одному для экономии памяти
      const b64 = await fileObj.async('base64');
      const destPath = `${IMAGES_DIR}${fname}`;
      await FileSystem.writeAsStringAsync(destPath, b64, { encoding: FileSystem.EncodingType.Base64 });
      
      processedImages++;
      if (processedImages % 10 === 0) {
        console.log(`importDatabaseFromZipUri: processed ${processedImages}/${imageFilesInZip.length} images`);
        // Небольшая пауза для освобождения памяти
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    } catch (e) {
      console.warn('Ошибка при записи картинки из zip:', zname, e);
      // При ошибке памяти пропускаем изображение но продолжаем импорт
      if (e instanceof Error && e.message.includes('OutOfMemoryError')) {
        console.warn('Пропускаем изображение из-за нехватки памяти:', fname);
        continue;
      }
    }
  }

  // 5) распарсить items CSV и вставить записи в базу, подставляя imageUri в IMAGES_DIR если соответствующая картинка была
  const itemsRows = parseCsv(itemsCsvText);
  let itemsWithoutPrice = 0;

  // CSV ожидает заголовок — если его нет, сверимся
  let itemsStartIndex = 0;
  if (itemsRows.length > 0) {
    const first = itemsRows[0];
    const headerMatches = itemsCsvHeaders.every((h, idx) => String((first as any)[idx] ?? '').toLowerCase() === h.toLowerCase());
    if (headerMatches) {
      itemsStartIndex = 1;
    }
  }

  // Фильтруем пустые строки (строки где все ячейки пустые)
  const validItemRows = itemsRows.slice(itemsStartIndex).filter(row => {
    // Проверяем что хотя бы одна ячейка не пустая
    return row.some(cell => cell && cell.trim() !== '');
  });

  console.log(`importDatabaseFromZipUri: importing ${validItemRows.length} valid items`);
  const totalItems = validItemRows.length;
  
  for (let i = 0; i < validItemRows.length; i++) {
    const r = validItemRows[i];
    const cells: string[] = Array.isArray(r) ? r : Object.values(r).map(v => String(v));
    const parsed = mapItemsCsvRowToItem(cells);
    
    // Проверяем что у товара есть обязательное имя
    if (!parsed.name || parsed.name.trim() === '') {
      console.warn('Пропуск товара без имени:', cells);
      continue;
    }
    
    // Подсчитываем товары без цены
    if (parsed.totalValue === -1) {
      itemsWithoutPrice++;
    }
    
    if (parsed.imageFileName) {
      const candidatePath = `${IMAGES_DIR}${parsed.imageFileName}`;
      try {
        const info = await FileSystem.getInfoAsync(candidatePath);
        if (info.exists) {
          parsed.imageUri = candidatePath;
        } else {
          parsed.imageUri = null;
        }
      } catch {
        parsed.imageUri = null;
      }
    } else {
      parsed.imageUri = null;
    }

    try {
      // insertItemImport должна быть реализована в database/database.ts
      await insertItemImport({
        name: parsed.name,
        code: parsed.code,
        warehouse: parsed.warehouse,
        numberOfBoxes: parsed.numberOfBoxes,
        boxSizeQuantities: parsed.boxSizeQuantities,
        sizeType: parsed.sizeType,
        row: parsed.row,
        position: parsed.position,
        side: parsed.side,
        imageUri: parsed.imageUri,
        totalQuantity: parsed.totalQuantity,
        totalValue: parsed.totalValue,
        createdAt: parsed.createdAt
      } as any);
      
      // Прогресс каждые 50 товаров + небольшая пауза
      if ((i + 1) % 50 === 0) {
        const current = i + 1;
        const progress = 50 + Math.round((current / totalItems) * 30); // 50-80%
        onProgress?.(progress, 100, `Импорт товаров: ${current}/${totalItems}`);
        console.log(`importDatabaseFromZipUri: imported ${current}/${totalItems} items`);
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    } catch (e) {
      console.warn('Не удалось импортировать строку items CSV в базу:', parsed, e);
    }
  }

  // 6) распарсить transactions CSV и вставить записи в базу
  if (transactionsCsvText) {
    const transactionsRows = parseCsv(transactionsCsvText);

    let transactionsStartIndex = 0;
    if (transactionsRows.length > 0) {
      const first = transactionsRows[0];
      const headerMatches = transactionsCsvHeaders.every((h, idx) => String((first as any)[idx] ?? '').toLowerCase() === h.toLowerCase());
      if (headerMatches) {
        transactionsStartIndex = 1;
      }
    }

    // Фильтруем пустые строки (строки где все ячейки пустые)
    const validTransactionRows = transactionsRows.slice(transactionsStartIndex).filter(row => {
      // Проверяем что хотя бы одна ячейка не пустая
      return row.some(cell => cell && cell.trim() !== '');
    });

    console.log(`importDatabaseFromZipUri: importing ${validTransactionRows.length} valid transactions`);
    const totalTransactions = validTransactionRows.length;

    for (let i = 0; i < validTransactionRows.length; i++) {
      const r = validTransactionRows[i];
      const cells: string[] = Array.isArray(r) ? r : Object.values(r).map(v => String(v));
      const parsed = mapTransactionsCsvRowToTransaction(cells);

      // Проверяем что у транзакции есть обязательные поля
      if (!parsed.action || !parsed.itemName) {
        console.warn('Пропуск транзакции с недостающими данными:', cells);
        continue;
      }

      try {
        await insertTransactionImport({
          action: parsed.action,
          itemId: parsed.itemId,
          itemName: parsed.itemName,
          timestamp: parsed.timestamp,
          details: parsed.details
        });
        
        // Прогресс каждые 100 транзакций + небольшая пауза
        if ((i + 1) % 100 === 0) {
          const current = i + 1;
          const progress = 80 + Math.round((current / totalTransactions) * 15); // 80-95%
          onProgress?.(progress, 100, `Импорт транзакций: ${current}/${totalTransactions}`);
          console.log(`importDatabaseFromZipUri: imported ${current}/${totalTransactions} transactions`);
          await new Promise(resolve => setTimeout(resolve, 5));
        }
      } catch (e) {
        console.warn('Не удалось импортировать строку transactions CSV в базу:', parsed, e);
      }
    }
  }
  
  // Возвращаем статистику импорта
  onProgress?.(100, 100, 'Импорт завершен!');
  return { itemsWithoutPrice };
};

/**
 * Простая CSV-парсерка, возвращает массив строк (каждая строка — массив значений).
 * Поддерживает кавычки и экранирование двойными кавычками.
 */
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

type ParsedCsvItem = {
  id?: number | null;
  name: string;
  code: string;
  warehouse: string;
  numberOfBoxes: number;
  boxSizeQuantities: string;
  sizeType: string;
  row: string | null;
  position: string | null;
  side: string | null;
  imageFileName: string | null;
  imageUri?: string | null;
  totalQuantity: number;
  totalValue: number;
  createdAt?: number | null;
};

const mapItemsCsvRowToItem = (cells: string[]): ParsedCsvItem => {
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
  
  const parsed: ParsedCsvItem = {
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
    // Для файлов без totalValue устанавливаем 0 чтобы не портить общую стоимость
    totalValue: hasTotalValue ? parseFloat(c(12)) : 0,
    createdAt: c(13) ? parseInt(c(13), 10) : null
  };
  return parsed;
};

type ParsedTransaction = Omit<Transaction, 'id'>;

const mapTransactionsCsvRowToTransaction = (cells: string[]): ParsedTransaction => {
  const c = (idx: number) => (cells[idx] !== undefined ? cells[idx] : '');
  const parsed: ParsedTransaction = {
    action: c(1) as 'create' | 'update' | 'delete' | 'sale' | 'wholesale',
    itemId: c(2) ? parseInt(c(2), 10) : undefined,
    itemName: c(3),
    timestamp: c(4) ? parseInt(c(4), 10) : Math.floor(Date.now() / 1000),
    details: c(5) || null
  };
  return parsed;
};

/**
 * Утилита: выбрать ZIP через DocumentPicker и импортировать
 * НЕ кидает ошибку при отмене выбора — возвращает { imported: false, message }
 *
 * Поддерживает разные форматы результата:
 * - { type: 'success', uri, name }
 * - { uri, name }
 * - { canceled: false, assets: [{ uri, name, mimeType, size }] }
 * - { cancelled / canceled: true } и т.п.
 */
export const pickZipAndImport = async (): Promise<{ imported: boolean; message?: string; itemsWithoutPrice?: number }> => {
  try {
    console.log('pickZipAndImport: calling DocumentPicker.getDocumentAsync with type=*/*');
    const resAny = (await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true
    })) as any;

    console.log('pickZipAndImport: picker result:', resAny);

    if (!resAny) {
      return { imported: false, message: 'no_result' };
    }

    // Новый формат (react-native-document-picker style / expo-file-picker): { canceled: boolean, assets: [{ uri, name, type, size }] }
    if (typeof resAny === 'object' && ('canceled' in resAny || 'cancelled' in resAny)) {
      const cancelled = resAny.canceled === true || resAny.cancelled === true;
      if (cancelled) {
        console.log('pickZipAndImport: picker indicated cancellation');
        return { imported: false, message: 'cancelled' };
      }
      // assets присутствуют?
      if (Array.isArray(resAny.assets) && resAny.assets.length > 0) {
        const a = resAny.assets[0];
        const uri = a.uri || a.uriString || a.fileUri || a.fileName; // попытка извлечь
        const name = a.name || a.fileName || (typeof a.uri === 'string' ? a.uri.split('/').pop() : undefined);
        if (!uri) {
          console.warn('pickZipAndImport: assets[0] has no uri');
          return { imported: false, message: 'no_uri_in_assets' };
        }
        // продолжаем импорт
        try {
          const result = await smartImportZip(uri, (current, total, message) => {
            console.log(`Import progress: ${current}/${total} - ${message}`);
          });
          console.log('pickZipAndImport: smartImportZip finished successfully (assets path)');
          return { imported: true, itemsWithoutPrice: result.itemsWithoutPrice };
        } catch (e: any) {
          console.error('pickZipAndImport: smartImportZip failed (assets):', e);
          return { imported: false, message: String(e?.message || e) };
        }
      }
      // если нет assets, но есть uri прямо
      if (resAny.uri) {
        try {
          const result = await smartImportZip(resAny.uri, (current, total, message) => {
            console.log(`Import progress: ${current}/${total} - ${message}`);
          });
          console.log('pickZipAndImport: smartImportZip finished successfully (uri)');
          return { imported: true, itemsWithoutPrice: result.itemsWithoutPrice };
        } catch (e: any) {
          console.error('pickZipAndImport: smartImportZip failed (uri):', e);
          return { imported: false, message: String(e?.message || e) };
        }
      }

      // неизвестный формат, но не cancelled
      console.warn('pickZipAndImport: picker returned unexpected object without uri/assets');
      return { imported: false, message: 'unexpected_picker_result' };
    }

    // Старый/классический формат expo-document-picker: { type: 'success', uri, name, size }
    if (resAny.type && resAny.type === 'success' && resAny.uri) {
      try {
        const result = await smartImportZip(resAny.uri, (current, total, message) => {
          console.log(`Import progress: ${current}/${total} - ${message}`);
        });
        console.log('pickZipAndImport: smartImportZip finished successfully (type=success)');
        return { imported: true, itemsWithoutPrice: result.itemsWithoutPrice };
      } catch (e: any) {
        console.error('pickZipAndImport: smartImportZip failed (type=success):', e);
        return { imported: false, message: String(e?.message || e) };
      }
    }

    // Иногда DocumentPicker возвращает { uri, name } directly
    if (resAny.uri) {
      try {
        const result = await smartImportZip(resAny.uri, (current, total, message) => {
          console.log(`Import progress: ${current}/${total} - ${message}`);
        });
        console.log('pickZipAndImport: smartImportZip finished successfully (uri-only)');
        return { imported: true, itemsWithoutPrice: result.itemsWithoutPrice };
      } catch (e: any) {
        console.error('pickZipAndImport: smartImportZip failed (uri-only):', e);
        return { imported: false, message: String(e?.message || e) };
      }
    }

    // Если сюда дошли — считаем, что выбор был отменён или формат неизвестен
    console.warn('pickZipAndImport: unknown result shape, treating as cancelled', resAny);
    return { imported: false, message: 'cancelled' };
  } catch (e: any) {
    console.error('pickZipAndImport: DocumentPicker threw:', e);
    return { imported: false, message: String(e?.message || e) };
  }
};

/**
 * Умный импорт ZIP - автоматически выбирает метод на основе размера файла
 */
const smartImportZip = async (zipUri: string, onProgress?: (current: number, total: number, message: string) => void): Promise<{ itemsWithoutPrice: number }> => {
  try {
    // Проверяем можно ли обработать в памяти
    const canProcessInMemory = await canProcessZipInMemory(zipUri);
    
    if (canProcessInMemory) {
      // Пробуем обычный импорт
      console.log('smartImportZip: using standard import for manageable file size');
      return await importDatabaseFromZipUri(zipUri, onProgress);
    } else {
      // Используем потоковый импорт
      console.log('smartImportZip: using streaming import for large file');
      return await streamingImportFromZip(zipUri, (progress) => {
        // Конвертируем StreamingImportProgress в простой прогресс
        onProgress?.(progress.current, progress.total, progress.message);
      });
    }
  } catch (error: any) {
    // Если обычный импорт провалился из-за памяти, пробуем потоковый
    if (error.message && (error.message.includes('памяти') || error.message.includes('OutOfMemory'))) {
      console.log('smartImportZip: standard import failed due to memory, trying streaming import');
      try {
        return await streamingImportFromZip(zipUri, (progress) => {
          onProgress?.(progress.current, progress.total, progress.message);
        });
      } catch (streamingError: any) {
        throw new Error(`Не удалось импортировать файл ни одним из методов. Обычный импорт: ${error.message}. Потоковый импорт: ${streamingError.message}`);
      }
    }
    throw error;
  }
};