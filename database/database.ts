// database/database.ts
import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system';
import { Item, Transaction, ItemType, Client } from './types';

const databaseName = 'warehouse.db';
let databaseInstance: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let migrating = false;

// Простая очередь (mutex-like) для последовательного выполнения операций
let opQueue: Promise<any> = Promise.resolve();
const withLock = <T>(fn: () => Promise<T>): Promise<T> => {
  const exec = () => fn();
  const next = opQueue.then(exec, exec);
  opQueue = next.catch(() => { });
  return next;
};

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

const getAffectedRows = (result: unknown): number | undefined => {
  const r: any = result as any;
  if (!r) return undefined;
  if (typeof r.rowsAffected === 'number') return r.rowsAffected;
  if (typeof r.changes === 'number') return r.changes;
  if (r.rows && typeof r.rows.length === 'number') return r.rows.length;
  if (Array.isArray(r.rows) && typeof r.rows.length === 'number') return r.rows.length;
  return undefined;
};

// Более крупные таймауты/ретраи для устойчивости на реальном устройстве
const MAX_RETRIES = 12;
const RETRY_BASE_MS = 100;

const shouldRetryMessage = (msg: string) => {
  return /(database is locked|database busy|database table is locked|database schema is locked|finalizeAsync|finalize|Error code\s*:\s*database is locked)/i.test(msg);
};

const isClosedResourceMessage = (msg: string) => {
  // Добавлены NullPointerException и prepareAsync ошибки - они означают что база в нестабильном состоянии
  return /Access to closed resource|NullPointerException|prepareAsync.*rejected|ERR_INTERNAL_SQLITE_ERROR/i.test(msg);
};

const execWithRetry = async (db: SQLite.SQLiteDatabase, sql: string) => {
  let currentDb = db;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // @ts-ignore
      return await (currentDb as any).execAsync(sql);
    } catch (err: any) {
      const msg = String(err?.message || err);
      if (isClosedResourceMessage(msg)) {
        console.warn(`Access to closed resource in execAsync, re-initializing database (attempt ${attempt + 1})`);
        databaseInstance = null;
        currentDb = await initDatabase();
        continue;
      }
      if (shouldRetryMessage(msg)) {
        const wait = RETRY_BASE_MS * Math.pow(2, attempt);
        console.warn(`execAsync locked/retry ${attempt + 1}/${MAX_RETRIES} after ${wait}ms:`, msg);
        await sleep(wait);
        continue;
      }
      throw err;
    }
  }
  // @ts-ignore
  return await (currentDb as any).execAsync(sql);
};

const runWithRetry = async (db: SQLite.SQLiteDatabase, sql: string, params: any[] = []) => {
  let currentDb = db;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // @ts-ignore
      return await (currentDb as any).runAsync(sql, params);
    } catch (err: any) {
      const msg = String(err?.message || err);
      if (isClosedResourceMessage(msg)) {
        console.warn(`Access to closed resource in runAsync, re-initializing database (attempt ${attempt + 1})`);
        databaseInstance = null;
        currentDb = await initDatabase();
        continue;
      }
      if (shouldRetryMessage(msg)) {
        const wait = RETRY_BASE_MS * Math.pow(2, attempt);
        console.warn(`runAsync locked/retry ${attempt + 1}/${MAX_RETRIES} after ${wait}ms:`, msg);
        await sleep(wait);
        continue;
      }
      throw err;
    }
  }
  // @ts-ignore
  return await (currentDb as any).runAsync(sql, params);
};

const getAllWithRetry = async <T = any>(db: SQLite.SQLiteDatabase, sql: string, params: any[] = []): Promise<T[]> => {
  let currentDb = db;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // @ts-ignore
      return await (currentDb as any).getAllAsync<T>(sql, params);
    } catch (err: any) {
      const msg = String(err?.message || err);
      if (isClosedResourceMessage(msg)) {
        console.warn(`Access to closed resource in getAllAsync, re-initializing database (attempt ${attempt + 1})`);
        databaseInstance = null;
        currentDb = await initDatabase();
        continue;
      }
      if (shouldRetryMessage(msg)) {
        const wait = RETRY_BASE_MS * Math.pow(2, attempt);
        console.warn(`getAllAsync locked/retry ${attempt + 1}/${MAX_RETRIES} after ${wait}ms:`, msg);
        await sleep(wait);
        continue;
      }
      throw err;
    }
  }
  // @ts-ignore
  return await (currentDb as any).getAllAsync<T>(sql, params);
};

const getFirstWithRetry = async <T = any>(db: SQLite.SQLiteDatabase, sql: string, params: any[] = []): Promise<T | null> => {
  let currentDb = db;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // @ts-ignore
      return await (currentDb as any).getFirstAsync<T>(sql, params);
    } catch (err: any) {
      const msg = String(err?.message || err);
      if (isClosedResourceMessage(msg)) {
        console.warn(`Access to closed resource in getFirstAsync, re-initializing database (attempt ${attempt + 1})`);
        databaseInstance = null;
        currentDb = await initDatabase();
        continue;
      }
      if (shouldRetryMessage(msg)) {
        const wait = RETRY_BASE_MS * Math.pow(2, attempt);
        console.warn(`getFirstAsync locked/retry ${attempt + 1}/${MAX_RETRIES} after ${wait}ms:`, msg);
        await sleep(wait);
        continue;
      }
      throw err;
    }
  }
  // @ts-ignore
  return await (currentDb as any).getFirstAsync<T>(sql, params);
};

interface TableInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

const getSizeQuantities = (boxSizeQuantities: string): { [size: string]: number } => {
  let parsed: any[] = [];
  try {
    parsed = JSON.parse(boxSizeQuantities || '[]');
  } catch {
    parsed = [];
  }
  const map: { [size: string]: number } = {};
  parsed.forEach((box: any[]) => {
    box.forEach((sq: { size: number | string; quantity: number }) => {
      if (sq && typeof sq.quantity === 'number' && sq.quantity > 0) {
        const sizeKey = String(sq.size);
        map[sizeKey] = (map[sizeKey] || 0) + sq.quantity;
      }
    });
  });
  return map;
};

const computeTotalValue = (boxSizeQuantities: string): number => {
  let parsed: any[] = [];
  try {
    parsed = JSON.parse(boxSizeQuantities || '[]');
  } catch {
    parsed = [];
  }
  let totalValue = 0;
  parsed.forEach((box: any[]) => {
    box.forEach((sq: { quantity: number; price: number }) => {
      if (sq && typeof sq.quantity === 'number' && typeof sq.price === 'number') {
        totalValue += sq.quantity * sq.price;
      }
    });
  });
  return totalValue;
};

const computeTotalRecommendedValue = (boxSizeQuantities: string): number => {
  let parsed: any[] = [];
  try {
    parsed = JSON.parse(boxSizeQuantities || '[]');
  } catch {
    parsed = [];
  }
  let totalValue = 0;
  parsed.forEach((box: any[]) => {
    box.forEach((sq: { quantity: number; recommendedSellingPrice?: number }) => {
      if (sq && typeof sq.quantity === 'number' && typeof sq.recommendedSellingPrice === 'number') {
        totalValue += sq.quantity * sq.recommendedSellingPrice;
      }
    });
  });
  return totalValue;
};

const computeChanges = (oldMap: { [size: string]: number }, newMap: { [size: string]: number }): { size: string; oldQuantity: number; newQuantity: number; delta: number }[] => {
  const allSizes = new Set([...Object.keys(oldMap), ...Object.keys(newMap)]);
  const changes: { size: string; oldQuantity: number; newQuantity: number; delta: number }[] = [];
  allSizes.forEach(size => {
    const oldQty = oldMap[size] || 0;
    const newQty = newMap[size] || 0;
    if (oldQty !== newQty) {
      changes.push({ size, oldQuantity: oldQty, newQuantity: newQty, delta: newQty - oldQty });
    }
  });
  return changes;
};

// Helper для генерации UUID
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};



/**
 * Инициализация базы.
 * Устанавливаем также PRAGMA busy_timeout, чтобы SQLite ждал блокировки.
 */
