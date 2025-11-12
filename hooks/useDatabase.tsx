// hooks\useDatabase.tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import {
  initDatabase,
  addItem,
  getItems,
  updateItemQuantity,
  clearDatabase,
  closeDatabase,
  deleteItem,
  getItemsPage,
  getDistinctWarehouses,
  insertItemImport,
  addTransaction,
  getTransactionsPage,
  clearTransactions,
  updateItem,
  updateItemQRCodes,
  deleteTransaction,
  searchTransactions,
  filterTransactionsByDate,
} from '../database/database';
import { Item, Transaction } from '../database/types';
import {
  exportDatabaseToZip,
  shareExportedZip,
  pickZipAndImport,
  importDatabaseFromZipUri,
} from '../database/importExport';

/**
 * Чётко типизируем результат импорта/выбора файла
 */
export type ImportResult = { imported: boolean; message?: string; itemsWithoutPrice?: number };

export interface DatabaseContextType {
  addItem: (item: Omit<Item, 'id' | 'createdAt'>) => Promise<void>;
  getItems: () => Promise<Item[]>;
  getItemsPage: (limit: number, offset: number, searchTerm?: string, warehouse?: string, itemType?: 'all' | 'обувь' | 'одежда') => Promise<{ items: Item[]; hasMore: boolean }>;
  getDistinctWarehouses: () => Promise<string[]>;
  updateItemQuantity: (id: number, boxSizeQuantities: string, totalQuantity: number, totalValue: number) => Promise<void>;
  updateItem: (item: Item) => Promise<void>;
  updateItemQRCodes: (id: number, qrCodeType: string, qrCodes: string | null) => Promise<void>;
  deleteItem: (id: number) => Promise<void>;
  clearDatabase: () => Promise<void>;
  closeDatabase: () => Promise<void>;

  // transactions
  addTransaction: (transaction: Omit<Transaction, 'id'>) => Promise<void>;
  getTransactionsPage: (limit: number, offset: number) => Promise<{ transactions: Transaction[]; hasMore: boolean }>;
  searchTransactions: (searchQuery: string, limit: number, offset: number) => Promise<{ transactions: Transaction[]; hasMore: boolean }>;
  filterTransactionsByDate: (startTimestamp: number, endTimestamp: number, limit: number, offset: number) => Promise<{ transactions: Transaction[]; hasMore: boolean }>;
  clearTransactions: () => Promise<void>;
  deleteTransaction: (id: number) => Promise<{ success: boolean; message?: string }>;

  // export/import
  exportDatabase: () => Promise<string>; // возвращает путь к zip-файлу в FileSystem.documentDirectory
  shareExportedZip: (zipPath: string) => Promise<void>;
  pickAndImportZip: () => Promise<ImportResult>;
  importZipFromUri: (uri: string) => Promise<void>;
}

const DatabaseContext = createContext<DatabaseContextType | null>(null);

