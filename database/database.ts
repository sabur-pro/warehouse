// database/database.ts
import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system';
import { Item, Transaction, ItemType } from './types';

const databaseName = 'warehouse.db';
let databaseInstance: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let migrating = false;

// Простая очередь (mutex-like) для последовательного выполнения операций
let opQueue: Promise<any> = Promise.resolve();
const withLock = <T>(fn: () => Promise<T>): Promise<T> => {
  const exec = () => fn();
  const next = opQueue.then(exec, exec);
  opQueue = next.catch(() => {});
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

const execWithRetry = async (db: SQLite.SQLiteDatabase, sql: string) => {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // В проекте вы, похоже, используете обёртки async вокруг expo-sqlite — вызываем их через any
      // если у вас другая реализация, подставьте нужный вызов.
      // @ts-ignore
      return await (db as any).execAsync(sql);
    } catch (err: any) {
      const msg = String(err?.message || err);
      if (shouldRetryMessage(msg)) {
        const wait = RETRY_BASE_MS * Math.pow(2, attempt);
        console.warn(`execAsync locked/retry ${attempt + 1}/${MAX_RETRIES} after ${wait}ms:`, msg);
        await sleep(wait);
        continue;
      }
      throw err;
    }
  }
  // последний пробный вызов — чтобы выбросить нормальную ошибку
  // @ts-ignore
  return await (db as any).execAsync(sql);
};

const runWithRetry = async (db: SQLite.SQLiteDatabase, sql: string, params: any[] = []) => {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // @ts-ignore
      return await (db as any).runAsync(sql, params);
    } catch (err: any) {
      const msg = String(err?.message || err);
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
  return await (db as any).runAsync(sql, params);
};

const getAllWithRetry = async <T = any>(db: SQLite.SQLiteDatabase, sql: string, params: any[] = []): Promise<T[]> => {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // @ts-ignore
      return await (db as any).getAllAsync<T>(sql, params);
    } catch (err: any) {
      const msg = String(err?.message || err);
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
  return await (db as any).getAllAsync<T>(sql, params);
};

const getFirstWithRetry = async <T = any>(db: SQLite.SQLiteDatabase, sql: string, params: any[] = []): Promise<T | null> => {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // @ts-ignore
      return await (db as any).getFirstAsync<T>(sql, params);
    } catch (err: any) {
      const msg = String(err?.message || err);
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
  return await (db as any).getFirstAsync<T>(sql, params);
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
            createdAt INTEGER DEFAULT (strftime('%s', 'now'))
          );
        `);

        // create indices to speed up searches
        try {
          await execWithRetry(databaseInstance!, `CREATE INDEX IF NOT EXISTS idx_items_name ON items(name);`);
          await execWithRetry(databaseInstance!, `CREATE INDEX IF NOT EXISTS idx_items_code ON items(code);`);
          await execWithRetry(databaseInstance!, `CREATE INDEX IF NOT EXISTS idx_items_warehouse ON items(warehouse);`);
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

        if (!columnNames.includes('qrCodeType')) {
          console.log('Adding qrCodeType column with default value "none"');
          await execWithRetry(databaseInstance!, 'ALTER TABLE items ADD COLUMN qrCodeType TEXT NOT NULL DEFAULT \'none\';');
        }

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
                  createdAt INTEGER DEFAULT (strftime('%s', 'now'))
                );
              `);

              await execWithRetry(databaseInstance!, `
                INSERT INTO items_temp (id, name, code, warehouse, numberOfBoxes, boxSizeQuantities, sizeType, itemType, row, position, side, imageUri, totalQuantity, totalValue, createdAt)
                SELECT id, name, code, warehouse, 1 as numberOfBoxes, '[]' as boxSizeQuantities, sizeType, 'обувь' as itemType, row, position, side, imageUri, totalQuantity, 0 as totalValue, createdAt FROM items;
              `);

              await execWithRetry(databaseInstance!, 'DROP TABLE items;');
              await execWithRetry(databaseInstance!, 'ALTER TABLE items_temp RENAME TO items;');

              await execWithRetry(databaseInstance!, 'COMMIT;');
              txnActive = false;
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
          if (migrating) {
            console.log('ID migration already in progress by another caller — skipping this attempt');
          } else {
            migrating = true;
            console.log('id column is not primary key - starting migration');

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
                  createdAt INTEGER DEFAULT (strftime('%s', 'now'))
                );
              `);

              await execWithRetry(databaseInstance!, `
                INSERT INTO items_temp (name, code, warehouse, numberOfBoxes, boxSizeQuantities, sizeType, itemType, row, position, side, imageUri, totalQuantity, totalValue, createdAt)
                SELECT name, code, warehouse, COALESCE(numberOfBoxes, 1) as numberOfBoxes, COALESCE(boxSizeQuantities, '[]') as boxSizeQuantities, sizeType, COALESCE(itemType, 'обувь') as itemType, row, position, side, imageUri, COALESCE(totalQuantity, 0) as totalQuantity, 0 as totalValue, COALESCE(createdAt, strftime('%s', 'now')) as createdAt FROM items;
              `);

              await execWithRetry(databaseInstance!, 'DROP TABLE items;');
              await execWithRetry(databaseInstance!, 'ALTER TABLE items_temp RENAME TO items;');

              await execWithRetry(databaseInstance!, 'COMMIT;');
              txnActive = false;
              console.log('ID migration completed successfully');
            } catch (migErr) {
              console.error('ID migration error:', migErr);
              if (txnActive) {
                try {
                  await execWithRetry(databaseInstance!, 'ROLLBACK;');
                } catch (rbErr) {
                  console.warn('Rollback failed during ID migration (ignored):', rbErr);
                }
              }
              databaseInstance = null;
              migrating = false;
              throw migErr;
            } finally {
              migrating = false;
            }
          }
        }
        // Ensure indices exist (in case table existed before)
        try {
          await execWithRetry(databaseInstance!, `CREATE INDEX IF NOT EXISTS idx_items_name ON items(name);`);
          await execWithRetry(databaseInstance!, `CREATE INDEX IF NOT EXISTS idx_items_code ON items(code);`);
          await execWithRetry(databaseInstance!, `CREATE INDEX IF NOT EXISTS idx_items_warehouse ON items(warehouse);`);
        } catch (idxErr) {
          console.warn('Failed to create indices (ignored):', idxErr);
        }
      }

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
            details TEXT
          );
        `);

        // Create index for efficient querying by timestamp
        try {
          await execWithRetry(databaseInstance!, `CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp DESC);`);
        } catch (idxErr) {
          console.warn('Failed to create transactions index (ignored):', idxErr);
        }
      } else {
        console.log('Transactions table already exists');
      }

      // ========================================
      // SYNC SYSTEM MIGRATION
      // ========================================
      console.log('Running sync system migration...');
      
      // Добавить sync поля в items
      const itemsColumns = await getAllWithRetry<TableInfo>(databaseInstance!, 'PRAGMA table_info(items);');
      const itemsColumnNames = itemsColumns.map(col => col.name);
      
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
      }
      if (!transColumnNames.includes('syncedAt')) {
        console.log('Adding syncedAt column to transactions');
        await execWithRetry(databaseInstance!, 'ALTER TABLE transactions ADD COLUMN syncedAt INTEGER;');
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
        INSERT INTO items (name, code, warehouse, numberOfBoxes, boxSizeQuantities, sizeType, itemType, row, position, side, imageUri, totalQuantity, totalValue, qrCodeType, qrCodes, needsSync, imageNeedsUpload)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
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
      ]);

      const newId = result.lastInsertRowId || 0;

      const sizeMap = getSizeQuantities(item.boxSizeQuantities);
      const sizes = Object.entries(sizeMap).map(([s, q]) => ({ 
        size: isNaN(Number(s)) ? s : Number(s), // Сохраняем как число если возможно, иначе как строку
        quantity: q as number 
      }));
      const details = JSON.stringify({ type: 'create', initialSizes: sizes, total: totalQuantity, totalValue });

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