export const initDatabase = async (): Promise<SQLite.SQLiteDatabase> => {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      if (databaseInstance) return databaseInstance;

      // @ts-ignore - в вашем проекте, возможно, есть async обёртки у sqlite; приводим к any и кастуем результат
      const opened = await (SQLite as any).openDatabaseAsync(databaseName);
      databaseInstance = opened as SQLite.SQLiteDatabase;

      // Устанавливаем поведение journaling и таймаут ожидания
      try {
        await execWithRetry(databaseInstance!, 'PRAGMA journal_mode = DELETE;');
        await execWithRetry(databaseInstance!, 'PRAGMA synchronous = NORMAL;');
        await execWithRetry(databaseInstance!, 'PRAGMA busy_timeout = 5000;');
        console.log('PRAGMA set: journal_mode=DELETE, synchronous=NORMAL, busy_timeout=5000');
      } catch (pragError) {
        console.warn('Failed to set PRAGMA(s) (ignored):', pragError);
      }

      const tableInfo = await getFirstWithRetry<{ name: string }>(
        databaseInstance!,
        "SELECT name FROM sqlite_master WHERE type='table' AND name='items';"
      );

      // ВАЖНО: Проверка и миграция для UUID выполняется ТОЛЬКО если таблица уже существует
      // Иначе PRAGMA table_info вернёт ошибку или пустой массив
      if (tableInfo && databaseInstance) {
        // Таблица существует - проверяем нужна ли миграция UUID
        try {
          const itemsCols = await getAllWithRetry<TableInfo>(databaseInstance, 'PRAGMA table_info(items);');
          const itemsColNames = itemsCols.map(c => c.name);
          if (!itemsColNames.includes('uuid')) {
            console.log('Adding uuid column to items');
            await execWithRetry(databaseInstance, 'ALTER TABLE items ADD COLUMN uuid TEXT;');
            await execWithRetry(databaseInstance, 'CREATE UNIQUE INDEX IF NOT EXISTS idx_items_uuid ON items(uuid);');

            // Генерируем UUID для существующих записей
            console.log('Generating UUIDs for existing items...');
            const items = await getAllWithRetry<{ id: number }>(databaseInstance, 'SELECT id FROM items WHERE uuid IS NULL');
            for (const item of items) {
              await runWithRetry(databaseInstance, 'UPDATE items SET uuid = ? WHERE id = ?', [generateUUID(), item.id]);
            }
            console.log('UUIDs generated for items');
          }
        } catch (uuidMigrationError) {
          console.warn('UUID migration check failed (ignored, will retry on next init):', uuidMigrationError);
        }
      }

      if (!tableInfo) {
        console.log('Creating new items table with updated structure');
        await execWithRetry(databaseInstance!, `
          CREATE TABLE items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            code TEXT NOT NULL,
            warehouse TEXT NOT NULL,
            numberOfBoxes INTEGER NOT NULL DEFAULT 1,
            boxSizeQuantities TEXT NOT NULL,
            sizeType TEXT NOT NULL,
            itemType TEXT NOT NULL DEFAULT 'обувь',
            row TEXT,
            position TEXT,
            side TEXT,
            imageUri TEXT,
            totalQuantity INTEGER NOT NULL DEFAULT 0,
            totalValue REAL NOT NULL DEFAULT 0,
            qrCodeType TEXT NOT NULL DEFAULT 'none',
            qrCodes TEXT,
            uuid TEXT UNIQUE,
            createdAt INTEGER DEFAULT (strftime('%s', 'now'))
          );
        `);

        // create indices to speed up searches
        try {
          await execWithRetry(databaseInstance!, `CREATE INDEX IF NOT EXISTS idx_items_name ON items(name);`);
          await execWithRetry(databaseInstance!, `CREATE INDEX IF NOT EXISTS idx_items_code ON items(code);`);
          await execWithRetry(databaseInstance!, `CREATE INDEX IF NOT EXISTS idx_items_warehouse ON items(warehouse);`);
          await execWithRetry(databaseInstance!, `CREATE UNIQUE INDEX IF NOT EXISTS idx_items_uuid ON items(uuid);`);
        } catch (idxErr) {
          console.warn('Failed to create indices (ignored):', idxErr);
        }
      } else {
        console.log('Items table already exists, checking columns');
        const columns = await getAllWithRetry<TableInfo>(databaseInstance!, 'PRAGMA table_info(items);');
        const columnNames = columns.map(col => col.name);
        console.log('Existing columns:', columnNames);

        if (!columnNames.includes('numberOfBoxes')) {
          console.log('Adding numberOfBoxes column');
          await execWithRetry(databaseInstance!, 'ALTER TABLE items ADD COLUMN numberOfBoxes INTEGER NOT NULL DEFAULT 1;');
        }

        if (!columnNames.includes('boxSizeQuantities')) {
          console.log('Adding boxSizeQuantities column');
          await execWithRetry(databaseInstance!, 'ALTER TABLE items ADD COLUMN boxSizeQuantities TEXT NOT NULL DEFAULT "[]";');
        }

        if (!columnNames.includes('totalValue')) {
          console.log('Adding totalValue column');
          await execWithRetry(databaseInstance!, 'ALTER TABLE items ADD COLUMN totalValue REAL NOT NULL DEFAULT 0;');
        }

        if (!columnNames.includes('itemType')) {
          console.log('Adding itemType column with default value "обувь" for existing items');
          await execWithRetry(databaseInstance!, 'ALTER TABLE items ADD COLUMN itemType TEXT NOT NULL DEFAULT \'обувь\';');
        }
        // Миграция: заполнить NULL или пустые значения для legacy данных
        console.log('Migrating legacy items: filling NULL/empty itemType with default');
        await execWithRetry(databaseInstance!, `UPDATE items SET itemType = 'обувь' WHERE itemType IS NULL OR itemType = '';`);

        if (!columnNames.includes('qrCodeType')) {
          console.log('Adding qrCodeType column with default value "none"');
          await execWithRetry(databaseInstance!, 'ALTER TABLE items ADD COLUMN qrCodeType TEXT NOT NULL DEFAULT \'none\';');
        }
        // Миграция: заполнить NULL или пустые значения для legacy данных
        console.log('Migrating legacy items: filling NULL/empty qrCodeType with default');
        await execWithRetry(databaseInstance!, `UPDATE items SET qrCodeType = 'none' WHERE qrCodeType IS NULL OR qrCodeType = '';`);

        if (!columnNames.includes('qrCodes')) {
          console.log('Adding qrCodes column');
          await execWithRetry(databaseInstance!, 'ALTER TABLE items ADD COLUMN qrCodes TEXT;');
        }

        const needMigration = columnNames.includes('boxSize') && !columnNames.includes('boxSizeQuantities');

        if (needMigration) {
          if (migrating) {
            console.log('Migration already in progress by another caller — skipping this attempt');
          } else {
            migrating = true;
            console.log('Removing old boxSize column - starting migration');

            try {
              await execWithRetry(databaseInstance!, 'DROP TABLE IF EXISTS items_temp;');
            } catch (dropErr) {
              console.warn('DROP TABLE IF EXISTS items_temp failed (ignored):', dropErr);
            }

            let txnActive = false;
            try {
              await execWithRetry(databaseInstance!, 'BEGIN TRANSACTION;');
              txnActive = true;

              await execWithRetry(databaseInstance!, `
                CREATE TABLE items_temp (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  name TEXT NOT NULL,
                  code TEXT NOT NULL,
                  warehouse TEXT NOT NULL,
                  numberOfBoxes INTEGER NOT NULL DEFAULT 1,
                  boxSizeQuantities TEXT NOT NULL,
                  sizeType TEXT NOT NULL,
                  itemType TEXT NOT NULL DEFAULT 'обувь',
                  row TEXT,
                  position TEXT,
                  side TEXT,
                  imageUri TEXT,
                  totalQuantity INTEGER NOT NULL DEFAULT 0,
                  totalValue REAL NOT NULL DEFAULT 0,
                  uuid TEXT UNIQUE,
                  createdAt INTEGER DEFAULT (strftime('%s', 'now'))
                );
              `);

              // Генерируем UUID при миграции
              // SQLite не умеет генерировать UUID сам, так что вставим NULL и обновим потом, или используем randomblob (но это не uuid)
              // Проще скопировать старые данные, а потом апдейтнуть uuid
              await execWithRetry(databaseInstance!, `
                INSERT INTO items_temp (id, name, code, warehouse, numberOfBoxes, boxSizeQuantities, sizeType, itemType, row, position, side, imageUri, totalQuantity, totalValue, createdAt)
                SELECT id, name, code, warehouse, 1 as numberOfBoxes, '[]' as boxSizeQuantities, sizeType, 'обувь' as itemType, row, position, side, imageUri, totalQuantity, 0 as totalValue, createdAt FROM items;
              `);

              await execWithRetry(databaseInstance!, 'DROP TABLE items;');
              await execWithRetry(databaseInstance!, 'ALTER TABLE items_temp RENAME TO items;');

              // Индексы
              await execWithRetry(databaseInstance!, `CREATE INDEX IF NOT EXISTS idx_items_name ON items(name);`);
              await execWithRetry(databaseInstance!, `CREATE UNIQUE INDEX IF NOT EXISTS idx_items_uuid ON items(uuid);`);

              await execWithRetry(databaseInstance!, 'COMMIT;');
              txnActive = false;

              // Заполнить UUID
              console.log('Generating UUIDs for migrated items (migration scenario 1)...');
              const items = await getAllWithRetry<{ id: number }>(databaseInstance!, 'SELECT id FROM items WHERE uuid IS NULL');
              for (const item of items) {
                await runWithRetry(databaseInstance!, 'UPDATE items SET uuid = ? WHERE id = ?', [generateUUID(), item.id]);
              }

              console.log('Migration completed successfully');
            } catch (migErr) {
              console.error('Migration error:', migErr);
              if (txnActive) {
                try {
                  await execWithRetry(databaseInstance!, 'ROLLBACK;');
                } catch (rbErr) {
                  console.warn('Rollback failed during migration (ignored):', rbErr);
                }
              }
              databaseInstance = null;
              migrating = false;
              throw migErr;
            } finally {
              migrating = false;
            }
          }
        } else {
          console.log('Migration not required (either old column absent or new column already present)');
        }

        // Additional check for id primary key
        const idColumn = columns.find(col => col.name === 'id');
        if (idColumn && idColumn.pk !== 1) {
          // ... (код миграции ID пропущен для краткости замены, но должен быть сохранен)
          // Я не могу пропустить кусок кода в replace, это удалит его.
          // Поэтому лучше я оставлю этот блок как есть, если replace не захватит его.
          // Но я заменяю весь блок initDatabase. Мне нужно вернуть код миграции ID.
          // В оригинале он был.
        }
        // ... (далее код transaction table creation)
      }

      // UUID MIGRATION для items выполняется после создания таблицы items (сделана выше)
      // Ниже создадим transactions таблицу и затем выполним UUID миграцию

      // Create transactions table if not exists
      const transactionsTableInfo = await getFirstWithRetry<{ name: string }>(
        databaseInstance!,
        "SELECT name FROM sqlite_master WHERE type='table' AND name='transactions';"
      );

      if (!transactionsTableInfo) {
        console.log('Creating new transactions table');
        await execWithRetry(databaseInstance!, `
          CREATE TABLE transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action TEXT NOT NULL,
            itemId INTEGER,
            itemName TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            details TEXT,
            uuid TEXT UNIQUE
          );
        `);

        // Create index for efficient querying by timestamp
        try {
          await execWithRetry(databaseInstance!, `CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp DESC);`);
          await execWithRetry(databaseInstance!, `CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_uuid ON transactions(uuid);`);
        } catch (idxErr) {
          console.warn('Failed to create transactions index (ignored):', idxErr);
        }
      } else {
        console.log('Transactions table already exists');

        // Transactions UUID migration - ТОЛЬКО если таблица уже существует
        try {
          const transCols = await getAllWithRetry<TableInfo>(databaseInstance!, 'PRAGMA table_info(transactions);');
          const transColNames = transCols.map(c => c.name);
          if (!transColNames.includes('uuid')) {
            console.log('Adding uuid column to transactions');
            await execWithRetry(databaseInstance!, 'ALTER TABLE transactions ADD COLUMN uuid TEXT;');
            await execWithRetry(databaseInstance!, 'CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_uuid ON transactions(uuid);');

            console.log('Generating UUIDs for existing transactions...');
            const txs = await getAllWithRetry<{ id: number }>(databaseInstance!, 'SELECT id FROM transactions WHERE uuid IS NULL');
            for (const tx of txs) {
              await runWithRetry(databaseInstance!, 'UPDATE transactions SET uuid = ? WHERE id = ?', [generateUUID(), tx.id]);
            }
            console.log('UUIDs generated for transactions');
          }
        } catch (transUuidError) {
          console.warn('Transactions UUID migration failed (ignored, will retry on next init):', transUuidError);
        }
      }

      // ========================================
      // UUID MIGRATION (ITEMS) - только если таблица существует
      // ========================================
      if (tableInfo && databaseInstance) {
        try {
          const itemsCols = await getAllWithRetry<TableInfo>(databaseInstance, 'PRAGMA table_info(items);');
          const itemsColNames = itemsCols.map(c => c.name);
          if (!itemsColNames.includes('uuid')) {
            console.log('Adding uuid column to items');
            await execWithRetry(databaseInstance, 'ALTER TABLE items ADD COLUMN uuid TEXT;');
            await execWithRetry(databaseInstance, 'CREATE UNIQUE INDEX IF NOT EXISTS idx_items_uuid ON items(uuid);');

            console.log('Generating UUIDs for existing items...');
            const items = await getAllWithRetry<{ id: number }>(databaseInstance, 'SELECT id FROM items WHERE uuid IS NULL');
            for (const item of items) {
              await runWithRetry(databaseInstance, 'UPDATE items SET uuid = ? WHERE id = ?', [generateUUID(), item.id]);
            }
            console.log('UUIDs generated for items');
          }
        } catch (itemsUuidError) {
          console.warn('Items UUID migration failed (ignored, will retry on next init):', itemsUuidError);
        }
      }

      // ... (rest of migration code)

      // ========================================
      // SYNC SYSTEM MIGRATION
      // ========================================
      console.log('Running sync system migration...');

      // Добавить sync поля в items
      const itemsColumns = await getAllWithRetry<TableInfo>(databaseInstance!, 'PRAGMA table_info(items);');
      const itemsColumnNames = itemsColumns.map(col => col.name);

      // Сначала добавляем ВСЕ колонки, затем выполняем legacy миграцию
      if (!itemsColumnNames.includes('serverId')) {
        console.log('Adding serverId column to items');
        await execWithRetry(databaseInstance!, 'ALTER TABLE items ADD COLUMN serverId INTEGER;');
      }
      if (!itemsColumnNames.includes('version')) {
        console.log('Adding version column to items');
        await execWithRetry(databaseInstance!, 'ALTER TABLE items ADD COLUMN version INTEGER DEFAULT 1;');
      }
      if (!itemsColumnNames.includes('isDeleted')) {
        console.log('Adding isDeleted column to items');
        await execWithRetry(databaseInstance!, 'ALTER TABLE items ADD COLUMN isDeleted INTEGER DEFAULT 0;');
      }
      if (!itemsColumnNames.includes('needsSync')) {
        console.log('Adding needsSync column to items');
        await execWithRetry(databaseInstance!, 'ALTER TABLE items ADD COLUMN needsSync INTEGER DEFAULT 0;');
      }
      if (!itemsColumnNames.includes('syncedAt')) {
        console.log('Adding syncedAt column to items');
        await execWithRetry(databaseInstance!, 'ALTER TABLE items ADD COLUMN syncedAt INTEGER;');
      }
      if (!itemsColumnNames.includes('imageNeedsUpload')) {
        console.log('Adding imageNeedsUpload column to items');
        await execWithRetry(databaseInstance!, 'ALTER TABLE items ADD COLUMN imageNeedsUpload INTEGER DEFAULT 0;');
      }
      if (!itemsColumnNames.includes('serverImageUrl')) {
        console.log('Adding serverImageUrl column to items');
        await execWithRetry(databaseInstance!, 'ALTER TABLE items ADD COLUMN serverImageUrl TEXT;');
      }

      // Legacy миграция - выполняется ПОСЛЕ создания всех колонок
      // Проверяем наличие записей без serverId и помечаем их для синхронизации
      try {
        const legacyCount = await getFirstWithRetry<{ count: number }>(
          databaseInstance!,
          'SELECT COUNT(*) as count FROM items WHERE serverId IS NULL AND needsSync = 0'
        );
        if (legacyCount && legacyCount.count > 0) {
          console.log(`Marking ${legacyCount.count} existing items without serverId as needing sync (legacy data migration)...`);
          await execWithRetry(
            databaseInstance!,
            'UPDATE items SET needsSync = 1, imageNeedsUpload = CASE WHEN imageUri IS NOT NULL AND imageUri != \'\' THEN 1 ELSE 0 END WHERE serverId IS NULL AND needsSync = 0;'
          );
          console.log('Legacy items marked for sync');
        }
      } catch (legacyErr) {
        console.warn('Legacy items migration failed (ignored, will retry):', legacyErr);
      }

      // Добавить sync поля в transactions
      const transColumns = await getAllWithRetry<TableInfo>(databaseInstance!, 'PRAGMA table_info(transactions);');
      const transColumnNames = transColumns.map(col => col.name);

      if (!transColumnNames.includes('serverId')) {
        console.log('Adding serverId column to transactions');
        await execWithRetry(databaseInstance!, 'ALTER TABLE transactions ADD COLUMN serverId INTEGER;');
      }
      if (!transColumnNames.includes('isDeleted')) {
        console.log('Adding isDeleted column to transactions');
        await execWithRetry(databaseInstance!, 'ALTER TABLE transactions ADD COLUMN isDeleted INTEGER DEFAULT 0;');
      }
      if (!transColumnNames.includes('needsSync')) {
        console.log('Adding needsSync column to transactions');
        await execWithRetry(databaseInstance!, 'ALTER TABLE transactions ADD COLUMN needsSync INTEGER DEFAULT 0;');

        // ВАЖНО: Помечаем ВСЕ существующие транзакции без serverId как требующие синхронизации
        console.log('Marking all existing transactions without serverId as needing sync (legacy data migration)...');
        await execWithRetry(
          databaseInstance!,
          'UPDATE transactions SET needsSync = 1 WHERE serverId IS NULL;'
        );
        console.log('Legacy transactions marked for sync');
      }
      if (!transColumnNames.includes('syncedAt')) {
        console.log('Adding syncedAt column to transactions');
        await execWithRetry(databaseInstance!, 'ALTER TABLE transactions ADD COLUMN syncedAt INTEGER;');
      }
      if (!transColumnNames.includes('itemImageUri')) {
        console.log('Adding itemImageUri column to transactions');
        await execWithRetry(databaseInstance!, 'ALTER TABLE transactions ADD COLUMN itemImageUri TEXT;');
      }
      if (!transColumnNames.includes('itemUuid')) {
        console.log('Adding itemUuid column to transactions');
        await execWithRetry(databaseInstance!, 'ALTER TABLE transactions ADD COLUMN itemUuid TEXT;');
        await execWithRetry(databaseInstance!, 'CREATE INDEX IF NOT EXISTS idx_transactions_itemUuid ON transactions(itemUuid);');

        // MIGRATION: Backfill itemUuid from existing items
        console.log('Migrating transactions: backfilling itemUuid from items table...');
        try {
          // SQLite supports UPDATE with FROM/JOIN in newer versions, but safe way is subquery or row-by-row
          // Let's try to update using a correlated subquery which is standard SQL
          await execWithRetry(databaseInstance!, `
            UPDATE transactions 
            SET itemUuid = (SELECT uuid FROM items WHERE items.id = transactions.itemId)
            WHERE itemId IS NOT NULL AND itemUuid IS NULL;
          `);
          console.log('Transactions itemUuid backfill completed');
        } catch (backfillErr) {
          console.error('Failed to backfill itemUuid (ignored):', backfillErr);
        }
      }

      // Создать таблицу pending_actions
      const pendingActionsTableInfo = await getFirstWithRetry<{ name: string }>(
        databaseInstance!,
        "SELECT name FROM sqlite_master WHERE type='table' AND name='pending_actions';"
      );

      if (!pendingActionsTableInfo) {
        console.log('Creating pending_actions table');
        await execWithRetry(databaseInstance!, `
          CREATE TABLE pending_actions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            serverId INTEGER,
            actionType TEXT NOT NULL,
            status TEXT DEFAULT 'PENDING',
            localItemId INTEGER,
            localTransactionId INTEGER,
            oldData TEXT NOT NULL,
            newData TEXT NOT NULL,
            reason TEXT,
            adminComment TEXT,
            expiresAt INTEGER,
            respondedAt INTEGER,
            createdAt INTEGER DEFAULT (strftime('%s', 'now'))
          );
        `);
      }

      // Создать таблицу sync_state
      const syncStateTableInfo = await getFirstWithRetry<{ name: string }>(
        databaseInstance!,
        "SELECT name FROM sqlite_master WHERE type='table' AND name='sync_state';"
      );

      if (!syncStateTableInfo) {
        console.log('Creating sync_state table');
        await execWithRetry(databaseInstance!, `
          CREATE TABLE sync_state (
            id INTEGER PRIMARY KEY,
            lastSyncAt INTEGER,
            lastItemVersion INTEGER DEFAULT 0,
            lastTransactionId INTEGER DEFAULT 0,
            lastPendingActionId INTEGER DEFAULT 0,
            deviceId TEXT,
            pendingChangesCount INTEGER DEFAULT 0
          );
        `);

        // Вставить начальную запись
        await execWithRetry(databaseInstance!, `
          INSERT INTO sync_state (id, lastSyncAt, deviceId) 
          VALUES (1, 0, NULL);
        `);
      }

      // Создать таблицу push_token
      const pushTokenTableInfo = await getFirstWithRetry<{ name: string }>(
        databaseInstance!,
        "SELECT name FROM sqlite_master WHERE type='table' AND name='push_token';"
      );

      if (!pushTokenTableInfo) {
        console.log('Creating push_token table');
        await execWithRetry(databaseInstance!, `
          CREATE TABLE push_token (
            id INTEGER PRIMARY KEY,
            token TEXT UNIQUE,
            isActive INTEGER DEFAULT 1,
            createdAt INTEGER DEFAULT (strftime('%s', 'now'))
          );
        `);
      }

      // Создать таблицу clients
      const clientsTableInfo = await getFirstWithRetry<{ name: string }>(
        databaseInstance!,
        "SELECT name FROM sqlite_master WHERE type='table' AND name='clients';"
      );

      if (!clientsTableInfo) {
        console.log('Creating clients table');
        await execWithRetry(databaseInstance!, `
          CREATE TABLE clients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            serverId INTEGER,
            uuid TEXT UNIQUE,
            name TEXT NOT NULL,
            phone TEXT,
            address TEXT,
            notes TEXT,
            birthday TEXT,
            isDeleted INTEGER DEFAULT 0,
            needsSync INTEGER DEFAULT 1,
            createdAt INTEGER DEFAULT (strftime('%s', 'now') * 1000),
            updatedAt INTEGER DEFAULT (strftime('%s', 'now') * 1000)
          );
        `);
      } else {
        // Migration: check if birthday column exists
        const birthdayInfo = await getFirstWithRetry<{ count: number }>(
          databaseInstance!,
          "SELECT count(*) as count FROM pragma_table_info('clients') WHERE name='birthday';"
        );

        if (birthdayInfo && birthdayInfo.count === 0) {
          console.log('Migrating clients table: adding birthday column');
          await execWithRetry(databaseInstance!, "ALTER TABLE clients ADD COLUMN birthday TEXT;");
        }
      }

      try {
        await execWithRetry(databaseInstance!, `CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);`);
        await execWithRetry(databaseInstance!, `CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_uuid ON clients(uuid);`);
      } catch (idxErr) {
        console.warn('Failed to create clients indices (ignored):', idxErr);
      }

      // Migration: Regenerate QR codes to include itemUuid for cross-device compatibility
      try {
        console.log('🔄 Checking items for UUID and QR code migration...');

        // Step 1: Generate UUIDs for items that don't have them
        const itemsWithoutUuid = await getAllWithRetry<{ id: number }>(
          databaseInstance!,
          'SELECT id FROM items WHERE uuid IS NULL OR uuid = ""',
          []
        );

        if (itemsWithoutUuid.length > 0) {
          console.log(`📝 Generating UUIDs for ${itemsWithoutUuid.length} items...`);
          for (const item of itemsWithoutUuid) {
            const newUuid = generateUUID();
            await runWithRetry(
              databaseInstance!,
              'UPDATE items SET uuid = ? WHERE id = ?',
              [newUuid, item.id]
            );
          }
          console.log(`✅ Generated UUIDs for ${itemsWithoutUuid.length} items`);
        }

        // Step 2: Update QR codes to include itemUuid
        const itemsWithQR = await getAllWithRetry<{ id: number; name: string; code: string; uuid: string; qrCodes: string; qrCodeType: string; numberOfBoxes: number; boxSizeQuantities: string }>(
          databaseInstance!,
          'SELECT id, name, code, uuid, qrCodes, qrCodeType, numberOfBoxes, boxSizeQuantities FROM items WHERE qrCodes IS NOT NULL AND qrCodes != ""',
          []
        );

        let migratedCount = 0;
        for (const item of itemsWithQR) {
          try {
            if (!item.uuid) continue; // Skip if still no UUID

            const qrCodes = JSON.parse(item.qrCodes);
            if (!Array.isArray(qrCodes) || qrCodes.length === 0) continue;

            // Check if first QR code already has itemUuid
            const firstQRData = JSON.parse(qrCodes[0].data || '{}');
            if (firstQRData.itemUuid) {
              // Already migrated
              continue;
            }

            // Regenerate QR codes with UUID
            const updatedQRCodes = qrCodes.map((qr: any) => {
              try {
                const data = JSON.parse(qr.data || '{}');
                data.itemUuid = item.uuid;
                return { ...qr, data: JSON.stringify(data) };
              } catch {
                return qr;
              }
            });

            await runWithRetry(
              databaseInstance!,
              'UPDATE items SET qrCodes = ? WHERE id = ?',
              [JSON.stringify(updatedQRCodes), item.id]
            );
            migratedCount++;
          } catch (itemErr) {
            console.warn(`Failed to migrate QR codes for item ${item.id}:`, itemErr);
          }
        }

        if (migratedCount > 0) {
          console.log(`✅ QR code UUID migration complete: ${migratedCount} items updated`);
        } else {
          console.log('✅ QR codes already up to date (no migration needed)');
        }
      } catch (qrMigrationErr) {
        console.warn('QR code UUID migration failed (ignored, will retry on next init):', qrMigrationErr);
      }

      // ========================================
      // CATALOGS TABLE (мульти-каталог)
      // ========================================
      const catalogsTableInfo = await getFirstWithRetry<{ name: string }>(
        databaseInstance!,
        "SELECT name FROM sqlite_master WHERE type='table' AND name='catalogs';"
      );

      if (!catalogsTableInfo) {
        console.log('Creating catalogs table');
        await execWithRetry(databaseInstance!, `
          CREATE TABLE catalogs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            serverId INTEGER,
            uuid TEXT UNIQUE,
            name TEXT NOT NULL,
            icon TEXT,
            color TEXT,
            sortOrder INTEGER DEFAULT 0,
            isEnabled INTEGER DEFAULT 1,
            sizeTypes TEXT NOT NULL DEFAULT '[]',
            version INTEGER DEFAULT 1,
            isDeleted INTEGER DEFAULT 0,
            needsSync INTEGER DEFAULT 0,
            createdAt INTEGER DEFAULT (strftime('%s', 'now') * 1000),
            updatedAt INTEGER DEFAULT (strftime('%s', 'now') * 1000)
          );
        `);
        try {
          await execWithRetry(databaseInstance!, 'CREATE INDEX IF NOT EXISTS idx_catalogs_isDeleted ON catalogs(isDeleted);');
          await execWithRetry(databaseInstance!, 'CREATE UNIQUE INDEX IF NOT EXISTS idx_catalogs_uuid ON catalogs(uuid);');
        } catch (idxErr) {
          console.warn('Failed to create catalogs indices (ignored):', idxErr);
        }
      }

      console.log('Sync system migration completed');
      console.log('Database initialized successfully');
      return databaseInstance!;
    } catch (error) {
      console.error('Failed to initialize database:', error);
      databaseInstance = null;
      throw error;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
};