export const DatabaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [dbInitialized, setDbInitialized] = useState(false);
  const [initializationError, setInitializationError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const initializeDb = async () => {
      try {
        console.log('Initializing database...');
        await initDatabase();
        if (!cancelled) {
          setDbInitialized(true);
          setInitializationError(null);
          console.log('Database initialized successfully');
        }
      } catch (error) {
        console.error('Failed to initialize database:', error);
        if (!cancelled) {
          setInitializationError(error instanceof Error ? error.message : 'Unknown error');
          setTimeout(() => {
            initializeDb();
          }, 3000);
        }
      }
    };

    initializeDb();

    return () => {
      cancelled = true;
      closeDatabase();
    };
  }, []);

  const databaseActions: DatabaseContextType = {
    addItem: async (item) => {
      if (!dbInitialized) throw new Error('Database not initialized');
      try {
        console.log('addItem: writing item to DB');
        await addItem(item);
      } catch (error) {
        console.error('Error in addItem:', error);
        throw error;
      }
    },

    getItems: async () => {
      if (!dbInitialized) throw new Error('Database not initialized');
      try {
        return await getItems();
      } catch (error) {
        console.error('Error in getItems:', error);
        throw error;
      }
    },

    getItemsPage: async (limit, offset, searchTerm = '', warehouse = 'Все', itemType = 'all') => {
      if (!dbInitialized) throw new Error('Database not initialized');
      try {
        return await getItemsPage(limit, offset, searchTerm, warehouse, itemType);
      } catch (error) {
        console.error('Error in getItemsPage:', error);
        throw error;
      }
    },

    getDistinctWarehouses: async () => {
      if (!dbInitialized) throw new Error('Database not initialized');
      try {
        return await getDistinctWarehouses();
      } catch (error) {
        console.error('Error in getDistinctWarehouses:', error);
        throw error;
      }
    },

    updateItemQuantity: async (id, boxSizeQuantities, totalQuantity, totalValue) => {
      if (!dbInitialized) throw new Error('Database not initialized');
      try {
        await updateItemQuantity(id, boxSizeQuantities, totalQuantity, totalValue);
      } catch (error) {
        console.error('Error in updateItemQuantity:', error);
        throw error;
      }
    },

    updateItem: async (item) => {
      if (!dbInitialized) throw new Error('Database not initialized');
      try {
        await updateItem(item);
      } catch (error) {
        console.error('Error in updateItem:', error);
        throw error;
      }
    },

    updateItemQRCodes: async (id, qrCodeType, qrCodes) => {
      if (!dbInitialized) throw new Error('Database not initialized');
      try {
        await updateItemQRCodes(id, qrCodeType, qrCodes);
      } catch (error) {
        console.error('Error in updateItemQRCodes:', error);
        throw error;
      }
    },

    deleteItem: async (id) => {
      if (!dbInitialized) throw new Error('Database not initialized');
      try {
        await deleteItem(id);
      } catch (error) {
        console.error('Error in deleteItem:', error);
        throw error;
      }
    },

    clearDatabase: async () => {
      if (!dbInitialized) throw new Error('Database not initialized');
      try {
        await clearDatabase();
      } catch (error) {
        console.error('Error in clearDatabase:', error);
        throw error;
      }
    },

    closeDatabase: async () => {
      try {
        await closeDatabase();
      } catch (error) {
        console.error('Error in closeDatabase:', error);
        throw error;
      }
    },

    // transactions
    addTransaction: async (transaction) => {
      if (!dbInitialized) throw new Error('Database not initialized');
      try {
        await addTransaction(transaction);
      } catch (error) {
        console.error('Error in addTransaction:', error);
        throw error;
      }
    },

    getTransactionsPage: async (limit, offset) => {
      if (!dbInitialized) throw new Error('Database not initialized');
      try {
        return await getTransactionsPage(limit, offset);
      } catch (error) {
        console.error('Error in getTransactionsPage:', error);
        throw error;
      }
    },

    searchTransactions: async (searchQuery, limit, offset) => {
      if (!dbInitialized) throw new Error('Database not initialized');
      try {
        return await searchTransactions(searchQuery, limit, offset);
      } catch (error) {
        console.error('Error in searchTransactions:', error);
        throw error;
      }
    },

    filterTransactionsByDate: async (startTimestamp, endTimestamp, limit, offset) => {
      if (!dbInitialized) throw new Error('Database not initialized');
      try {
        return await filterTransactionsByDate(startTimestamp, endTimestamp, limit, offset);
      } catch (error) {
        console.error('Error in filterTransactionsByDate:', error);
        throw error;
      }
    },

    clearTransactions: async () => {
      if (!dbInitialized) throw new Error('Database not initialized');
      try {
        await clearTransactions();
      } catch (error) {
        console.error('Error in clearTransactions:', error);
        throw error;
      }
    },

    deleteTransaction: async (id) => {
      if (!dbInitialized) throw new Error('Database not initialized');
      try {
        return await deleteTransaction(id);
      } catch (error) {
        console.error('Error in deleteTransaction:', error);
        throw error;
      }
    },

    // export/import
    exportDatabase: async () => {
      if (!dbInitialized) throw new Error('Database not initialized');
      try {
        console.log('exportDatabase: start');
        const zipPath = await exportDatabaseToZip();
        console.log('exportDatabase: finished, zipPath=', zipPath);
        return zipPath;
      } catch (e) {
        console.error('exportDatabase error:', e);
        throw e;
      }
    },

    shareExportedZip: async (zipPath: string) => {
      try {
        console.log('shareExportedZip: share', zipPath);
        await shareExportedZip(zipPath);
      } catch (e) {
        console.error('shareExportedZip error:', e);
        throw e;
      }
    },

    /**
     * Возвращаем явно ImportResult.
     * Здесь мы мы просто оборачиваем pickZipAndImport (из importExport.ts), 
     * гарантирую корректный тип результата.
     */
    pickAndImportZip: async (): Promise<ImportResult> => {
      if (!dbInitialized) throw new Error('Database not initialized');
      try {
        console.log('pickAndImportZip: calling picker...');
        const res = await pickZipAndImport(); // pickZipAndImport defined in importExport.ts
        // Приводим/валидация результата
        if (res && typeof res === 'object' && 'imported' in (res as any)) {
          return res as ImportResult;
        } else {
          // Небольшая защита — если вернулся не тот формат, вернем объект с сообщением
          return { imported: false, message: typeof res === 'string' ? res : 'invalid_result' };
        }
      } catch (e: any) {
        console.error('pickAndImportZip error:', e);
        return { imported: false, message: String(e?.message || e) };
      }
    },

    importZipFromUri: async (uri: string) => {
      if (!dbInitialized) throw new Error('Database not initialized');
      try {
        console.log('importZipFromUri: start for', uri);
        await importDatabaseFromZipUri(uri);
        console.log('importZipFromUri: finished');
      } catch (e) {
        console.error('importZipFromUri error:', e);
        throw e;
      }
    },
  };

  if (!dbInitialized && initializationError) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Ошибка инициализации базы данных: {initializationError}</Text>
        <Text>Повторная попытка...</Text>
      </View>
    );
  }

  if (!dbInitialized) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Инициализация базы данных...</Text>
      </View>
    );
  }

  return (
    <DatabaseContext.Provider value={databaseActions}>
      {children}
    </DatabaseContext.Provider>
  );
};

export const useDatabase = (): DatabaseContextType => {
  const context = useContext(DatabaseContext);
  if (!context) {
    throw new Error('useDatabase must be used within DatabaseProvider');
  }
  return context;
};