export const getItems = async (): Promise<Item[]> => {
  return withLock(async () => {
    try {
      const db = await getDatabaseInstance();
      const result = await getAllWithRetry<Item>(db, 'SELECT * FROM items ORDER BY createdAt DESC', []);
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
 * New: getAllTransactions
 * Fetches all transactions without pagination for export.
 */
export const getAllTransactions = async (): Promise<Transaction[]> => {
  return withLock(async () => {
    try {
      const db = await getDatabaseInstance();
      const result = await getAllWithRetry<Transaction>(db, 'SELECT * FROM transactions ORDER BY timestamp DESC', []);
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
        details = JSON.stringify({ type: 'update', changes, totalAfter: totalQuantity, totalValueAfter: totalValue });
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

      const result = await runWithRetry(db, 'UPDATE items SET boxSizeQuantities = ?, totalQuantity = ?, totalValue = ? WHERE id = ?', [boxSizeQuantities, totalQuantity, totalValue, id]);

      const changed = getAffectedRows(result);
      if (typeof changed === 'number' && changed === 0) {
        throw new Error(`Update affected 0 rows for id=${id}`);
      }

      if (details) {
        await runWithRetry(db, `
          INSERT INTO transactions (action, itemId, itemName, timestamp, details, needsSync)
          VALUES (?, ?, ?, ?, ?, 1)
        `, [
          'update' as const,
          id,
          item.name,
          Math.floor(Date.now() / 1000),
          details,
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
      const details = JSON.stringify({ type: 'delete', finalSizes: sizes, total: item.totalQuantity, totalValue: item.totalValue });

      const result = await runWithRetry(db, 'DELETE FROM items WHERE id = ?', [id]);

      const changed = getAffectedRows(result);
      if (typeof changed === 'number' && changed === 0) {
        throw new Error(`Delete affected 0 rows for id=${id}`);
      }

      await runWithRetry(db, `
        INSERT INTO transactions (action, itemId, itemName, timestamp, details, needsSync)
        VALUES (?, ?, ?, ?, ?, 1)
      `, [
        'delete' as const,
        id,
        item.name,
        Math.floor(Date.now() / 1000),
        details,
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

export const addTransaction = async (transaction: Omit<Transaction, 'id'>): Promise<void> => {
  return withLock(async () => {
    const db = await getDatabaseInstance();
    try {
      await runWithRetry(db, `
        INSERT INTO transactions (action, itemId, itemName, timestamp, details, needsSync)
        VALUES (?, ?, ?, ?, ?, 1)
      `, [
        transaction.action,
        transaction.itemId,
        transaction.itemName,
        transaction.timestamp,
        transaction.details,
      ]);
      console.log('Transaction added successfully');
    } catch (error) {
      console.error('Error adding transaction:', error);
      throw error;
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
        INSERT INTO transactions (action, itemId, itemName, timestamp, details)
        VALUES (?, ?, ?, ?, ?)
      `, [
        transaction.action,
        transaction.itemId,
        transaction.itemName,
        transaction.timestamp,
        transaction.details,
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
      const sql = `SELECT * FROM transactions ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
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
      const sql = `SELECT * FROM transactions WHERE itemName LIKE ? ORDER BY timestamp ASC LIMIT ? OFFSET ?`;
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
      const sql = `SELECT * FROM transactions WHERE timestamp >= ? AND timestamp < ? ORDER BY timestamp ASC LIMIT ? OFFSET ?`;
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
      const rows = await getAllWithRetry<{ warehouse: string }>(db, 'SELECT DISTINCT warehouse FROM items ORDER BY warehouse ASC', []);
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
      SET name = ?, code = ?, warehouse = ?, numberOfBoxes = ?, row = ?, position = ?, side = ?, imageUri = ?
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
      SET qrCodeType = ?, qrCodes = ?
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
  boxIndex?: number; // Добавляем опциональное поле для индекса коробки
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

      const transaction = await getFirstWithRetry<Transaction>(db, 'SELECT * FROM transactions WHERE id = ?', [transactionId]);
      if (!transaction) {
        throw new Error('Transaction not found');
      }

      const { action, itemId, timestamp, details: transactionDetails } = transaction;

      // Find related transactions
      const related = await getAllWithRetry<Transaction>(db, `
        SELECT * FROM transactions 
        WHERE itemId = ? 
        AND action IN ('sale', 'update', 'wholesale') 
        AND ABS(timestamp - ?) < 5
      `, [itemId, timestamp]);

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
        // Восстановление обычной продажи
        const saleInfo = parsedDetails.sale || { 
          size: parsedDetails.size, 
          quantity: parsedDetails.quantity, 
          costPrice: parsedDetails.costPrice, 
          salePrice: parsedDetails.salePrice,
          previousQuantity: parsedDetails.previousQuantity,
          profit: parsedDetails.profit,
          boxIndex: parsedDetails.boxIndex 
        };
        const { size, quantity, costPrice, boxIndex } = saleInfo;

        // Возвращаем товар в оригинальную коробку если известен boxIndex
        let found = false;
        if (typeof boxIndex === 'number' && boxIndex >= 0 && boxIndex < boxSizeQuantities.length) {
          // Попытка вернуть в оригинальную коробку
          const originalBox = boxSizeQuantities[boxIndex];
          for (let j = 0; j < originalBox.length; j++) {
            const sq = originalBox[j];
            if (sq.size === size) {
              sq.quantity = (sq.quantity || 0) + quantity;
              found = true;
              break;
            }
          }
          // Если размер не найден в оригинальной коробке, добавляем его туда
          if (!found) {
            originalBox.push({ size, quantity, price: costPrice });
            found = true;
          }
        }

        // Если boxIndex не указан или не валидный, ищем по всем коробкам (начиная с первой)
        if (!found) {
          for (let i = 0; i < boxSizeQuantities.length; i++) {
            const box = boxSizeQuantities[i];
            for (let j = 0; j < box.length; j++) {
              const sq = box[j];
              if (sq.size === size) {
                sq.quantity = (sq.quantity || 0) + quantity;
                found = true;
                break;
              }
            }
            if (found) break;
          }

          if (!found) {
            if (boxSizeQuantities.length === 0) {
              boxSizeQuantities.push([]);
            }
            // Если не найден, добавляем в первую коробку (не в последнюю)
            const firstBox = boxSizeQuantities[0];
            firstBox.push({ size, quantity, price: costPrice });
          }
        }
      }

      let newTotalQuantity = 0;
      let newTotalValue = 0;
      boxSizeQuantities.forEach(box => {
        box.forEach(sq => {
          if (sq.quantity > 0) {
            newTotalQuantity += sq.quantity;
            newTotalValue += sq.quantity * (sq.price || 0);
          }
        });
      });

      const newBoxStr = JSON.stringify(boxSizeQuantities);

      await runWithRetry(db, 'UPDATE items SET boxSizeQuantities = ?, totalQuantity = ?, totalValue = ? WHERE id = ?', [newBoxStr, newTotalQuantity, newTotalValue, itemId]);

      // Delete all related transactions
      for (let tx of related) {
        await runWithRetry(db, 'DELETE FROM transactions WHERE id = ?', [tx.id]);
      }

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

export { runWithRetry, getAllWithRetry, getFirstWithRetry, execWithRetry };