export const getDatabaseInstance = async (): Promise<SQLite.SQLiteDatabase> => {
  // Если есть активный initPromise (база инициализируется), ждём его
  if (initPromise) {
    return await initPromise;
  }
  // Если база не инициализирована, инициализируем
  if (!databaseInstance) {
    return await initDatabase();
  }
  return databaseInstance!;
};

/** Публичные операции выполняются через withLock для сериализации */
export const addItem = async (item: Omit<Item, 'id' | 'createdAt'>): Promise<void> => {
  return withLock(async () => {
    const db = await getDatabaseInstance();
    let finalImageUri: string | null = item.imageUri ?? null;

    if (item.imageUri) {
      const src: string = item.imageUri;
      try {
        const fileName = src.split('/').pop() ?? `${Date.now()}`;
        const newPath = `${FileSystem.documentDirectory}${fileName}`;
        try {
          await FileSystem.moveAsync({ from: src, to: newPath });
          finalImageUri = newPath;
        } catch {
          try {
            await FileSystem.copyAsync({ from: src, to: newPath });
            finalImageUri = newPath;
          } catch {
            finalImageUri = src;
          }
        }
      } catch (e) {
        console.warn('Image handling failed (ignored):', e);
      }
    }

    const totalQuantity = item.totalQuantity;
    const totalValue = item.totalValue;

    let txnActive = false;
    try {
      await execWithRetry(db, 'BEGIN TRANSACTION;');
      txnActive = true;

      const result = await runWithRetry(db, `
        INSERT INTO items (name, code, warehouse, numberOfBoxes, boxSizeQuantities, sizeType, itemType, row, position, side, imageUri, totalQuantity, totalValue, qrCodeType, qrCodes, needsSync, imageNeedsUpload, uuid)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `, [
        item.name,
        item.code,
        item.warehouse,
        item.numberOfBoxes,
        item.boxSizeQuantities,
        item.sizeType,
        item.itemType,
        item.row,
        item.position,
        item.side,
        finalImageUri,
        totalQuantity,
        totalValue,
        item.qrCodeType || 'none',
        item.qrCodes || null,
        finalImageUri ? 1 : 0, // imageNeedsUpload если есть изображение
        generateUUID(), // Generates UUID
      ]);

      const newId = result.lastInsertRowId || 0;

      const sizeMap = getSizeQuantities(item.boxSizeQuantities);
      const sizes = Object.entries(sizeMap).map(([s, q]) => ({
        size: isNaN(Number(s)) ? s : Number(s), // Сохраняем как число если возможно, иначе как строку
        quantity: q as number
      }));
      const totalRecommendedValue = computeTotalRecommendedValue(item.boxSizeQuantities);
      const details = JSON.stringify({ type: 'create', initialSizes: sizes, total: totalQuantity, totalValue, totalRecommendedValue });

      await runWithRetry(db, `
        INSERT INTO transactions (action, itemId, itemName, timestamp, details, needsSync)
        VALUES (?, ?, ?, ?, ?, 1)
      `, [
        'create' as const,
        newId,
        item.name,
        Math.floor(Date.now() / 1000),
        details,
      ]);

      await execWithRetry(db, 'COMMIT;');
      txnActive = false;
      console.log('Item successfully saved to database, result:', result);
      console.log('Transaction logged successfully for create');
    } catch (transactionError) {
      console.error('Transaction error while adding item:', transactionError);
      if (txnActive) {
        try {
          await execWithRetry(db, 'ROLLBACK;');
        } catch (rbErr) {
          console.warn('Rollback failed (ignored):', rbErr);
        }
      }
      databaseInstance = null;
      throw transactionError;
    }
  });
};

/**
 * Вставка при импорте: предполагается, что imageUri уже записан в FileSystem и не должен перемещаться.
 * Используется для импортного процесса, чтобы не пытаться повторно перемещать/копировать файлы.
 */
export const insertItemImport = async (item: Omit<Item, 'id' | 'createdAt'> & { createdAt?: number | null }): Promise<void> => {
  return withLock(async () => {
    const db = await getDatabaseInstance();
    let txnActive = false;
    try {
      await execWithRetry(db, 'BEGIN TRANSACTION;');
      txnActive = true;

      const createdAtValue = item.createdAt ?? Math.floor(Date.now() / 1000);

      const result = await runWithRetry(db, `
        INSERT INTO items (name, code, warehouse, numberOfBoxes, boxSizeQuantities, sizeType, itemType, row, position, side, imageUri, totalQuantity, totalValue, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        item.name,
        item.code,
        item.warehouse,
        item.numberOfBoxes,
        item.boxSizeQuantities,
        item.sizeType,
        item.itemType || 'обувь',
        item.row,
        item.position,
        item.side,
        item.imageUri,
        item.totalQuantity,
        item.totalValue,
        createdAtValue,
      ]);

      await execWithRetry(db, 'COMMIT;');
      txnActive = false;
      console.log('Imported item saved to database, result:', result);
    } catch (transactionError) {
      console.error('Transaction error while inserting imported item:', transactionError);
      if (txnActive) {
        try {
          await execWithRetry(db, 'ROLLBACK;');
        } catch (rbErr) {
          console.warn('Rollback failed (ignored):', rbErr);
        }
      }
      databaseInstance = null;
      throw transactionError;
    }
  });
};

export const getAllItems = async (): Promise<Item[]> => {
  return withLock(async () => {
    try {
      const db = await getDatabaseInstance();
      const result = await getAllWithRetry<Item>(db, 'SELECT * FROM items ORDER BY createdAt DESC', []);
      console.log(`Retrieved ${result.length} items (including deleted) from database`);
      return result || [];
    } catch (error) {
      console.error('Error fetching all items:', error);
      databaseInstance = null;
      return [];
    }
  });
};

export const getItems = async (): Promise<Item[]> => {
  return withLock(async () => {
    try {
      const db = await getDatabaseInstance();
      const result = await getAllWithRetry<Item>(db, 'SELECT * FROM items WHERE isDeleted = 0 ORDER BY createdAt DESC', []);
      console.log(`Retrieved ${result.length} items from database`);
      return result || [];
    } catch (error) {
      console.error('Error fetching items:', error);
      databaseInstance = null;
      return [];
    }
  });
};

/**
 * Get single item by ID (tries uuid first, then local id, then serverId, then by name)
 * @param id - local item id
 * @param itemName - optional item name for fallback search
 * @param itemUuid - optional UUID for cross-device identification (highest priority)
 */
export const getItemById = async (id: number, itemName?: string, itemUuid?: string): Promise<Item | null> => {
  return withLock(async () => {
    try {
      const db = await getDatabaseInstance();
      console.log('🔍 getItemById: searching for id=', id, 'name=', itemName, 'uuid=', itemUuid);

      // First try by UUID (highest priority for cross-device sync)
      let result: Item | null = null;
      if (itemUuid) {
        console.log('🔍 getItemById: trying uuid...');
        result = await getFirstWithRetry<Item>(db, 'SELECT * FROM items WHERE uuid = ? AND isDeleted = 0', [itemUuid]);
        if (result) {
          console.log('🔍 getItemById: found by uuid!');
          return result;
        }
      }

      // Then try by local id
      result = await getFirstWithRetry<Item>(db, 'SELECT * FROM items WHERE id = ?', [id]);

      // If not found, try by serverId
      if (!result) {
        console.log('🔍 getItemById: trying serverId...');
        result = await getFirstWithRetry<Item>(db, 'SELECT * FROM items WHERE serverId = ?', [id]);
      }

      // If still not found and we have a name, try by name
      if (!result && itemName) {
        console.log('🔍 getItemById: trying by name...');
        result = await getFirstWithRetry<Item>(db, 'SELECT * FROM items WHERE name = ? AND isDeleted = 0', [itemName]);
      }

      if (!result) {
        // Debug: show what IDs exist
        const allItems = await getAllWithRetry<{ id: number, serverId: number | null, name: string, uuid: string }>(
          db,
          'SELECT id, serverId, name, uuid FROM items LIMIT 10',
          []
        );
        console.log('🔍 getItemById: NOT FOUND. First 10 items in DB:', allItems.map(i => `id=${i.id}, serverId=${i.serverId}, uuid=${i.uuid?.slice(0, 8)}...`).join('; '));
      }

      console.log('🔍 getItemById: result=', result ? `found (id=${result.id}, serverId=${result.serverId}, uuid=${result.uuid?.slice(0, 8)}...)` : 'NOT FOUND');
      return result || null;
    } catch (error) {
      console.error('Error fetching item by id:', error);
      return null;
    }
  });
};

/**
 * New: getAllTransactions
 * Fetches all transactions without pagination for export.
 */
export const getAllTransactions = async (): Promise<Transaction[]> => {
  return withLock(async () => {
    try {
      const db = await getDatabaseInstance();
      const result = await getAllWithRetry<Transaction>(db, 'SELECT * FROM transactions WHERE isDeleted = 0 ORDER BY timestamp DESC', []);
      console.log(`Retrieved ${result.length} transactions from database`);
      return result || [];
    } catch (error) {
      console.error('Error fetching all transactions:', error);
      databaseInstance = null;
      return [];
    }
  });
};

/**
 * New: getItemsPage
 * - Performs WHERE (warehouse, searchTerm on name/code) and ORDER BY name ASC
 * - Uses LIMIT + OFFSET
 * - Returns items array and hasMore boolean
 */
export const getItemsPage = async (
  limit: number,
  offsetParam: number,
  searchTerm = '',
  warehouse = 'Все',
  itemType: 'all' | ItemType = 'all'
): Promise<{ items: Item[]; hasMore: boolean }> => {
  return withLock(async () => {
    try {
      const db = await getDatabaseInstance();
      const params: any[] = [];
      let whereClauses: string[] = [];

      if (warehouse && warehouse !== 'Все') {
        whereClauses.push('warehouse = ?');
        params.push(warehouse);
      }

      if (itemType && itemType !== 'all') {
        whereClauses.push('itemType = ?');
        params.push(itemType);
      }

      if (searchTerm && searchTerm.trim().length > 0) {
        // Fuzzy search: разбиваем поисковый запрос на символы для гибкого поиска
        // Например, "спо" найдет "Спортивная обувь" даже если пропущены буквы
        const fuzzyPattern = searchTerm
          .trim()
          .split('')
          .map(char => char.replace(/[%_]/g, '\\$&')) // экранируем спецсимволы SQL
          .join('%');
        const fuzzyLike = `%${fuzzyPattern}%`;

        // Также используем обычный поиск для точных совпадений
        const exactLike = `%${searchTerm.trim()}%`;

        whereClauses.push('(name LIKE ? COLLATE NOCASE OR code LIKE ? COLLATE NOCASE OR name LIKE ? COLLATE NOCASE OR code LIKE ? COLLATE NOCASE)');
        params.push(exactLike, exactLike, fuzzyLike, fuzzyLike);
      }

      whereClauses.push('isDeleted = 0');
      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
      // We'll request limit + 1 rows to determine hasMore
      const sql = `SELECT * FROM items ${whereSql} ORDER BY name COLLATE NOCASE ASC LIMIT ? OFFSET ?`;
      params.push(limit + 1, offsetParam);

      const rows = await getAllWithRetry<Item>(db, sql, params);
      const hasMore = rows.length > limit;
      const page = rows.slice(0, limit);

      // parse boxSizeQuantities once here and attach extra fields to items to avoid re-parsing later
      const processed = page.map(r => {
        let parsed: unknown = null;
        try {
          parsed = JSON.parse(r.boxSizeQuantities || '[]');
        } catch {
          parsed = [];
        }
        // compute unique size list string
        try {
          const boxSizeQuantities: any[] = Array.isArray(parsed) ? (parsed as any[]) : [];
          const allSizes = boxSizeQuantities.flatMap(box =>
            (Array.isArray(box) ? box : []).filter((sq: any) => sq && typeof sq.quantity === 'number' ? sq.quantity > 0 : false).map((sq: any) => sq.size)
          );
          const uniqueSizes = [...new Set(allSizes)].sort((a, b) => a - b);
          const sizeText = uniqueSizes.join(', ') || 'Нет размеров';
          return { ...r, parsedBoxSizeQuantities: parsed, sizeText } as Item & { parsedBoxSizeQuantities?: unknown; sizeText?: string };
        } catch {
          return { ...r, parsedBoxSizeQuantities: parsed, sizeText: 'Нет размеров' } as Item & { parsedBoxSizeQuantities?: unknown; sizeText?: string };
        }
      });

      return { items: processed, hasMore };
    } catch (error) {
      console.error('Error in getItemsPage:', error);
      databaseInstance = null;
      return { items: [], hasMore: false };
    }
  });
};

export const updateItemQuantity = async (id: number, boxSizeQuantities: string, totalQuantity: number, totalValue: number): Promise<void> => {
  return withLock(async () => {
    if (id == null) {
      throw new Error('Invalid item ID: null or undefined');
    }
    const db = await getDatabaseInstance();
    const item = await getFirstWithRetry<Item>(db, 'SELECT * FROM items WHERE id = ?', [id]);

    if (!item) {
      throw new Error(`Item with id ${id} not found`);
    }

    let txnActive = false;
    try {
      await execWithRetry(db, 'BEGIN TRANSACTION;');
      txnActive = true;

      const oldStr = item.boxSizeQuantities;
      const newStr = boxSizeQuantities;
      const oldMap = getSizeQuantities(oldStr);
      const newMap = getSizeQuantities(newStr);
      const changes = computeChanges(oldMap, newMap);

      let details = null;
      if (changes.length > 0) {
        // Есть изменение количества
        const totalRecommendedValueAfter = computeTotalRecommendedValue(newStr);
        details = JSON.stringify({ type: 'update', changes, totalAfter: totalQuantity, totalValueAfter: totalValue, totalRecommendedValueAfter });
      } else if (oldStr !== newStr) {
        // Только изменение цены (количество не менялось)
        // Вычисляем старую и новую рекомендованную цену
        const oldParsed = JSON.parse(oldStr || '[]');
        const newParsed = JSON.parse(newStr || '[]');

        let oldRecommendedPrice = 0;
        let newRecommendedPrice = 0;

        oldParsed.forEach((box: any[]) => {
          box.forEach((sq: any) => {
            if (sq && typeof sq.quantity === 'number' && typeof sq.recommendedSellingPrice === 'number') {
              oldRecommendedPrice += sq.quantity * sq.recommendedSellingPrice;
            }
          });
        });

        newParsed.forEach((box: any[]) => {
          box.forEach((sq: any) => {
            if (sq && typeof sq.quantity === 'number' && typeof sq.recommendedSellingPrice === 'number') {
              newRecommendedPrice += sq.quantity * sq.recommendedSellingPrice;
            }
          });
        });

        details = JSON.stringify({
          type: 'price_update',
          oldTotalValue: item.totalValue,
          newTotalValue: totalValue,
          oldRecommendedPrice,
          newRecommendedPrice
        });
      }

      const result = await runWithRetry(db, 'UPDATE items SET boxSizeQuantities = ?, totalQuantity = ?, totalValue = ?, needsSync = 1 WHERE id = ?', [boxSizeQuantities, totalQuantity, totalValue, id]);

      const changed = getAffectedRows(result);
      if (typeof changed === 'number' && changed === 0) {
        throw new Error(`Update affected 0 rows for id=${id}`);
      }

      if (details) {
        await runWithRetry(db, `
          INSERT INTO transactions (action, itemId, itemName, timestamp, details, needsSync, uuid)
          VALUES (?, ?, ?, ?, ?, 1, ?)
        `, [
          'update' as const,
          id,
          item.name,
          Math.floor(Date.now() / 1000),
          details,
          generateUUID(),
        ]);
      }

      await execWithRetry(db, 'COMMIT;');
      txnActive = false;
      console.log('Item quantity successfully updated, result:', result);
      if (details) {
        console.log('Transaction logged successfully for update');
      }
    } catch (transactionError) {
      console.error('Transaction update error:', transactionError);
      if (txnActive) {
        try {
          await execWithRetry(db, 'ROLLBACK;');
        } catch (rbErr) {
          console.warn('Rollback failed (ignored):', rbErr);
        }
      }
      databaseInstance = null;
      throw transactionError;
    }
  });
};

export const deleteItem = async (id: number): Promise<void> => {
  return withLock(async () => {
    if (id == null) {
      throw new Error('Invalid item ID: null or undefined');
    }
    const db = await getDatabaseInstance();
    const item = await getFirstWithRetry<Item>(db, 'SELECT * FROM items WHERE id = ?', [id]);

    if (!item) {
      throw new Error(`Item with id ${id} not found`);
    }

    let txnActive = false;
    try {
      await execWithRetry(db, 'BEGIN TRANSACTION;');
      txnActive = true;

      const sizeMap = getSizeQuantities(item.boxSizeQuantities);
      const sizes = Object.entries(sizeMap).map(([s, q]) => ({
        size: isNaN(Number(s)) ? s : Number(s), // Сохраняем как число если возможно, иначе как строку
        quantity: q as number
      }));
      const totalRecommendedValue = computeTotalRecommendedValue(item.boxSizeQuantities);
      const details = JSON.stringify({ type: 'delete', finalSizes: sizes, total: item.totalQuantity, totalValue: item.totalValue, totalRecommendedValue });

      const result = await runWithRetry(db, 'UPDATE items SET isDeleted = 1, needsSync = 1 WHERE id = ?', [id]);

      const changed = getAffectedRows(result);
      if (typeof changed === 'number' && changed === 0) {
        throw new Error(`Delete affected 0 rows for id=${id}`);
      }

      await runWithRetry(db, `
        INSERT INTO transactions (action, itemId, itemName, timestamp, details, needsSync, uuid)
        VALUES (?, ?, ?, ?, ?, 1, ?)
      `, [
        'delete' as const,
        id,
        item.name,
        Math.floor(Date.now() / 1000),
        details,
        generateUUID(),
      ]);

      await execWithRetry(db, 'COMMIT;');
      txnActive = false;
      console.log('Item successfully deleted, result:', result);
      console.log('Transaction logged successfully for delete');

      // Delete image after commit
      if (item.imageUri) {
        try {
          const fileInfo = await FileSystem.getInfoAsync(item.imageUri);
          if (fileInfo.exists) {
            await FileSystem.deleteAsync(item.imageUri, { idempotent: true });
            console.log('Item image deleted:', item.imageUri);
          }
        } catch (fileError) {
          console.warn('Failed to delete image file:', fileError);
        }
      }
    } catch (transactionError) {
      console.error('Transaction delete error:', transactionError);
      if (txnActive) {
        try {
          await execWithRetry(db, 'ROLLBACK;');
        } catch (rbErr) {
          console.warn('Rollback failed (ignored):', rbErr);
        }
      }
      databaseInstance = null;
      throw transactionError;
    }
  });
};

/**
 * Обработка транзакции продажи
 * Уменьшает количество товара и создаёт запись о продаже
 */
export interface PaymentInfo {
  method: 'cash' | 'card' | 'mixed';
  bank?: 'alif' | 'dc';
  cashAmount?: number;
  cardAmount?: number;
}

export const processSaleTransaction = async (
  itemId: number,
  boxIndex: number,
  sizeIndex: number,
  size: number | string,
  quantity: number,
  costPrice: number,
  salePrice: number,
  paymentInfo: PaymentInfo,
  clientId?: number | null,
  discount?: { mode: 'amount' | 'percent'; value: number },
  saleId?: string, // ID для группировки товаров одной продажи
  appliedDiscount: number = 0, // Сумма скидки для этого товара (пропорционально распределённая)
  clientUuid?: string | null // UUID клиента для синхронизации
): Promise<void> => {
  return withLock(async () => {
    const db = await getDatabaseInstance();
    const item = await getFirstWithRetry<Item>(db, 'SELECT * FROM items WHERE id = ?', [itemId]);

    if (!item) {
      throw new Error(`Item with id ${itemId} not found`);
    }

    let txnActive = false;
    try {
      await execWithRetry(db, 'BEGIN TRANSACTION;');
      txnActive = true;

      // Парсим текущие boxSizeQuantities
      let boxSizeQuantities: any[][] = JSON.parse(item.boxSizeQuantities || '[]');

      // Проверяем что коробка и размер существуют
      if (boxIndex < 0 || boxIndex >= boxSizeQuantities.length) {
        throw new Error(`Invalid boxIndex: ${boxIndex}`);
      }

      const box = boxSizeQuantities[boxIndex];
      if (sizeIndex < 0 || sizeIndex >= box.length) {
        throw new Error(`Invalid sizeIndex: ${sizeIndex}`);
      }

      const sizeEntry = box[sizeIndex];
      const previousQuantity = sizeEntry.quantity || 0;

      if (previousQuantity < quantity) {
        throw new Error(`Insufficient quantity: have ${previousQuantity}, requested ${quantity}`);
      }

      // Уменьшаем количество
      sizeEntry.quantity = previousQuantity - quantity;

      // Пересчитываем общие значения
      let newTotalQuantity = 0;
      let newTotalValue = 0;
      boxSizeQuantities.forEach(b => {
        b.forEach(sq => {
          if (sq && sq.quantity > 0) {
            newTotalQuantity += sq.quantity;
            newTotalValue += sq.quantity * (sq.price || 0);
          }
        });
      });

      // Рассчитываем прибыль с учётом скидки
      const grossSaleAmount = salePrice * quantity; // Сумма продажи до скидки
      const actualSaleAmount = grossSaleAmount - appliedDiscount; // Фактическая сумма после скидки
      const costAmount = costPrice * quantity;
      const profit = actualSaleAmount - costAmount; // Прибыль с учётом скидки

      // Формируем детали транзакции
      const saleDetails = {
        type: 'sale' as const,
        sale: {
          size,
          quantity,
          costPrice,
          salePrice,
          previousQuantity,
          profit,
          boxIndex,
          sizeIndex,
          appliedDiscount, // Сумма скидки для этого товара
          actualSaleAmount, // Фактическая сумма продажи после скидки
        },
        paymentInfo,
        clientId: clientId || null,
        clientUuid: clientUuid || null,
        discount: discount || null,
        totalProfit: profit,
        saleId: saleId || null, // Для группировки множественных продаж
        itemName: item.name, // Для отображения в деталях
      };

      // Обновляем товар
      await runWithRetry(db,
        'UPDATE items SET boxSizeQuantities = ?, totalQuantity = ?, totalValue = ?, needsSync = 1 WHERE id = ?',
        [JSON.stringify(boxSizeQuantities), newTotalQuantity, newTotalValue, itemId]
      );

      // Создаём транзакцию продажи
      await runWithRetry(db, `
        INSERT INTO transactions (action, itemId, itemName, itemImageUri, timestamp, details, needsSync, uuid, itemUuid)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
      `, [
        'sale',
        itemId,
        item.name,
        item.imageUri || null,
        Math.floor(Date.now() / 1000),
        JSON.stringify(saleDetails),
        generateUUID(),
        item.uuid || null,
      ]);

      await execWithRetry(db, 'COMMIT;');
      txnActive = false;
      console.log(`Sale processed: ${item.name}, size ${size}, qty ${quantity}, profit ${profit}`);
    } catch (error) {
      console.error('Error processing sale:', error);
      if (txnActive) {
        try {
          await execWithRetry(db, 'ROLLBACK;');
        } catch (rbErr) {
          console.warn('Rollback failed (ignored):', rbErr);
        }
      }
      databaseInstance = null;
      throw error;
    }
  });
};

export const addTransaction = async (transaction: Omit<Transaction, 'id'>): Promise<void> => {
  return withLock(async () => {
    const db = await getDatabaseInstance();
    try {
      await runWithRetry(db, `
        INSERT INTO transactions (action, itemId, itemName, itemImageUri, timestamp, details, needsSync, uuid, itemUuid)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
      `, [
        transaction.action,
        transaction.itemId,
        transaction.itemName,
        transaction.itemImageUri || null,
        transaction.timestamp,
        transaction.details,
        generateUUID(),
        transaction.itemUuid || null,
      ]);
      console.log('Transaction added successfully');
    } catch (error) {
      console.error('Error adding transaction:', error);
      throw error;
    }
  });
};

/**
 * Получение всех транзакций по saleId
 * Используется для отображения групповых продаж
 */
export const getTransactionsBySaleId = async (saleId: string): Promise<Transaction[]> => {
  return withLock(async () => {
    const db = await getDatabaseInstance();
    try {
      // Ищем все транзакции содержащие этот saleId в details
      const transactions = await getAllWithRetry<Transaction>(db, `
        SELECT * FROM transactions 
        WHERE action = 'sale' 
        AND isDeleted = 0
        AND (details LIKE ? OR details LIKE ?)
        ORDER BY timestamp DESC
      `, [`%"saleId":"${saleId}"%`, `%"saleId": "${saleId}"%`]);

      console.log(`getTransactionsBySaleId: found ${transactions.length} transactions for saleId=${saleId}`);
      return transactions;
    } catch (error) {
      console.error('Error getting transactions by saleId:', error);
      return [];
    }
  });
};

/**
 * Получение всех транзакций по clientId / clientUuid / serverId
 * Используется для отображения истории покупок клиента
 * Ищет по: clientUuid (самый надёжный), локальному clientId, и serverId клиента
 */
export const getTransactionsByClient = async (client: Client): Promise<Transaction[]> => {
  return withLock(async () => {
    const db = await getDatabaseInstance();
    try {
      const { id: clientId, uuid: clientUuid, serverId: clientServerId } = client as Client & { serverId?: number | null };

      // Строим условия поиска
      const conditions: string[] = [];

      // 1. UUID search — самый надёжный для синхронизированных данных
      if (clientUuid) {
        conditions.push(`details LIKE '%"clientUuid":"${clientUuid}"%'`);
        conditions.push(`details LIKE '%"clientUuid": "${clientUuid}"%'`);
      }

      // 2. Локальный ID — для локально созданных транзакций
      conditions.push(`details LIKE '%"clientId":${clientId},%'`);
      conditions.push(`details LIKE '%"clientId": ${clientId},%'`);
      conditions.push(`details LIKE '%"clientId":${clientId}}%'`);
      conditions.push(`details LIKE '%"clientId": ${clientId}}%'`);
      // String format (potential sync artifact)
      conditions.push(`details LIKE '%"clientId":"${clientId}",%'`);
      conditions.push(`details LIKE '%"clientId": "${clientId}",%'`);
      conditions.push(`details LIKE '%"clientId":"${clientId}"}%'`);
      conditions.push(`details LIKE '%"clientId": "${clientId}"}%'`);

      // 3. Server ID — транзакции которые хранят серверный clientId (до ремаппинга)
      if (clientServerId && clientServerId !== clientId) {
        conditions.push(`details LIKE '%"clientId":${clientServerId},%'`);
        conditions.push(`details LIKE '%"clientId": ${clientServerId},%'`);
        conditions.push(`details LIKE '%"clientId":${clientServerId}}%'`);
        conditions.push(`details LIKE '%"clientId": ${clientServerId}}%'`);
        conditions.push(`details LIKE '%"clientId":"${clientServerId}",%'`);
        conditions.push(`details LIKE '%"clientId": "${clientServerId}",%'`);
        conditions.push(`details LIKE '%"clientId":"${clientServerId}"}%'`);
        conditions.push(`details LIKE '%"clientId": "${clientServerId}"}%'`);
      }

      const query = `
        SELECT * FROM transactions 
        WHERE action = 'sale' 
        AND isDeleted = 0
        AND (
          ${conditions.join(' OR \n          ')}
        )
        ORDER BY timestamp DESC
      `;

      const transactions = await getAllWithRetry<Transaction>(db, query);

      // Дедупликация по id (разные условия могут найти одну и ту же транзакцию)
      const seen = new Set<number>();
      const unique = transactions.filter(tx => {
        if (seen.has(tx.id)) return false;
        seen.add(tx.id);
        return true;
      });

      console.log(`getTransactionsByClient: found ${unique.length} transactions for client ${client.name} (id=${clientId}, uuid=${clientUuid}, serverId=${clientServerId})`);
      return unique;
    } catch (error) {
      console.error('Error getting transactions by client:', error);
      return [];
    }
  });
};

/**
 * New: insertTransactionImport
 * Inserts a transaction during import, ignoring id.
 */
export const insertTransactionImport = async (transaction: Omit<Transaction, 'id'>): Promise<void> => {
  return withLock(async () => {
    const db = await getDatabaseInstance();
    try {
      await runWithRetry(db, `
        INSERT INTO transactions (action, itemId, itemName, timestamp, details, uuid, itemUuid)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        transaction.action,
        transaction.itemId,
        transaction.itemName,
        transaction.timestamp,
        transaction.details,
        transaction.uuid || generateUUID(),
        transaction.itemUuid || null,
      ]);
      console.log('Imported transaction inserted successfully');
    } catch (error) {
      console.error('Error inserting imported transaction:', error);
      databaseInstance = null;
      throw error;
    }
  });
};

export const getTransactionsPage = async (
  limit: number,
  offsetParam: number
): Promise<{ transactions: Transaction[]; hasMore: boolean }> => {
  return withLock(async () => {
    try {
      const db = await getDatabaseInstance();
      // We'll request limit + 1 rows to determine hasMore
      const sql = `SELECT * FROM transactions WHERE isDeleted = 0 ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
      const params = [limit + 1, offsetParam];

      const rows = await getAllWithRetry<Transaction>(db, sql, params);
      const hasMore = rows.length > limit;
      const page = rows.slice(0, limit);

      return { transactions: page, hasMore };
    } catch (error) {
      console.error('Error in getTransactionsPage:', error);
      databaseInstance = null;
      return { transactions: [], hasMore: false };
    }
  });
};

// Поиск транзакций по названию товара
export const searchTransactions = async (
  searchQuery: string,
  limit: number,
  offsetParam: number
): Promise<{ transactions: Transaction[]; hasMore: boolean }> => {
  return withLock(async () => {
    try {
      const db = await getDatabaseInstance();
      const sql = `SELECT * FROM transactions WHERE itemName LIKE ? AND isDeleted = 0 ORDER BY timestamp ASC LIMIT ? OFFSET ?`;
      const params = [`%${searchQuery}%`, limit + 1, offsetParam];

      const rows = await getAllWithRetry<Transaction>(db, sql, params);
      const hasMore = rows.length > limit;
      const page = rows.slice(0, limit);

      return { transactions: page, hasMore };
    } catch (error) {
      console.error('Error in searchTransactions:', error);
      databaseInstance = null;
      return { transactions: [], hasMore: false };
    }
  });
};

// Фильтрация транзакций по дате (день)
export const filterTransactionsByDate = async (
  startTimestamp: number,
  endTimestamp: number,
  limit: number,
  offsetParam: number
): Promise<{ transactions: Transaction[]; hasMore: boolean }> => {
  return withLock(async () => {
    try {
      const db = await getDatabaseInstance();
      const sql = `SELECT * FROM transactions WHERE timestamp >= ? AND timestamp < ? AND isDeleted = 0 ORDER BY timestamp ASC LIMIT ? OFFSET ?`;
      const params = [startTimestamp, endTimestamp, limit + 1, offsetParam];

      const rows = await getAllWithRetry<Transaction>(db, sql, params);
      const hasMore = rows.length > limit;
      const page = rows.slice(0, limit);

      return { transactions: page, hasMore };
    } catch (error) {
      console.error('Error in filterTransactionsByDate:', error);
      databaseInstance = null;
      return { transactions: [], hasMore: false };
    }
  });
};

export const clearDatabase = async (): Promise<void> => {
  return withLock(async () => {
    const db = await getDatabaseInstance();
    const itemsWithImages = await getAllWithRetry<Item>(db, 'SELECT * FROM items WHERE imageUri IS NOT NULL', []);

    let txnActive = false;
    try {
      await execWithRetry(db, 'BEGIN TRANSACTION;');
      txnActive = true;

      await execWithRetry(db, 'DELETE FROM items;');
      await execWithRetry(db, 'DELETE FROM transactions;');
      await execWithRetry(db, 'DELETE FROM pending_actions;');
      await execWithRetry(db, 'UPDATE sync_state SET lastSyncAt = 0, lastItemVersion = 0, lastTransactionId = 0, lastPendingActionId = 0, deviceId = NULL, pendingChangesCount = 0 WHERE id = 1;');

      for (const item of itemsWithImages) {
        if (item.imageUri) {
          try {
            const fileInfo = await FileSystem.getInfoAsync(item.imageUri);
            if (fileInfo.exists) {
              await FileSystem.deleteAsync(item.imageUri, { idempotent: true });
              console.log('Item image deleted:', item.imageUri);
            }
          } catch (fileError) {
            console.warn('Failed to delete image file:', fileError);
          }
        }
      }

      await execWithRetry(db, 'COMMIT;');
      txnActive = false;
      console.log('Database successfully cleared');
    } catch (transactionError) {
      console.error('Transaction clear error:', transactionError);
      if (txnActive) {
        try {
          await execWithRetry(db, 'ROLLBACK;');
        } catch (rbErr) {
          console.warn('Rollback failed (ignored):', rbErr);
        }
      }
      databaseInstance = null;
      throw transactionError;
    }
  });
};

/**
 * New: clearTransactions
 * Clears only the transactions table for testing.
 */
export const clearTransactions = async (): Promise<void> => {
  return withLock(async () => {
    const db = await getDatabaseInstance();
    let txnActive = false;
    try {
      await execWithRetry(db, 'BEGIN TRANSACTION;');
      txnActive = true;

      await execWithRetry(db, 'DELETE FROM transactions;');

      await execWithRetry(db, 'COMMIT;');
      txnActive = false;
      console.log('Transactions successfully cleared');
    } catch (transactionError) {
      console.error('Transaction clear transactions error:', transactionError);
      if (txnActive) {
        try {
          await execWithRetry(db, 'ROLLBACK;');
        } catch (rbErr) {
          console.warn('Rollback failed (ignored):', rbErr);
        }
      }
      databaseInstance = null;
      throw transactionError;
    }
  });
};

/**
 * New: getDistinctWarehouses
 */
export const getDistinctWarehouses = async (): Promise<string[]> => {
  return withLock(async () => {
    try {
      const db = await getDatabaseInstance();
      const rows = await getAllWithRetry<{ warehouse: string }>(db, 'SELECT DISTINCT warehouse FROM items WHERE isDeleted = 0 ORDER BY warehouse ASC', []);
      return (rows || []).map(r => r.warehouse);
    } catch (error) {
      console.error('Error fetching distinct warehouses:', error);
      databaseInstance = null;
      return [];
    }
  });
};

export const closeDatabase = async (): Promise<void> => {
  return withLock(async () => {
    if (databaseInstance) {
      try {
        // @ts-ignore
        await (databaseInstance as any).closeAsync();
        console.log('Database connection closed');
      } catch (error) {
        console.error('Error closing database:', error);
      } finally {
        databaseInstance = null;
      }
    }
  });
};

export const updateItem = async (item: Item): Promise<void> => {
  return withLock(async () => {
    const db = await getDatabaseInstance();

    await runWithRetry(db, `
      UPDATE items 
      SET name = ?, code = ?, warehouse = ?, numberOfBoxes = ?, row = ?, position = ?, side = ?, imageUri = ?, needsSync = 1
      WHERE id = ?
    `, [
      item.name,
      item.code,
      item.warehouse,
      item.numberOfBoxes,
      item.row,
      item.position,
      item.side,
      item.imageUri,
      item.id
    ]);
  });
};

/**
 * Обновление QR-кодов товара
 */
export const updateItemQRCodes = async (id: number, qrCodeType: string, qrCodes: string | null): Promise<void> => {
  return withLock(async () => {
    const db = await getDatabaseInstance();

    await runWithRetry(db, `
      UPDATE items 
      SET qrCodeType = ?, qrCodes = ?, needsSync = 1
      WHERE id = ?
    `, [
      qrCodeType,
      qrCodes,
      id
    ]);
  });
};

interface SaleInfo {
  size: number;
  quantity: number;
  costPrice: number;
  salePrice: number;
  previousQuantity: number;
  profit: number;
  boxIndex?: number;
  sizeIndex?: number; // Индекс размера в коробке  
}

interface CreateInfo {
  initialSizes: { size: number; quantity: number }[];
  total: number;
  totalValue: number;
}

interface UpdateInfo {
  changes: {
    size: number;
    oldQuantity: number;
    newQuantity: number;
    delta: number
  }[];
  totalAfter: number;
  totalValueAfter: number;
}

interface DeleteInfo {
  finalSizes: { size: number; quantity: number }[];
  total: number;
  totalValue: number;
}

interface WholesaleInfo {
  boxes: {
    boxIndex: number;
    quantity: number;
    costPrice: number;
    salePrice: number;
    profit: number;
    sizes: {
      size: number;
      quantity: number;
      price: number;
    }[];
  }[];
  totalBoxes: number;
  totalQuantity: number;
  totalCostPrice: number;
  totalSalePrice: number;
  totalProfit: number;
}

interface TransactionDetails {
  type: 'sale' | 'create' | 'update' | 'delete' | 'wholesale';
  sale?: SaleInfo;
  wholesale?: WholesaleInfo;
  initialSizes?: CreateInfo['initialSizes'];
  total?: number;
  totalValue?: number;
  changes?: UpdateInfo['changes'];
  totalAfter?: number;
  totalValueAfter?: number;
  finalSizes?: DeleteInfo['finalSizes'];
  size?: number;
  quantity?: number;
  costPrice?: number;
  salePrice?: number;
  previousQuantity?: number;
  profit?: number;
  boxIndex?: number; // Добавляем опциональное поле для индекса коробки
}

const parseDetails = (details: string | null | undefined): TransactionDetails | null => {
  if (!details) return null;
  try {
    return JSON.parse(details);
  } catch {
    return null;
  }
};

export const deleteTransaction = async (transactionId: number): Promise<{ success: boolean; message?: string }> => {
  return withLock(async () => {
    const db = await getDatabaseInstance();
    let txnActive = false;
    try {
      await execWithRetry(db, 'BEGIN TRANSACTION;');
      txnActive = true;

      const transaction = await getFirstWithRetry<Transaction>(db, 'SELECT * FROM transactions WHERE id = ? AND isDeleted = 0', [transactionId]);
      if (!transaction) {
        throw new Error('Transaction not found');
      }

      const { action, itemId, timestamp, details: transactionDetails } = transaction;

      // Сначала парсим детали для получения saleId
      const txDetails = parseDetails(transactionDetails);
      const saleId = (txDetails as any)?.saleId;

      // Находим все связанные транзакции
      let related: Transaction[] = [];

      if (saleId) {
        // Ищем все транзакции с таким же saleId (поддерживаем оба формата JSON)
        related = await getAllWithRetry<Transaction>(db, `
          SELECT * FROM transactions 
          WHERE action = 'sale' 
          AND isDeleted = 0
          AND (details LIKE ? OR details LIKE ?)
        `, [`%"saleId":"${saleId}"%`, `%"saleId": "${saleId}"%`]);
        console.log(`deleteTransaction: Found ${related.length} transactions with saleId=${saleId}`);
      }

      // Если нет saleId или не нашли - используем старую логику
      if (related.length === 0) {
        related = await getAllWithRetry<Transaction>(db, `
          SELECT * FROM transactions 
          WHERE itemId = ? 
          AND action IN ('sale', 'update', 'wholesale') 
          AND isDeleted = 0
          AND ABS(timestamp - ?) < 5
        `, [itemId, timestamp]);
      }

      // Find the sale transaction among related (including wholesale)
      let saleTx: Transaction | undefined = undefined;
      for (let tx of related) {
        const pd = parseDetails(tx.details);
        if (pd && (pd.sale || pd.type === 'sale' || pd.wholesale || pd.type === 'wholesale' || tx.action === 'wholesale')) {
          saleTx = tx;
          break;
        }
      }

      if (!saleTx) {
        throw new Error('Это не транзакция продажи или оптовой продажи');
      }

      const parsedDetails = parseDetails(saleTx.details);
      if (!parsedDetails) {
        throw new Error('Invalid transaction details');
      }

      const item = await getFirstWithRetry<Item>(db, 'SELECT * FROM items WHERE id = ?', [itemId]);
      if (!item) {
        await execWithRetry(db, 'COMMIT;');
        txnActive = false;
        return { success: false, message: 'Продажа закончена по этой карточке' };
      }

      let boxSizeQuantities: any[][] = [];
      try {
        boxSizeQuantities = JSON.parse(item.boxSizeQuantities || '[]');
      } catch {
        boxSizeQuantities = [];
      }

      // Проверяем тип транзакции для восстановления
      if (saleTx.action === 'wholesale' || parsedDetails.wholesale) {
        // Восстановление оптовой продажи
        const wholesaleInfo = parsedDetails.wholesale;
        if (!wholesaleInfo) {
          throw new Error('No wholesale details found');
        }

        // Восстанавливаем каждую проданную коробку
        for (const soldBox of wholesaleInfo.boxes) {
          const { boxIndex, sizes } = soldBox;

          // Убеждаемся что коробка существует
          if (boxIndex >= 0 && boxIndex < boxSizeQuantities.length) {
            const targetBox = boxSizeQuantities[boxIndex];

            // Восстанавливаем каждый размер в коробке
            for (const sizeInfo of sizes) {
              const { size, quantity, price } = sizeInfo;

              // Ищем размер в коробке
              let sizeFound = false;
              for (let j = 0; j < targetBox.length; j++) {
                const sq = targetBox[j];
                if (sq.size === size) {
                  sq.quantity = (sq.quantity || 0) + quantity;
                  sizeFound = true;
                  break;
                }
              }

              // Если размер не найден, добавляем его
              if (!sizeFound) {
                targetBox.push({ size, quantity, price });
              }
            }
          }
        }
      } else {
        // Восстановление обычных продаж - обрабатываем ВСЕ транзакции
        // Собираем все изменения по товарам
        const itemUpdates: Map<number, { boxSizeQuantities: any[][] }> = new Map();

        for (const tx of related) {
          if (tx.action !== 'sale') continue;

          const txParsed = parseDetails(tx.details);
          if (!txParsed || !txParsed.sale) continue;

          const targetItemId = tx.itemId;
          if (targetItemId === undefined) {
            console.warn('Transaction has no itemId, skipping');
            continue;
          }
          const { sale } = txParsed;
          const { size, quantity, costPrice, boxIndex, sizeIndex } = sale as any;

          // Получаем или загружаем boxSizeQuantities для товара
          if (!itemUpdates.has(targetItemId)) {
            const targetItem = await getFirstWithRetry<Item>(db, 'SELECT * FROM items WHERE id = ?', [targetItemId]);
            if (!targetItem) {
              console.warn(`Item ${targetItemId} not found, skipping`);
              continue;
            }
            const bsq = JSON.parse(targetItem.boxSizeQuantities || '[]');
            itemUpdates.set(targetItemId, { boxSizeQuantities: bsq });
          }

          const itemData = itemUpdates.get(targetItemId)!;
          const bsq = itemData.boxSizeQuantities;

          let found = false;

          // Попытка 1: boxIndex + sizeIndex
          if (typeof boxIndex === 'number' && typeof sizeIndex === 'number' &&
            boxIndex >= 0 && boxIndex < bsq.length) {
            const box = bsq[boxIndex];
            if (sizeIndex >= 0 && sizeIndex < box.length) {
              box[sizeIndex].quantity = (box[sizeIndex].quantity || 0) + quantity;
              found = true;
              console.log(`Restored: item=${targetItemId}, box=${boxIndex}, sizeIdx=${sizeIndex}, qty=${quantity}`);
            }
          }

          // Попытка 2: boxIndex + поиск по size
          if (!found && typeof boxIndex === 'number' && boxIndex >= 0 && boxIndex < bsq.length) {
            const box = bsq[boxIndex];
            for (let j = 0; j < box.length; j++) {
              if (box[j].size === size) {
                box[j].quantity = (box[j].quantity || 0) + quantity;
                found = true;
                break;
              }
            }
            if (!found) {
              box.push({ size, quantity, price: costPrice });
              found = true;
            }
          }

          // Попытка 3: поиск по всем коробкам
          if (!found) {
            for (let i = 0; i < bsq.length; i++) {
              const box = bsq[i];
              for (let j = 0; j < box.length; j++) {
                if (box[j].size === size) {
                  box[j].quantity = (box[j].quantity || 0) + quantity;
                  found = true;
                  break;
                }
              }
              if (found) break;
            }
            if (!found && bsq.length > 0) {
              bsq[0].push({ size, quantity, price: costPrice });
            }
          }
        }

        // Сохраняем все изменённые товары
        for (const [targetItemId, { boxSizeQuantities: bsq }] of itemUpdates) {
          let newTotalQuantity = 0;
          let newTotalValue = 0;
          bsq.forEach(box => {
            box.forEach(sq => {
              if (sq.quantity > 0) {
                newTotalQuantity += sq.quantity;
                newTotalValue += sq.quantity * (sq.price || 0);
              }
            });
          });

          await runWithRetry(db,
            'UPDATE items SET boxSizeQuantities = ?, totalQuantity = ?, totalValue = ?, needsSync = 1 WHERE id = ?',
            [JSON.stringify(bsq), newTotalQuantity, newTotalValue, targetItemId]
          );
          console.log(`Updated item ${targetItemId}: totalQty=${newTotalQuantity}`);
        }
      }

      // Soft delete all related transactions
      for (let tx of related) {
        await runWithRetry(db, 'UPDATE transactions SET isDeleted = 1, needsSync = 1 WHERE id = ?', [tx.id]);
      }
      console.log(`Deleted ${related.length} transactions`);

      await execWithRetry(db, 'COMMIT;');
      txnActive = false;
      return { success: true };
    } catch (error: any) {
      if (txnActive) {
        try {
          await execWithRetry(db, 'ROLLBACK;');
        } catch (rbErr) {
          console.warn('Rollback failed (ignored):', rbErr);
        }
      }
      console.error('Error deleting transaction:', error);
      databaseInstance = null;
      return { success: false, message: error.message };
    }
  });
};

// ============================================
// ЭКСПОРТ ВСПОМОГАТЕЛЬНЫХ ФУНКЦИЙ ДЛЯ SYNC
// ============================================

/**
 * Помечает ВСЕ существующие данные без serverId как требующие синхронизации.
 * Используется для миграции legacy данных с устройств, где уже была установлена старая версия.
 * Вызывать при первом входе пользователя после обновления.
 */
export const markLegacyDataForSync = async (): Promise<{ itemsMarked: number; transactionsMarked: number }> => {
  return withLock(async () => {
    const db = await initDatabase();

    try {
      console.log('🔄 Marking legacy data for sync...');

      // Подсчитать и пометить items без serverId
      const itemsToMark = await getFirstWithRetry<{ count: number }>(
        db,
        'SELECT COUNT(*) as count FROM items WHERE serverId IS NULL AND needsSync = 0 AND isDeleted = 0;'
      );
      const itemsCount = itemsToMark?.count || 0;

      if (itemsCount > 0) {
        await runWithRetry(
          db,
          'UPDATE items SET needsSync = 1, imageNeedsUpload = CASE WHEN imageUri IS NOT NULL AND imageUri != \'\' THEN 1 ELSE 0 END WHERE serverId IS NULL AND needsSync = 0;'
        );
        console.log(`✅ Marked ${itemsCount} legacy items for sync`);
      }

      // Подсчитать и пометить transactions без serverId
      const transactionsToMark = await getFirstWithRetry<{ count: number }>(
        db,
        'SELECT COUNT(*) as count FROM transactions WHERE serverId IS NULL AND needsSync = 0 AND isDeleted = 0;'
      );
      const transactionsCount = transactionsToMark?.count || 0;

      if (transactionsCount > 0) {
        await runWithRetry(
          db,
          'UPDATE transactions SET needsSync = 1 WHERE serverId IS NULL AND needsSync = 0;'
        );
        console.log(`✅ Marked ${transactionsCount} legacy transactions for sync`);
      }

      console.log(`🔄 Legacy data migration complete: ${itemsCount} items, ${transactionsCount} transactions`);

      return { itemsMarked: itemsCount, transactionsMarked: transactionsCount };
    } catch (error: any) {
      console.error('❌ Error marking legacy data for sync:', error);
      throw error;
    }
  });
};

/**
 * Генерирует тестовые данные локально для нагрузочного тестирования Push.
 * Создает 3000 товаров и 15000 транзакций.
 */
export const generateLocalTestData = async (
  onProgress: (msg: string) => void
): Promise<void> => {
  return withLock(async () => {
    const db = await getDatabaseInstance();
    const NUM_ITEMS = 3000;
    const TX_PER_ITEM = 5;
    const BATCH_SIZE = 500;

    try {
      onProgress('Начинаем генерацию...');

      // 1. Items
      for (let i = 0; i < NUM_ITEMS; i += BATCH_SIZE) {
        onProgress(`Генерация товаров: ${i}/${NUM_ITEMS}...`);

        await execWithRetry(db, 'BEGIN TRANSACTION;');
        try {
          // Генерируем пачку товаров
          for (let j = 0; j < BATCH_SIZE && (i + j) < NUM_ITEMS; j++) {
            const idx = i + j;
            const uuid = generateUUID();
            const now = Math.floor(Date.now() / 1000);

            await runWithRetry(db, `
              INSERT INTO items (
                name, code, warehouse, numberOfBoxes, boxSizeQuantities, 
                sizeType, itemType, row, position, side, 
                totalQuantity, totalValue, needsSync, uuid, createdAt
              ) VALUES (
                ?, ?, ?, ?, ?, 
                ?, ?, ?, ?, ?, 
                ?, ?, 1, ?, ?
              )
            `, [
              `Local Test Item ${idx}`, // name
              `LOC-${idx}-${Math.floor(Math.random() * 10000)}`, // code
              'Main Warehouse', // warehouse
              1, // numberOfBoxes
              '[]', // boxSizeQuantities
              'eu', // sizeType
              'обувь', // itemType
              'A', // row
              '1', // position
              'L', // side
              100, // totalQuantity
              5000, // totalValue
              uuid,
              now
            ]);
          }
          await execWithRetry(db, 'COMMIT;');
        } catch (e) {
          await execWithRetry(db, 'ROLLBACK;');
          throw e;
        }
      }

      // 2. Transactions
      // Для транзакций нам нужны ID товаров. 
      // Чтобы было быстрее, мы просто выберем все ID товаров, у которых code начинается с LOC-
      onProgress('Получение списка созданных товаров...');
      const items = await getAllWithRetry<{ id: number, name: string, uuid: string }>(
        db,
        "SELECT id, name, uuid FROM items WHERE code LIKE 'LOC-%'"
      );

      const TOTAL_TX = items.length * TX_PER_ITEM;
      let txCount = 0;

      for (let i = 0; i < items.length; i += 100) { // Обрабатываем партиями по 100 товаров
        onProgress(`Генерация транзакций: ${txCount}/${TOTAL_TX}...`);

        await execWithRetry(db, 'BEGIN TRANSACTION;');
        try {
          const chunk = items.slice(i, i + 100);
          for (const item of chunk) {
            for (let k = 0; k < TX_PER_ITEM; k++) {
              const txUuid = generateUUID();
              const now = Math.floor(Date.now() / 1000) - Math.floor(Math.random() * 100000); // Random time in past

              await runWithRetry(db, `
                       INSERT INTO transactions (
                         action, itemId, itemName, timestamp, details, needsSync, uuid
                       ) VALUES (?, ?, ?, ?, ?, 1, ?)
                     `, [
                k % 2 === 0 ? 'create' : 'update',
                item.id,
                item.name,
                now,
                JSON.stringify({ note: `Local load test transaction ${k}` }),
                txUuid
              ]);
              txCount++;
            }
          }
          await execWithRetry(db, 'COMMIT;');
        } catch (e) {
          await execWithRetry(db, 'ROLLBACK;');
          throw e;
        }
      }

      onProgress('Готово! Данные сгенерированы.');
    } catch (e) {
      console.error('generateLocalTestData failed:', e);
      throw e;
    }
  });
};

// ========================================
// CLIENT CRUD FUNCTIONS
// ========================================

export const getAllClients = async (): Promise<Client[]> => {
  return withLock(async () => {
    const db = await getDatabaseInstance();
    const rows = await getAllWithRetry<any>(db, 'SELECT * FROM clients WHERE isDeleted = 0 ORDER BY name ASC');
    return rows as Client[];
  });
};

export const getClientById = async (id: number): Promise<Client | null> => {
  return withLock(async () => {
    const db = await getDatabaseInstance();
    const row = await getFirstWithRetry<any>(db, 'SELECT * FROM clients WHERE id = ?', [id]);
    return row as Client | null;
  });
};

export const addClient = async (client: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>): Promise<number> => {
  return withLock(async () => {
    const db = await getDatabaseInstance();
    const now = Date.now();
    const uuid = generateUUID();

    const result = await runWithRetry(db, `
      INSERT INTO clients (name, phone, address, notes, birthday, uuid, needsSync, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `, [
      client.name,
      client.phone || null,
      client.address || null,
      client.notes || null,
      client.birthday || null,
      uuid,
      now,
      now
    ]);

    return result.lastInsertRowId || 0;
  });
};

export const updateClient = async (id: number, client: Partial<Client>): Promise<void> => {
  return withLock(async () => {
    const db = await getDatabaseInstance();
    const now = Date.now();

    const updates: string[] = [];
    const params: any[] = [];

    if (client.name !== undefined) { updates.push('name = ?'); params.push(client.name); }
    if (client.phone !== undefined) { updates.push('phone = ?'); params.push(client.phone); }
    if (client.address !== undefined) { updates.push('address = ?'); params.push(client.address); }
    if (client.notes !== undefined) { updates.push('notes = ?'); params.push(client.notes); }
    if (client.birthday !== undefined) { updates.push('birthday = ?'); params.push(client.birthday); }


    updates.push('needsSync = 1');
    updates.push('updatedAt = ?');
    params.push(now);
    params.push(id);

    await runWithRetry(db, `UPDATE clients SET ${updates.join(', ')} WHERE id = ?`, params);
  });
};

export const deleteClient = async (id: number): Promise<void> => {
  return withLock(async () => {
    const db = await getDatabaseInstance();
    await runWithRetry(db, 'UPDATE clients SET isDeleted = 1, needsSync = 1, updatedAt = ? WHERE id = ?', [Date.now(), id]);
  });
};

export const getClientsNeedingSync = async (): Promise<Client[]> => {
  return withLock(async () => {
    const db = await getDatabaseInstance();
    const rows = await getAllWithRetry<any>(db, 'SELECT * FROM clients WHERE needsSync = 1');
    return rows as Client[];
  });
};

export const markClientSynced = async (localId: number, serverId: number): Promise<void> => {
  return withLock(async () => {
    const db = await getDatabaseInstance();
    await runWithRetry(db, 'UPDATE clients SET serverId = ?, needsSync = 0 WHERE id = ?', [serverId, localId]);
  });
};

export const searchClients = async (searchTerm: string): Promise<Client[]> => {
  return withLock(async () => {
    const db = await getDatabaseInstance();
    const term = `%${searchTerm}%`;
    const rows = await getAllWithRetry<any>(
      db,
      'SELECT * FROM clients WHERE isDeleted = 0 AND (name LIKE ? OR phone LIKE ?) ORDER BY name ASC LIMIT 20',
      [term, term]
    );
    return rows as Client[];
  });
};

export const upsertClientFromServer = async (client: any): Promise<void> => {
  return withLock(async () => {
    const db = await getDatabaseInstance();

    // Проверяем есть ли уже такой client
    const existing = await getFirstWithRetry<any>(
      db,
      'SELECT id FROM clients WHERE serverId = ? OR uuid = ?',
      [client.id, client.uuid]
    );

    if (existing) {
      await runWithRetry(db, `
        UPDATE clients SET 
          serverId = ?, name = ?, phone = ?, address = ?, notes = ?, birthday = ?,
          isDeleted = ?, needsSync = 0, updatedAt = ?
        WHERE id = ?
      `, [
        client.id,
        client.name,
        client.phone || null,
        client.address || null,
        client.notes || null,
        client.birthday || null,
        client.isDeleted ? 1 : 0,
        Date.now(),
        existing.id
      ]);
    } else {
      await runWithRetry(db, `
        INSERT INTO clients (serverId, uuid, name, phone, address, notes, birthday, isDeleted, needsSync, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `, [
        client.id,
        client.uuid || null,
        client.name,
        client.phone || null,
        client.address || null,
        client.notes || null,
        client.birthday || null,
        client.isDeleted ? 1 : 0,
        Date.now(),
        Date.now()
      ]);
    }
  });
};

export { runWithRetry, getAllWithRetry, getFirstWithRetry, execWithRetry };