import AuthService from './AuthService';
import ImageService from './ImageService';
import * as FileSystem from 'expo-file-system';
import { getDatabaseInstance, runWithRetry, getAllWithRetry, getFirstWithRetry, clearDatabase, markLegacyDataForSync, execWithRetry } from '../../database/database';

interface SyncItem {
  localId?: number;
  name: string;
  code: string;
  warehouse: string;
  numberOfBoxes: number;
  boxSizeQuantities: string;
  sizeType: string;
  itemType: string;
  row?: string;
  position?: string;
  side?: string;
  imageUrl?: string;
  totalQuantity: number;
  totalValue: number;
  qrCodeType: string;
  qrCodes?: string;
  createdAt?: number;
  uuid?: string;
}

interface SyncTransaction {
  localId?: number;
  itemId?: number;
  action: string;
  itemName: string;
  timestamp: number;
  details?: string;
  uuid?: string;
}

interface SyncClient {
  localId?: number;
  serverId?: number;
  uuid?: string;
  name: string;
  phone?: string;
  address?: string;
  notes?: string;
  isDeleted?: boolean;
}

/**
 * Прогресс синхронизации для UI
 */
export interface SyncProgress {
  phase: 'uploading_images' | 'syncing_items' | 'syncing_transactions' | 'syncing_clients' | 'complete' | 'error';
  current: number;
  total: number;
  message: string;
}

class SyncService {
  // ============================================
  // АССИСТЕНТ
  // ============================================

  // Размер batch для синхронизации
  private readonly BATCH_SIZE = 10;
  // Количество попыток для каждого batch
  private readonly BATCH_RETRY_COUNT = 3;
  // Задержка между попытками (ms)
  private readonly BATCH_RETRY_DELAY = 1000;

  // Callback для прогресса sync
  private onSyncProgress: ((progress: SyncProgress) => void) | null = null;

  // ===== MUTEX для предотвращения параллельных синхронизаций =====
  private isSyncing = false;
  private syncQueue: (() => Promise<void>)[] = [];

  /**
   * Проверить идёт ли синхронизация
   */
  isSyncInProgress(): boolean {
    return this.isSyncing;
  }

  /**
   * Выполнить операцию синхронизации с мьютексом
   * Если уже идёт синхронизация - пропускаем
   */
  private async withSyncLock<T>(operation: () => Promise<T>): Promise<T | null> {
    if (this.isSyncing) {
      console.log('⏳ Sync already in progress, skipping...');
      return null;
    }

    this.isSyncing = true;
    try {
      return await operation();
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Установить callback для отслеживания прогресса синхронизации
   */
  setSyncProgressCallback(callback: ((progress: SyncProgress) => void) | null): void {
    this.onSyncProgress = callback;
  }

  /**
   * Разбить массив на chunks
   */
  private chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Отправить batch с retry логикой
   * Возвращает response.data или null если все попытки неудачны
   */
  private async sendBatchWithRetry(
    api: any,
    endpoint: string,
    payload: any,
    accessToken: string,
    batchIndex: number,
    totalBatches: number
  ): Promise<any | null> {
    for (let attempt = 1; attempt <= this.BATCH_RETRY_COUNT; attempt++) {
      try {
        const response = await api.post(endpoint, payload, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        return response.data;
      } catch (error: any) {
        console.warn(`⚠️ Batch ${batchIndex + 1}/${totalBatches} attempt ${attempt}/${this.BATCH_RETRY_COUNT} failed:`, error.message);

        if (attempt < this.BATCH_RETRY_COUNT) {
          // Ждём перед следующей попыткой (exponential backoff)
          const delay = this.BATCH_RETRY_DELAY * attempt;
          console.log(`   Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          console.error(`❌ Batch ${batchIndex + 1}/${totalBatches} failed after ${this.BATCH_RETRY_COUNT} attempts`);
          return null; // Все попытки исчерпаны
        }
      }
    }
    return null;
  }

  /**
   * Диагностика изображений для загрузки
   * Проверяет какие изображения существуют, а какие повреждены/отсутствуют
   */
  async diagnosePendingImages(): Promise<{
    total: number;
    ready: number;
    missing: number;
    missingItems: { id: number; name: string; imageUri: string }[];
  }> {
    const db = await getDatabaseInstance();

    const itemsWithImages = await getAllWithRetry<any>(
      db,
      'SELECT id, name, imageUri FROM items WHERE needsSync=1 AND imageNeedsUpload=1 AND imageUri IS NOT NULL'
    );

    let ready = 0;
    let missing = 0;
    const missingItems: { id: number; name: string; imageUri: string }[] = [];

    for (const item of itemsWithImages) {
      const fileInfo = await FileSystem.getInfoAsync(item.imageUri);
      if (fileInfo.exists) {
        ready++;
      } else {
        missing++;
        missingItems.push({
          id: item.id,
          name: item.name,
          imageUri: item.imageUri,
        });
      }
    }

    const result = {
      total: itemsWithImages.length,
      ready,
      missing,
      missingItems,
    };

    console.log(`📊 Image diagnostics: ${ready} ready, ${missing} missing out of ${itemsWithImages.length} total`);
    if (missingItems.length > 0) {
      console.log(`❌ Missing images for items:`, missingItems.map(i => `${i.id}: ${i.name}`).join(', '));
    }

    return result;
  }

  /**
   * Push изменений от ассистента на сервер (с защитой от параллельного выполнения)
   */
  async assistantPush(): Promise<void> {
    const result = await this.withSyncLock(() => this._assistantPushInternal());
    if (result === null) {
      console.log('⏳ assistantPush skipped - sync already in progress');
    }
  }

  /**
   * Push изменений от ассистента на сервер (с пакетной обработкой) - внутренний метод
   */
  private async _assistantPushInternal(): Promise<void> {
    const accessToken = await AuthService.getAccessToken();
    if (!accessToken) {
      console.warn('No access token, skipping sync');
      return;
    }

    const db = await getDatabaseInstance();
    const api = AuthService.getApiInstance();

    try {
      console.log('🔄 Starting assistant push sync (batch mode)...');

      // Каталоги синхронизируются ДО товаров — товары ссылаются на itemType (имя каталога).
      await this.syncCatalogs();
      // Доп. параметры товара (цвет, материал и т.д.) — пуш/пулл по itemUuid
      await this.syncItemAttributes();
      // Поставщики, поставки и оплаты
      await this.syncSuppliers();

      // 0. МИГРАЦИЯ: Пометить старые данные для синхронизации
      // Это нужно для устройств, где sync колонки уже существовали, но данные не были помечены
      const legacyResult = await markLegacyDataForSync();
      if (legacyResult.itemsMarked > 0 || legacyResult.transactionsMarked > 0) {
        console.log(`📋 Legacy data marked for sync: ${legacyResult.itemsMarked} items, ${legacyResult.transactionsMarked} transactions`);
        if (this.onSyncProgress) {
          this.onSyncProgress({
            phase: 'syncing_items',
            current: 0,
            total: 1,
            message: `Найдено ${legacyResult.itemsMarked} старых товаров для синхронизации...`,
          });
        }
      }

      // 1. Загрузить изображения для items с imageNeedsUpload=1
      const itemsWithImages = await getAllWithRetry<any>(
        db,
        'SELECT * FROM items WHERE needsSync=1 AND imageNeedsUpload=1'
      );

      console.log(`📤 Found ${itemsWithImages.length} items with images to upload`);

      // Обновить прогресс: загрузка изображений
      if (this.onSyncProgress && itemsWithImages.length > 0) {
        this.onSyncProgress({
          phase: 'uploading_images',
          current: 0,
          total: itemsWithImages.length,
          message: `Загрузка изображений... 0/${itemsWithImages.length}`,
        });
      }

      let successfulImageUploads = 0;
      let failedImageUploads = 0;

      for (let i = 0; i < itemsWithImages.length; i++) {
        const item = itemsWithImages[i];
        if (item.imageUri) {
          // Проверить существование файла ПЕРЕД попыткой загрузки
          const fileInfo = await FileSystem.getInfoAsync(item.imageUri);
          if (!fileInfo.exists) {
            console.warn(`⚠️ Image file not found for item ${item.id} (${item.name}), skipping upload`);
            // Файл не существует - пропускаем, НО НЕ очищаем imageUri (возможно файл появится позже)
            failedImageUploads++;
            // Обновить прогресс и перейти к следующему item
            if (this.onSyncProgress) {
              this.onSyncProgress({
                phase: 'uploading_images',
                current: i + 1,
                total: itemsWithImages.length,
                message: `Загрузка изображений... ${i + 1}/${itemsWithImages.length} (пропущено: ${failedImageUploads})`,
              });
            }
            continue;
          }

          let uploadSuccess = false;

          // Retry логика для каждого изображения (3 попытки)
          for (let attempt = 1; attempt <= this.BATCH_RETRY_COUNT; attempt++) {
            try {
              const imageUrl = await ImageService.uploadImage(item.imageUri, accessToken);
              await runWithRetry(
                db,
                'UPDATE items SET serverImageUrl=?, imageNeedsUpload=0 WHERE id=?',
                [imageUrl, item.id]
              );
              console.log(`✅ Uploaded image for item ${item.id} (attempt ${attempt})`);
              uploadSuccess = true;
              successfulImageUploads++;
              break; // Успех - выходим из retry цикла
            } catch (error: any) {
              const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
              console.warn(`⚠️ Image upload attempt ${attempt}/${this.BATCH_RETRY_COUNT} failed for item ${item.id}:`, errorMessage);

              if (attempt < this.BATCH_RETRY_COUNT) {
                // Ждём перед следующей попыткой (exponential backoff)
                const delay = this.BATCH_RETRY_DELAY * attempt;
                console.log(`   Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
              } else {
                // Все попытки исчерпаны - логируем ошибку, но НЕ прерываем sync
                console.error(`❌ Failed to upload image for item ${item.id} after ${this.BATCH_RETRY_COUNT} attempts:`, {
                  message: error.message,
                  status: error.response?.status,
                  data: error.response?.data,
                });
                failedImageUploads++;
                // imageNeedsUpload остаётся = 1, будет отправлено при следующем sync
              }
            }
          }
        }

        // Обновить прогресс загрузки изображений
        if (this.onSyncProgress) {
          this.onSyncProgress({
            phase: 'uploading_images',
            current: i + 1,
            total: itemsWithImages.length,
            message: `Загрузка изображений... ${i + 1}/${itemsWithImages.length}${failedImageUploads > 0 ? ` (ошибок: ${failedImageUploads})` : ''}`,
          });
        }
      }

      // Логируем результат загрузки изображений (но НЕ прерываем sync)
      if (failedImageUploads > 0) {
        console.warn(`⚠️ ${failedImageUploads} image(s) failed to upload, they will be retried on next sync`);
      }
      if (successfulImageUploads > 0) {
        console.log(`✅ Successfully uploaded ${successfulImageUploads} image(s)`);
      }

      // 2. Получить items, transactions и clients для синхронизации
      const allItems = await getAllWithRetry<any>(db, 'SELECT * FROM items WHERE needsSync=1');
      const allTransactions = await getAllWithRetry<any>(db, 'SELECT * FROM transactions WHERE needsSync=1');
      const allClientsToSync = await getAllWithRetry<any>(db, 'SELECT * FROM clients WHERE needsSync=1');

      // Логируем общее количество клиентов в локальной БД
      const totalClientsInDb = await getFirstWithRetry<{ count: number }>(db, 'SELECT COUNT(*) as count FROM clients');
      console.log(`\n📊 ============ LOCAL DATABASE STATS ============`);
      console.log(`📦 Total items in local DB: ${(await getFirstWithRetry<{ count: number }>(db, 'SELECT COUNT(*) as count FROM items'))?.count || 0}`);
      console.log(`📦 Items needing sync: ${allItems.length}`);
      console.log(`📋 Total transactions in local DB: ${(await getFirstWithRetry<{ count: number }>(db, 'SELECT COUNT(*) as count FROM transactions'))?.count || 0}`);
      console.log(`📋 Transactions needing sync: ${allTransactions.length}`);
      console.log(`👥 Total clients in local DB: ${totalClientsInDb?.count || 0}`);
      console.log(`👥 Clients needing sync: ${allClientsToSync.length}`);

      if (allClientsToSync.length > 0) {
        console.log(`📋 Clients to sync details:`, allClientsToSync.map((c: any) => ({
          id: c.id,
          name: c.name,
          serverId: c.serverId,
          needsSync: c.needsSync,
          uuid: c.uuid
        })));
      }

      if (allItems.length === 0 && allTransactions.length === 0 && allClientsToSync.length === 0) {
        console.log('✅ Nothing to sync (no items, transactions, or clients with needsSync=1)');
        if (this.onSyncProgress) {
          this.onSyncProgress({ phase: 'complete', current: 0, total: 0, message: 'Нет данных для синхронизации' });
        }
        return;
      }

      console.log(`📤 Syncing ${allItems.length} items, ${allTransactions.length} transactions, ${allClientsToSync.length} clients (batch size: ${this.BATCH_SIZE})`);

      // 3. Разбить на batches
      const itemBatches = this.chunk(allItems, this.BATCH_SIZE);
      const transactionBatches = this.chunk(allTransactions, this.BATCH_SIZE);
      const totalBatches = itemBatches.length + transactionBatches.length;
      let completedBatches = 0;
      let failedItemsCount = 0;
      let failedTransactionsCount = 0;

      // 4. Отправить items batch по batch
      for (let i = 0; i < itemBatches.length; i++) {
        const batch = itemBatches[i];

        if (this.onSyncProgress) {
          this.onSyncProgress({
            phase: 'syncing_items',
            current: completedBatches,
            total: totalBatches,
            message: `Синхронизация товаров... ${i + 1}/${itemBatches.length} (${batch.length} шт.)`,
          });
        }

        const payload = {
          items: batch.map((item: any) => ({
            localId: item.id,
            serverId: item.serverId,
            name: item.name,
            code: item.code,
            warehouse: item.warehouse,
            numberOfBoxes: item.numberOfBoxes,
            boxSizeQuantities: item.boxSizeQuantities,
            sizeType: item.sizeType,
            itemType: item.itemType,
            row: item.row,
            position: item.position,
            side: item.side,
            imageUrl: item.serverImageUrl,
            totalQuantity: item.totalQuantity,
            totalValue: item.totalValue,
            qrCodeType: item.qrCodeType,
            qrCodes: item.qrCodes,
            priceUnit: item.priceUnit,
            createdAt: item.createdAt,
            version: item.version,
            isDeleted: item.isDeleted === 1,
            uuid: item.uuid,
          })),
          transactions: [], // Items только в этом batch
        };

        const responseData = await this.sendBatchWithRetry(
          api,
          '/sync/assistant/push',
          payload,
          accessToken,
          i,
          itemBatches.length
        );

        if (responseData) {
          // Обновить serverId и needsSync для items из этого batch
          console.log(`📥 Received ${responseData.items?.length || 0} items in response`);
          for (const item of responseData.items || []) {
            console.log(`   Setting serverId=${item.serverId} for localId=${item.localId}`);
            await runWithRetry(
              db,
              'UPDATE items SET serverId=?, needsSync=0, syncedAt=? WHERE id=?',
              [item.serverId, Date.now(), item.localId]
            );
          }
          console.log(`✅ Items batch ${i + 1}/${itemBatches.length} synced (${batch.length} items)`);
        } else {
          // Batch не удалось отправить - items остаются needsSync=1
          failedItemsCount += batch.length;
          console.warn(`⚠️ Items batch ${i + 1}/${itemBatches.length} failed (${batch.length} items will retry next sync)`);
        }

        completedBatches++;
      }

      // 5. Отправить transactions batch по batch
      for (let i = 0; i < transactionBatches.length; i++) {
        const batch = transactionBatches[i];

        if (this.onSyncProgress) {
          this.onSyncProgress({
            phase: 'syncing_transactions',
            current: completedBatches,
            total: totalBatches,
            message: `Синхронизация истории... ${i + 1}/${transactionBatches.length} (${batch.length} шт.)`,
          });
        }

        // Для каждой транзакции получаем itemServerId из items
        const transactionsWithServerId = await Promise.all(
          batch.map(async (tx: any) => {
            let itemServerId: number | null = null;
            if (tx.itemId) {
              const item = await getFirstWithRetry<{ serverId: number }>(
                db,
                'SELECT serverId FROM items WHERE id = ?',
                [tx.itemId]
              );
              if (item?.serverId) {
                itemServerId = item.serverId;
              }
            }
            return {
              localId: tx.id,
              serverId: tx.serverId,
              itemId: tx.itemId,
              itemServerId: itemServerId, // Добавляем серверный ID товара
              itemUuid: tx.itemUuid,      // Добавляем UUID товара (NEW)
              action: tx.action,
              itemName: tx.itemName,
              timestamp: tx.timestamp,
              details: tx.details,
              isDeleted: tx.isDeleted === 1,
              uuid: tx.uuid,
              currency: tx.currency || undefined,
            };
          })
        );

        const payload = {
          items: [], // Transactions только в этом batch
          transactions: transactionsWithServerId,
        };

        const responseData = await this.sendBatchWithRetry(
          api,
          '/sync/assistant/push',
          payload,
          accessToken,
          i,
          transactionBatches.length
        );

        if (responseData) {
          // Обновить serverId и needsSync для transactions из этого batch
          for (const tx of responseData.transactions || []) {
            await runWithRetry(
              db,
              'UPDATE transactions SET serverId=?, needsSync=0, syncedAt=? WHERE id=?',
              [tx.serverId, Date.now(), tx.localId]
            );
          }
          console.log(`✅ Transactions batch ${i + 1}/${transactionBatches.length} synced (${batch.length} transactions)`);
        } else {
          // Batch не удалось отправить - transactions остаются needsSync=1
          failedTransactionsCount += batch.length;
          console.warn(`⚠️ Transactions batch ${i + 1}/${transactionBatches.length} failed (${batch.length} transactions will retry next sync)`);
        }

        completedBatches++;
      }

      // 6. Отправить clients batch по batch
      const allClients = await getAllWithRetry<any>(db, 'SELECT * FROM clients WHERE needsSync=1');
      console.log(`\n👥 ============ CLIENTS PUSH ============`);
      console.log(`📤 Found ${allClients.length} clients with needsSync=1`);

      if (allClients.length > 0) {
        console.log(`📋 Clients to sync:`, allClients.map((c: any) => ({ id: c.id, name: c.name, serverId: c.serverId, uuid: c.uuid })));
      }

      const clientBatches = this.chunk(allClients, this.BATCH_SIZE);
      let failedClientsCount = 0;

      for (let i = 0; i < clientBatches.length; i++) {
        const batch = clientBatches[i];

        if (this.onSyncProgress) {
          this.onSyncProgress({
            phase: 'syncing_clients',
            current: completedBatches,
            total: totalBatches + clientBatches.length,
            message: `Синхронизация клиентов... ${i + 1}/${clientBatches.length}`,
          });
        }

        const payload = {
          items: [],
          transactions: [],
          clients: batch.map((client: any) => ({
            localId: client.id,
            serverId: client.serverId,
            uuid: client.uuid,
            name: client.name,
            phone: client.phone,
            address: client.address,
            notes: client.notes,
            birthday: client.birthday,
            isDeleted: client.isDeleted === 1 || client.isDeleted === true,
          })),
        };
        console.log(`📦 Sending client batch ${i + 1}/${clientBatches.length}:`, JSON.stringify(payload.clients, null, 2));

        const responseData = await this.sendBatchWithRetry(
          api,
          '/sync/assistant/push',
          payload,
          accessToken,
          i,
          clientBatches.length
        );

        console.log(`📥 Server response for clients batch:`, JSON.stringify(responseData?.clients || [], null, 2));

        if (responseData) {
          for (const client of responseData.clients || []) {
            console.log(`✅ Client synced: localId=${client.localId} -> serverId=${client.serverId}`);
            await runWithRetry(
              db,
              'UPDATE clients SET serverId=?, needsSync=0, updatedAt=? WHERE id=?',
              [client.serverId, Date.now(), client.localId]
            );
          }
          console.log(`✅ Clients batch ${i + 1}/${clientBatches.length} synced (${responseData.clients?.length || 0} clients)`);
        } else {
          console.log(`❌ Clients batch ${i + 1}/${clientBatches.length} failed`);
          failedClientsCount += batch.length;
        }
      }

      // Завершение - формируем сообщение с учётом ошибок
      const syncedItems = allItems.length - failedItemsCount;
      const syncedTransactions = allTransactions.length - failedTransactionsCount;
      const syncedClients = allClients.length - failedClientsCount;
      let completionMessage = `Синхронизировано: ${syncedItems} товаров, ${syncedTransactions} записей, ${syncedClients} клиентов`;

      if (failedItemsCount > 0 || failedTransactionsCount > 0 || failedClientsCount > 0) {
        completionMessage += ` (ошибки: ${failedItemsCount + failedTransactionsCount + failedClientsCount})`;
      }

      // Показать прогресс завершения
      if (this.onSyncProgress) {
        this.onSyncProgress({
          phase: 'complete',
          current: totalBatches + clientBatches.length,
          total: totalBatches + clientBatches.length,
          message: completionMessage,
        });
      }

      console.log('✅ Assistant push completed successfully (batch mode)');
    } catch (error: any) {
      console.error('❌ Assistant push failed:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
      });
      if (this.onSyncProgress) {
        this.onSyncProgress({
          phase: 'error',
          current: 0,
          total: 0,
          message: error.message || 'Ошибка синхронизации',
        });
      }
      throw error;
    }
  }

  /**
   * Pull изменений с сервера для ассистента (с защитой от параллельного выполнения)
   */
  async assistantPull(): Promise<void> {
    const result = await this.withSyncLock(() => this._assistantPullInternal());
    if (result === null) {
      console.log('⏳ assistantPull skipped - sync already in progress');
    }
  }

  /**
   * Pull изменений с сервера для ассистента - внутренний метод с пагинацией
   */
  private async _assistantPullInternal(): Promise<void> {
    const accessToken = await AuthService.getAccessToken();
    if (!accessToken) {
      console.warn('No access token, skipping sync');
      return;
    }

    const db = await getDatabaseInstance();
    const api = AuthService.getApiInstance();

    try {
      console.log('🔄 Starting assistant pull sync (batch mode)...');

      // Каталоги/доп. параметры/поставщики — пуш+пулл здесь, чтобы голый pull
      // (без предшествующего push) тоже подтягивал новые каталоги с сервера.
      // Раньше syncCatalogs дёргался только из _assistantPushInternal, и если
      // ассистент жал sync без локальных изменений, новые каталоги других устройств
      // не появлялись.
      await this.syncCatalogs();
      await this.syncItemAttributes();
      await this.syncSuppliers();

      const lastSyncAt = await this.getLastSyncTimestamp();
      const PULL_BATCH_SIZE = 10;

      // Первый запрос для получения метаданных и определения isFullSync
      const initialResponse = await api.get('/sync/assistant/pull', {
        params: {
          lastSyncAt: lastSyncAt ? new Date(lastSyncAt).toISOString() : undefined,
          type: 'items',
          limit: 1,
          cursor: 0,
        },
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const { isFullSync = false, totalItemsCount = 0, totalTransactionsCount = 0 } = initialResponse.data;

      console.log(`📊 Full sync: ${isFullSync}, Total items: ${totalItemsCount}, Total transactions: ${totalTransactionsCount}`);

      // Если полная синхронизация - очистить локальные данные
      if (isFullSync) {
        console.log('🗑️ Full sync - clearing local data...');
        if (this.onSyncProgress) {
          this.onSyncProgress({
            phase: 'syncing_items',
            current: 0,
            total: totalItemsCount + totalTransactionsCount,
            message: 'Подготовка к синхронизации...',
          });
        }
        try {
          await execWithRetry(db, 'BEGIN TRANSACTION;');
          await runWithRetry(db, 'DELETE FROM items WHERE serverId IS NOT NULL');
          await runWithRetry(db, 'DELETE FROM transactions WHERE serverId IS NOT NULL');
          await execWithRetry(db, 'COMMIT;');
        } catch (clearError: any) {
          console.error('❌ Error clearing local data, rolling back:', clearError.message);
          try {
            await execWithRetry(db, 'ROLLBACK;');
          } catch (rbErr) {
            console.warn('Rollback failed (ignored):', rbErr);
          }
          throw clearError;
        }
      }

      let processedItems = 0;
      let processedTransactions = 0;
      const totalCount = totalItemsCount + totalTransactionsCount;

      // === ЗАГРУЗКА ITEMS ПАРТИЯМИ ===
      let itemsCursor = 0;
      let itemsHasMore = true;

      while (itemsHasMore) {
        if (this.onSyncProgress) {
          this.onSyncProgress({
            phase: 'syncing_items',
            current: processedItems,
            total: totalCount,
            message: `Загрузка товаров... ${processedItems}/${totalItemsCount}`,
          });
        }

        const response = await api.get('/sync/assistant/pull', {
          params: {
            lastSyncAt: lastSyncAt ? new Date(lastSyncAt).toISOString() : undefined,
            type: 'items',
            limit: PULL_BATCH_SIZE,
            cursor: itemsCursor,
          },
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        const { items = [], itemsNextCursor, hasMore } = response.data;

        console.log(`📥 Received ${items.length} items (cursor: ${itemsCursor}, hasMore: ${hasMore})`);

        // Применить items и скачать изображения
        let failedItems = 0;
        for (const item of items) {
          try {
            if (item.isDeleted) {
              console.log(`🗑️ Item ${item.id} is deleted on server, removing locally`);
              await runWithRetry(db, 'DELETE FROM items WHERE serverId=?', [item.id]);
            } else {
              let localImageUri = null;

              if (item.imageUrl) {
                try {
                  localImageUri = await ImageService.downloadImage(item.imageUrl, accessToken);
                } catch (error: any) {
                  console.error(`❌ Failed to download image for item ${item.id}:`, error.message);
                }
              }

              await this.upsertItem({
                ...item,
                imageUri: localImageUri,
                serverImageUrl: item.imageUrl,
              });
            }
            processedItems++;
          } catch (upsertError: any) {
            failedItems++;
            console.error(`❌ Failed to upsert item ${item.id} (${item.name}):`, upsertError.message);
            // Продолжаем с остальными items вместо остановки всего sync
          }
        }

        if (failedItems > 0) {
          console.warn(`⚠️ ${failedItems} items failed to upsert in this batch`);
        }

        itemsCursor = itemsNextCursor || 0;
        itemsHasMore = hasMore && items.length > 0;
      }

      console.log(`✅ Items sync completed: ${processedItems} items`);

      // === ЗАГРУЗКА TRANSACTIONS ПАРТИЯМИ ===
      let transactionsCursor = 0;
      let transactionsHasMore = true;

      while (transactionsHasMore) {
        if (this.onSyncProgress) {
          this.onSyncProgress({
            phase: 'syncing_transactions',
            current: processedItems + processedTransactions,
            total: totalCount,
            message: `Загрузка истории... ${processedTransactions}/${totalTransactionsCount}`,
          });
        }

        const response = await api.get('/sync/assistant/pull', {
          params: {
            lastSyncAt: lastSyncAt ? new Date(lastSyncAt).toISOString() : undefined,
            type: 'transactions',
            limit: PULL_BATCH_SIZE,
            cursor: transactionsCursor,
          },
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        const { transactions = [], transactionsNextCursor, hasMore, approvedActions = [] } = response.data;

        console.log(`📥 Received ${transactions.length} transactions (cursor: ${transactionsCursor}, hasMore: ${hasMore})`);

        // Применить transactions
        for (const tx of transactions) {
          if (tx.isDeleted) {
            console.log(`🗑️ Transaction ${tx.id} is deleted on server, removing locally`);
            await runWithRetry(db, 'DELETE FROM transactions WHERE serverId=?', [tx.id]);
          } else {
            await this.upsertTransaction(tx);
          }
          processedTransactions++;
        }

        // Обработать одобренные действия (только в первом запросе transactions)
        if (transactionsCursor === 0 && approvedActions.length > 0) {
          for (const action of approvedActions) {
            await this.handleApprovedAction(action);
          }
        }

        transactionsCursor = transactionsNextCursor || 0;
        transactionsHasMore = hasMore && transactions.length > 0;
      }

      console.log(`✅ Transactions sync completed: ${processedTransactions} transactions`);

      // === ЗАГРУЗКА CLIENTS ПАРТИЯМИ ===
      let clientsCursor = 0;
      let clientsHasMore = true;
      let processedClients = 0;

      while (clientsHasMore) {
        if (this.onSyncProgress) {
          this.onSyncProgress({
            phase: 'syncing_clients',
            current: processedItems + processedTransactions + processedClients,
            total: totalCount,
            message: `Загрузка клиентов...`,
          });
        }

        const response = await api.get('/sync/assistant/pull', {
          params: {
            lastSyncAt: lastSyncAt ? new Date(lastSyncAt).toISOString() : undefined,
            type: 'clients',
            limit: PULL_BATCH_SIZE,
            cursor: clientsCursor,
          },
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        const { clients = [], clientsNextCursor, hasMore } = response.data;

        console.log(`📥 Received ${clients.length} clients (cursor: ${clientsCursor}, hasMore: ${hasMore})`);

        for (const client of clients) {
          if (client.isDeleted) {
            await runWithRetry(db, 'DELETE FROM clients WHERE serverId=?', [client.id]);
          } else {
            await this.upsertClient(client);
          }
          processedClients++;
        }

        clientsCursor = clientsNextCursor || 0;
        clientsHasMore = hasMore && clients.length > 0;
      }

      console.log(`✅ Clients sync completed: ${processedClients} clients`);

      // Обновить lastSyncAt
      await this.updateLastSyncTimestamp();

      if (this.onSyncProgress) {
        this.onSyncProgress({
          phase: 'complete',
          current: totalCount + processedClients,
          total: totalCount + processedClients,
          message: `Синхронизировано: ${processedItems} товаров, ${processedTransactions} записей, ${processedClients} клиентов`,
        });
      }

      console.log('✅ Assistant pull completed successfully (batch mode)');
    } catch (error: any) {
      console.error('❌ Assistant pull failed:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
      });
      if (this.onSyncProgress) {
        this.onSyncProgress({
          phase: 'error',
          current: 0,
          total: 0,
          message: error.message || 'Ошибка синхронизации',
        });
      }
      throw error;
    }
  }

  /**
   * Запросить подтверждение действия у админа
   */
  async requestApproval(
    actionType: 'UPDATE_ITEM' | 'DELETE_ITEM' | 'DELETE_TRANSACTION',
    entityId: number,
    oldData: any,
    newData: any,
    reason?: string
  ): Promise<void> {
    const accessToken = await AuthService.getAccessToken();
    if (!accessToken) {
      throw new Error('Not authenticated');
    }

    const api = AuthService.getApiInstance();
    const db = await getDatabaseInstance();

    try {
      const response = await api.post('/sync/assistant/request-approval', {
        actionType,
        entityId,
        oldData,
        newData,
        reason,
      }, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      // Сохранить pending action в локальную БД
      await runWithRetry(db, `
        INSERT INTO pending_actions (
          serverId, actionType, status, localItemId, localTransactionId,
          oldData, newData, reason, expiresAt
        ) VALUES (?, ?, 'PENDING', ?, ?, ?, ?, ?, ?)
      `, [
        response.data.pendingActionId,
        actionType,
        actionType.includes('ITEM') ? entityId : null,
        actionType === 'DELETE_TRANSACTION' ? entityId : null,
        JSON.stringify(oldData),
        JSON.stringify(newData),
        reason || null,
        Date.now() + 24 * 60 * 60 * 1000, // +24h
      ]);

      console.log('✅ Approval request sent successfully');
    } catch (error: any) {
      console.error('❌ Failed to request approval:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
      });
      throw error;
    }
  }

  // ============================================
  // АДМИН
  // ============================================

  /**
   * Pull изменений с сервера для админа (с защитой от параллельного выполнения)
   */
  async adminPull(): Promise<void> {
    const result = await this.withSyncLock(() => this._adminPullInternal());
    if (result === null) {
      console.log('⏳ adminPull skipped - sync already in progress');
    }
  }

  /**
   * Pull изменений с сервера для админа - внутренний метод с пагинацией
   */
  private async _adminPullInternal(): Promise<void> {
    const accessToken = await AuthService.getAccessToken();
    if (!accessToken) {
      console.warn('No access token, skipping sync');
      return;
    }

    const db = await getDatabaseInstance();
    const api = AuthService.getApiInstance();

    try {
      console.log('🔄 Starting admin pull sync (batch mode)...');

      // Каталоги синхронизируются ДО товаров — товары ссылаются на itemType (имя каталога).
      await this.syncCatalogs();
      // Доп. параметры товара (цвет, материал и т.д.) — пуш/пулл по itemUuid
      await this.syncItemAttributes();
      // Поставщики, поставки и оплаты
      await this.syncSuppliers();

      const lastSyncAt = await this.getLastSyncTimestamp();
      const PULL_BATCH_SIZE = 10;

      // Первый запрос для получения метаданных и определения isFullSync
      const initialResponse = await api.get('/sync/admin/pull', {
        params: {
          lastSyncAt: lastSyncAt ? new Date(lastSyncAt).toISOString() : undefined,
          type: 'items',
          limit: 1,
          cursor: 0,
        },
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const { isFullSync = false, totalItemsCount = 0, totalTransactionsCount = 0 } = initialResponse.data;

      console.log(`📊 Full sync: ${isFullSync}, Total items: ${totalItemsCount}, Total transactions: ${totalTransactionsCount}`);

      // Если полная синхронизация - очистить локальные данные
      if (isFullSync) {
        console.log('🗑️ Full sync - clearing local data...');
        if (this.onSyncProgress) {
          this.onSyncProgress({
            phase: 'syncing_items',
            current: 0,
            total: totalItemsCount + totalTransactionsCount,
            message: 'Подготовка к синхронизации...',
          });
        }
        try {
          await execWithRetry(db, 'BEGIN TRANSACTION;');
          await runWithRetry(db, 'DELETE FROM items WHERE serverId IS NOT NULL');
          await runWithRetry(db, 'DELETE FROM transactions WHERE serverId IS NOT NULL');
          await execWithRetry(db, 'COMMIT;');
        } catch (clearError: any) {
          console.error('❌ Error clearing local data, rolling back:', clearError.message);
          try {
            await execWithRetry(db, 'ROLLBACK;');
          } catch (rbErr) {
            console.warn('Rollback failed (ignored):', rbErr);
          }
          throw clearError;
        }
      }

      let processedItems = 0;
      let processedTransactions = 0;
      const totalCount = totalItemsCount + totalTransactionsCount;

      // === ЗАГРУЗКА ITEMS ПАРТИЯМИ ===
      let itemsCursor = 0;
      let itemsHasMore = true;

      while (itemsHasMore) {
        if (this.onSyncProgress) {
          this.onSyncProgress({
            phase: 'syncing_items',
            current: processedItems,
            total: totalCount,
            message: `Загрузка товаров... ${processedItems}/${totalItemsCount}`,
          });
        }

        const response = await api.get('/sync/admin/pull', {
          params: {
            lastSyncAt: lastSyncAt ? new Date(lastSyncAt).toISOString() : undefined,
            type: 'items',
            limit: PULL_BATCH_SIZE,
            cursor: itemsCursor,
          },
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        const { items = [], itemsNextCursor, hasMore } = response.data;

        console.log(`📥 Received ${items.length} items (cursor: ${itemsCursor}, hasMore: ${hasMore})`);

        // Применить items и скачать изображения
        for (const item of items) {
          if (item.isDeleted) {
            console.log(`🗑️ Item ${item.id} is deleted on server, removing locally`);
            await runWithRetry(db, 'DELETE FROM items WHERE serverId=?', [item.id]);
          } else {
            let localImageUri = null;

            if (item.imageUrl) {
              try {
                localImageUri = await ImageService.downloadImage(item.imageUrl, accessToken);
              } catch (error: any) {
                console.error(`❌ Failed to download image for item ${item.id}:`, error.message);
              }
            }

            await this.upsertItem({
              ...item,
              imageUri: localImageUri,
              serverImageUrl: item.imageUrl,
            });
          }
          processedItems++;
        }

        itemsCursor = itemsNextCursor || 0;
        itemsHasMore = hasMore && items.length > 0;
      }

      console.log(`✅ Items sync completed: ${processedItems} items`);

      // === ЗАГРУЗКА TRANSACTIONS ПАРТИЯМИ ===
      let transactionsCursor = 0;
      let transactionsHasMore = true;

      while (transactionsHasMore) {
        if (this.onSyncProgress) {
          this.onSyncProgress({
            phase: 'syncing_transactions',
            current: processedItems + processedTransactions,
            total: totalCount,
            message: `Загрузка истории... ${processedTransactions}/${totalTransactionsCount}`,
          });
        }

        const response = await api.get('/sync/admin/pull', {
          params: {
            lastSyncAt: lastSyncAt ? new Date(lastSyncAt).toISOString() : undefined,
            type: 'transactions',
            limit: PULL_BATCH_SIZE,
            cursor: transactionsCursor,
          },
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        const { transactions = [], transactionsNextCursor, hasMore } = response.data;

        console.log(`📥 Received ${transactions.length} transactions (cursor: ${transactionsCursor}, hasMore: ${hasMore})`);

        // Применить transactions
        for (const tx of transactions) {
          if (tx.isDeleted) {
            console.log(`🗑️ Transaction ${tx.id} is deleted on server, removing locally`);
            await runWithRetry(db, 'DELETE FROM transactions WHERE serverId=?', [tx.id]);
          } else {
            await this.upsertTransaction(tx);
          }
          processedTransactions++;
        }

        transactionsCursor = transactionsNextCursor || 0;
        transactionsHasMore = hasMore && transactions.length > 0;
      }

      console.log(`✅ Transactions sync completed: ${processedTransactions} transactions`);

      // === ЗАГРУЗКА CLIENTS ПАРТИЯМИ (для админа) ===
      let clientsCursor = 0;
      let clientsHasMore = true;
      let processedClients = 0;

      console.log('🔄 Starting clients pull for admin...');

      while (clientsHasMore) {
        if (this.onSyncProgress) {
          this.onSyncProgress({
            phase: 'syncing_clients',
            current: processedItems + processedTransactions + processedClients,
            total: totalCount,
            message: `Загрузка клиентов... ${processedClients}`,
          });
        }

        const response = await api.get('/sync/admin/pull', {
          params: {
            lastSyncAt: lastSyncAt ? new Date(lastSyncAt).toISOString() : undefined,
            type: 'clients',
            limit: PULL_BATCH_SIZE,
            cursor: clientsCursor,
          },
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        const { clients = [], clientsNextCursor, hasMore, totalClientsCount = 0 } = response.data;

        console.log(`📥 Received ${clients.length} clients (cursor: ${clientsCursor}, hasMore: ${hasMore}, total: ${totalClientsCount})`);

        for (const client of clients) {
          if (client.isDeleted) {
            console.log(`🗑️ Client ${client.id} is deleted on server, removing locally`);
            await runWithRetry(db, 'DELETE FROM clients WHERE serverId=?', [client.id]);
          } else {
            await this.upsertClient(client);
          }
          processedClients++;
        }

        clientsCursor = clientsNextCursor || 0;
        clientsHasMore = hasMore && clients.length > 0;
      }

      console.log(`✅ Clients sync completed: ${processedClients} clients`);

      // Обновить lastSyncAt
      await this.updateLastSyncTimestamp();

      if (this.onSyncProgress) {
        this.onSyncProgress({
          phase: 'complete',
          current: totalCount + processedClients,
          total: totalCount + processedClients,
          message: `Синхронизировано: ${processedItems} товаров, ${processedTransactions} записей, ${processedClients} клиентов`,
        });
      }

      // Admin не пушит items на сервер (есть только assistant push). Поэтому если у товара
      // есть serverId (значит он уже на сервере) — `needsSync=1` бессмысленный флаг и зависнет
      // навсегда в UI как "не синхронизировано". Сбросим после успешного pull.
      try {
        const db = await getDatabaseInstance();
        const before = await getFirstWithRetry<{ c: number }>(db, 'SELECT COUNT(*) as c FROM items WHERE needsSync = 1 AND serverId IS NOT NULL', []);
        if (before && before.c > 0) {
          await runWithRetry(db, 'UPDATE items SET needsSync = 0 WHERE needsSync = 1 AND serverId IS NOT NULL', []);
          console.log(`🧹 Admin: cleared needsSync=1 on ${before.c} synced items (admin doesn't push)`);
        }
      } catch (cleanupErr) {
        console.warn('🧹 Admin: needsSync cleanup failed (non-fatal)', cleanupErr);
      }

      console.log('✅ Admin pull completed successfully (batch mode)');
    } catch (error: any) {
      console.error('❌ Admin pull failed:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
      });
      if (this.onSyncProgress) {
        this.onSyncProgress({
          phase: 'error',
          current: 0,
          total: 0,
          message: error.message || 'Ошибка синхронизации',
        });
      }
      throw error;
    }
  }

  /**
   * Получить список ожидающих подтверждения действий
   */
  async getPendingActions(): Promise<any[]> {
    const accessToken = await AuthService.getAccessToken();
    if (!accessToken) {
      return [];
    }

    const api = AuthService.getApiInstance();

    try {
      const response = await api.get('/sync/admin/pending-actions', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      return response.data || [];
    } catch (error: any) {
      console.error('Failed to get pending actions:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
      });
      return [];
    }
  }

  /**
   * Одобрить действие
   */
  async approveAction(id: number, comment?: string): Promise<void> {
    const accessToken = await AuthService.getAccessToken();
    if (!accessToken) {
      throw new Error('Not authenticated');
    }

    const api = AuthService.getApiInstance();

    try {
      await api.post(`/sync/admin/approve/${id}`,
        { comment },
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      console.log('✅ Action approved successfully');
    } catch (error: any) {
      console.error('❌ Failed to approve action:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
      });
      throw error;
    }
  }

  /**
   * Отклонить действие
   */
  async rejectAction(id: number, comment?: string): Promise<void> {
    const accessToken = await AuthService.getAccessToken();
    if (!accessToken) {
      throw new Error('Not authenticated');
    }

    const api = AuthService.getApiInstance();

    try {
      await api.post(`/sync/admin/reject/${id}`,
        { comment },
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      console.log('✅ Action rejected successfully');
    } catch (error: any) {
      console.error('❌ Failed to reject action:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
      });
      throw error;
    }
  }

  // Удалить аккаунт пользователя
  async deleteAccount(): Promise<void> {
    console.log('🗑️ Deleting account...');

    const accessToken = await AuthService.getAccessToken();
    if (!accessToken) {
      throw new Error('Not authenticated');
    }

    const api = await AuthService.getApiInstance();

    try {
      const response = await api.delete('/auth/delete-account', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      console.log('✅ Account deleted on server:', response.data);

      // Clear local database
      await clearDatabase();

      // Clear auth tokens
      await AuthService.clearTokens();

      console.log('✅ Local data cleared');
    } catch (error: any) {
      console.error('❌ Failed to delete account:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
      });
      throw new Error(error.response?.data?.message || 'Не удалось удалить аккаунт');
    }
  }

  // ============================================
  // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
  // ============================================

  private async getLastSyncTimestamp(): Promise<number | null> {
    const db = await getDatabaseInstance();
    const result = await getFirstWithRetry<{ lastSyncAt: number }>(
      db,
      'SELECT lastSyncAt FROM sync_state WHERE id=1'
    );
    return result?.lastSyncAt || null;
  }

  private async updateLastSyncTimestamp(): Promise<void> {
    const db = await getDatabaseInstance();
    await runWithRetry(
      db,
      'UPDATE sync_state SET lastSyncAt=? WHERE id=1',
      [Date.now()]
    );
  }

  private async upsertItem(item: any): Promise<void> {
    const db = await getDatabaseInstance();

    // Проверить существует ли item с serverId
    const existing = await getFirstWithRetry<{ id: number }>(
      db,
      'SELECT id FROM items WHERE serverId=?',
      [item.id]
    );

    if (existing) {
      // Обновить существующий. ВАЖНО: uuid обновляем тоже — иначе локально-сгенерированный uuid
      // (если миграция выдала свой) останется навсегда и QR не будут совпадать с сервером и другими устройствами.
      // Серверный uuid — единственный источник истины. Если сервер по какой-то причине прислал пустой uuid,
      // оставляем тот что был (COALESCE-семантика через ?: на стороне JS).
      const uuidToWrite = item.uuid && item.uuid.length > 0 ? item.uuid : null;
      // priceUnit пришёл с сервера; если сервер старой версии и не вернул его —
      // оставляем 'pair' (легаси-дефолт), чтобы UI не сломался.
      const priceUnit = item.priceUnit || 'pair';
      if (uuidToWrite) {
        await runWithRetry(db, `
          UPDATE items SET
            uuid=?, name=?, code=?, warehouse=?, numberOfBoxes=?, boxSizeQuantities=?,
            sizeType=?, itemType=?, row=?, position=?, side=?,
            imageUri=?, serverImageUrl=?, totalQuantity=?, totalValue=?,
            qrCodeType=?, qrCodes=?, priceUnit=?, version=?, isDeleted=?, syncedAt=?
          WHERE serverId=?
        `, [
          uuidToWrite,
          item.name, item.code, item.warehouse, item.numberOfBoxes, item.boxSizeQuantities,
          item.sizeType, item.itemType, item.row, item.position, item.side,
          item.imageUri, item.serverImageUrl, item.totalQuantity, item.totalValue,
          item.qrCodeType, item.qrCodes, priceUnit, item.version, item.isDeleted ? 1 : 0, Date.now(),
          item.id
        ]);
      } else {
        // Сервер не вернул uuid — не трогаем локальный
        await runWithRetry(db, `
          UPDATE items SET
            name=?, code=?, warehouse=?, numberOfBoxes=?, boxSizeQuantities=?,
            sizeType=?, itemType=?, row=?, position=?, side=?,
            imageUri=?, serverImageUrl=?, totalQuantity=?, totalValue=?,
            qrCodeType=?, qrCodes=?, priceUnit=?, version=?, isDeleted=?, syncedAt=?
          WHERE serverId=?
        `, [
          item.name, item.code, item.warehouse, item.numberOfBoxes, item.boxSizeQuantities,
          item.sizeType, item.itemType, item.row, item.position, item.side,
          item.imageUri, item.serverImageUrl, item.totalQuantity, item.totalValue,
          item.qrCodeType, item.qrCodes, priceUnit, item.version, item.isDeleted ? 1 : 0, Date.now(),
          item.id
        ]);
      }
    } else {
      // Вставить новый — пишем uuid тоже
      const priceUnit = item.priceUnit || 'pair';
      await runWithRetry(db, `
        INSERT INTO items (
          serverId, uuid, name, code, warehouse, numberOfBoxes, boxSizeQuantities,
          sizeType, itemType, row, position, side,
          imageUri, serverImageUrl, totalQuantity, totalValue,
          qrCodeType, qrCodes, priceUnit, version, isDeleted, needsSync, syncedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
      `, [
        item.id, item.uuid || null, item.name, item.code, item.warehouse, item.numberOfBoxes, item.boxSizeQuantities,
        item.sizeType, item.itemType, item.row, item.position, item.side,
        item.imageUri, item.serverImageUrl, item.totalQuantity, item.totalValue,
        item.qrCodeType, item.qrCodes, priceUnit, item.version, item.isDeleted ? 1 : 0, Date.now()
      ]);
    }
  }

  private async upsertTransaction(tx: any): Promise<void> {
    const db = await getDatabaseInstance();

    // Resolving local itemId by itemUuid (preferred) or serverId
    let localItemId: number | null = null;

    if (tx.itemUuid) {
      const item = await getFirstWithRetry<{ id: number }>(
        db,
        'SELECT id FROM items WHERE uuid=?',
        [tx.itemUuid]
      );
      if (item) {
        localItemId = item.id;
      }
    }

    // Fallback: if no itemUuid or not found, try by serverId (if provided in tx)
    if (!localItemId && tx.itemServerId) {
      const item = await getFirstWithRetry<{ id: number }>(
        db,
        'SELECT id FROM items WHERE serverId=?',
        [tx.itemServerId]
      );
      if (item) {
        localItemId = item.id;
      }
    }

    // If still not found, keep existing logic (maybe it's null or legacy)
    // But ensure we don't overwrite with a wrong ID if we found nothing better.
    // If localItemId is found, use it. Otherwise use tx.itemId (which might be wrong if it's from server, but maybe it's null).
    // Actually, server sends "itemId" which is usually referencing the ITEM's ID on server (if simplistic) or null.
    // We should be careful. If we found a local item, use that ID.
    const finalItemId = localItemId !== null ? localItemId : tx.itemId;

    // Ремаппинг clientId если есть clientUuid или clientId
    let finalDetails = tx.details;
    if (tx.details && typeof tx.details === 'string') {
      try {
        const detailsObj = JSON.parse(tx.details);
        if (detailsObj.clientUuid) {
          // Приоритет: ремаппинг по UUID (самый надёжный)
          const client = await getFirstWithRetry<{ id: number }>(
            db,
            'SELECT id FROM clients WHERE uuid=?',
            [detailsObj.clientUuid]
          );
          if (client) {
            console.log(`♻️ Remapped clientId=${detailsObj.clientId} to localId=${client.id} (by UUID) for tx serverId=${tx.id}`);
            detailsObj.clientId = client.id;
            finalDetails = JSON.stringify(detailsObj);
          }
        } else if (detailsObj.clientId) {
          // Fallback: ремаппинг по serverId (clientId из сервера = serverId локально)
          const client = await getFirstWithRetry<{ id: number }>(
            db,
            'SELECT id FROM clients WHERE serverId=?',
            [detailsObj.clientId]
          );
          if (client) {
            console.log(`♻️ Remapped clientId=${detailsObj.clientId} to localId=${client.id} (by serverId) for tx serverId=${tx.id}`);
            detailsObj.clientId = client.id;
            finalDetails = JSON.stringify(detailsObj);
          }
        }
      } catch (e) {
        console.warn('Failed to parse details for remapping:', e);
      }
    }

    // Проверить существует ли transaction с serverId
    const existing = await getFirstWithRetry<{ id: number }>(
      db,
      'SELECT id FROM transactions WHERE serverId=?',
      [tx.id]
    );

    if (existing) {
      // Обновить существующий
      await runWithRetry(db, `
        UPDATE transactions SET
          action=?, itemId=?, itemName=?, timestamp=?, details=?,
          isDeleted=?, needsSync=0, syncedAt=?, itemUuid=?, currency=?
        WHERE serverId=?
      `, [
        tx.action, finalItemId, tx.itemName, tx.timestamp, finalDetails,
        tx.isDeleted ? 1 : 0, Date.now(), tx.itemUuid || null, tx.currency || null, tx.id
      ]);
    } else {
      // Вставить новый
      await runWithRetry(db, `
        INSERT INTO transactions (
          serverId, action, itemId, itemName, timestamp, details,
          isDeleted, needsSync, syncedAt, itemUuid, currency
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
      `, [
        tx.id, tx.action, finalItemId, tx.itemName, tx.timestamp, finalDetails,
        tx.isDeleted ? 1 : 0, Date.now(), tx.itemUuid || null, tx.currency || null
      ]);
    }
  }

  private async handleApprovedAction(action: any): Promise<void> {
    const db = await getDatabaseInstance();

    // Обновить статус в локальной БД
    await runWithRetry(db, `
      UPDATE pending_actions SET status='APPROVED', adminComment=?, respondedAt=?
      WHERE serverId=?
    `, [action.adminComment, Date.now(), action.id]);

    console.log(`✅ Action ${action.id} approved`);
  }

  private async upsertClient(client: any): Promise<void> {
    const db = await getDatabaseInstance();

    console.log(`📥 upsertClient: id=${client.id}, name=${client.name}, uuid=${client.uuid}, birthday=${client.birthday}`);

    // Проверить существует ли client с serverId или uuid
    const existing = await getFirstWithRetry<{ id: number }>(
      db,
      'SELECT id FROM clients WHERE serverId=? OR uuid=?',
      [client.id, client.uuid]
    );

    if (existing) {
      console.log(`📝 Updating existing client localId=${existing.id}`);
      await runWithRetry(db, `
        UPDATE clients SET
          serverId=?, name=?, phone=?, address=?, notes=?, birthday=?,
          isDeleted=?, needsSync=0, updatedAt=?
        WHERE id=?
      `, [
        client.id, client.name, client.phone || null, client.address || null,
        client.notes || null, client.birthday || null,
        client.isDeleted ? 1 : 0, Date.now(), existing.id
      ]);
    } else {
      console.log(`➕ Inserting new client`);
      await runWithRetry(db, `
        INSERT INTO clients (
          serverId, uuid, name, phone, address, notes, birthday,
          isDeleted, needsSync, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `, [
        client.id, client.uuid, client.name, client.phone || null,
        client.address || null, client.notes || null, client.birthday || null,
        client.isDeleted ? 1 : 0, Date.now(), Date.now()
      ]);
    }
  }

  /**
   * Получить количество несинхронизированных записей
   */
  async getPendingChangesCount(): Promise<number> {
    const db = await getDatabaseInstance();

    const itemsCount = await getFirstWithRetry<{ count: number }>(
      db,
      'SELECT COUNT(*) as count FROM items WHERE needsSync=1'
    );

    const transactionsCount = await getFirstWithRetry<{ count: number }>(
      db,
      'SELECT COUNT(*) as count FROM transactions WHERE needsSync=1'
    );

    return (itemsCount?.count || 0) + (transactionsCount?.count || 0);
  }

  /**
   * Сбросить состояние синхронизации для принудительной полной синхронизации
   * Используется когда пользователь очистил локальную БД и хочет восстановить данные с сервера
   */
  async resetSyncState(): Promise<void> {
    const db = await getDatabaseInstance();

    // Сбросить lastSyncAt на null чтобы следующий pull был полным
    await runWithRetry(db, 'UPDATE sync_state SET lastSyncAt=NULL WHERE id=1');

    console.log('🔄 Sync state reset - next pull will be a full sync');
  }

  /**
   * Полное восстановление данных с сервера
   * Очищает локальную БД и делает полную синхронизацию
   */
  async forceFullSync(role: 'ADMIN' | 'ASSISTANT'): Promise<void> {
    const db = await getDatabaseInstance();

    console.log('🗑️ Clearing local data for full sync...');

    // Очистить локальные данные (только те что с сервера)
    await runWithRetry(db, 'DELETE FROM items WHERE serverId IS NOT NULL');
    await runWithRetry(db, 'DELETE FROM transactions WHERE serverId IS NOT NULL');
    await runWithRetry(db, 'DELETE FROM pending_actions WHERE serverId IS NOT NULL');

    // Сбросить состояние синхронизации
    await this.resetSyncState();

    // Сделать pull в зависимости от роли
    if (role === 'ADMIN') {
      await this.adminPull();
    } else {
      await this.assistantPull();
    }

    console.log('✅ Full sync completed');
  }

  /**
   * Полная очистка всех локальных данных (при выходе из аккаунта)
   */
  async clearAllLocalData(): Promise<void> {
    console.log('🧹 Clearing all local data...');
    try {
      await clearDatabase();
      console.log('✅ All local data cleared');
    } catch (error) {
      console.error('❌ Failed to clear local data:', error);
      throw error;
    }
  }

  /**
   * Анализ качества данных - проверка на неполные данные из legacy версий
   * Вызывается после первой синхронизации для показа уведомлений пользователю
   */
  async analyzeDataQuality(): Promise<DataQualityReport> {
    const db = await getDatabaseInstance();

    // Получить все активные товары
    const allItems = await getAllWithRetry<any>(
      db,
      'SELECT id, name, boxSizeQuantities, qrCodeType, qrCodes, itemType, imageUri, imageNeedsUpload FROM items WHERE isDeleted=0'
    );

    let itemsWithoutRecommendedPrice = 0;
    let itemsWithoutQrCode = 0;
    let itemsWithMissingImages = 0;
    const issues: string[] = [];

    for (const item of allItems) {
      // Проверка recommendedSellingPrice в boxSizeQuantities
      try {
        const boxes = JSON.parse(item.boxSizeQuantities || '[]');
        let hasRecommendedPrice = false;
        for (const box of boxes) {
          if (Array.isArray(box)) {
            for (const sq of box) {
              if (sq && typeof sq.recommendedSellingPrice === 'number' && sq.recommendedSellingPrice > 0) {
                hasRecommendedPrice = true;
                break;
              }
            }
          }
          if (hasRecommendedPrice) break;
        }
        if (!hasRecommendedPrice && boxes.length > 0) {
          itemsWithoutRecommendedPrice++;
        }
      } catch {
        // Игнорируем ошибки парсинга
      }

      // Проверка QR-кода
      if (!item.qrCodeType || item.qrCodeType === 'none') {
        itemsWithoutQrCode++;
      }

      // Проверка изображений - только для тех, которые нужно загрузить
      if (item.imageNeedsUpload === 1 && item.imageUri) {
        try {
          const fileInfo = await FileSystem.getInfoAsync(item.imageUri);
          if (!fileInfo.exists) {
            itemsWithMissingImages++;
          }
        } catch {
          itemsWithMissingImages++;
        }
      }
    }

    // Формируем сообщения о проблемах
    if (itemsWithoutRecommendedPrice > 0) {
      issues.push(`${itemsWithoutRecommendedPrice} товар(ов) без рекомендованной цены`);
    }
    if (itemsWithoutQrCode > 0) {
      issues.push(`${itemsWithoutQrCode} товар(ов) без QR-кода`);
    }
    if (itemsWithMissingImages > 0) {
      issues.push(`${itemsWithMissingImages} товар(ов) с отсутствующими изображениями`);
    }

    return {
      totalItems: allItems.length,
      itemsWithoutRecommendedPrice,
      itemsWithoutQrCode,
      itemsWithMissingImages,
      issues,
    };
  }

  // ============================================
  // КАТАЛОГИ (мульти-каталог)
  // ============================================

  /**
   * Push локальных изменений каталогов на сервер + получить серверные изменения.
   * Безопасно вызывать перед обычным sync items.
   */
  async syncItemAttributes(): Promise<void> {
    const accessToken = await AuthService.getAccessToken();
    if (!accessToken) {
      console.warn('No access token, skipping item attributes sync');
      return;
    }
    const api = AuthService.getApiInstance();
    const db = await getDatabaseInstance();

    // 1. PUSH
    try {
      const dirty = await getAllWithRetry<any>(db, 'SELECT * FROM item_attributes WHERE needsSync = 1');
      if (dirty.length > 0) {
        const payload = dirty.map((row: any) => ({
          localId: row.id,
          serverId: row.serverId ?? undefined,
          uuid: row.uuid,
          itemUuid: row.itemUuid,
          name: row.name,
          value: row.value,
          attrType: row.attrType ?? 'text',
          unit: row.unit ?? undefined,
          sortOrder: row.sortOrder ?? 0,
          version: row.version ?? 1,
          isDeleted: !!row.isDeleted,
        }));
        const resp = await api.post(
          '/item-attributes/push',
          { attributes: payload },
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        const result = resp.data?.attributes ?? [];
        for (const r of result) {
          if (r.localId && r.serverId) {
            await runWithRetry(
              db,
              'UPDATE item_attributes SET serverId = ?, needsSync = 0 WHERE id = ?',
              [r.serverId, r.localId],
            );
          }
        }
        console.log(`📤 Pushed ${dirty.length} item attributes`);
      }
    } catch (err: any) {
      console.warn('Item attributes push failed:', err?.response?.data || err?.message || err);
    }

    // 2. PULL
    try {
      const lastSyncAt = await this.getLastSyncTimestamp();
      let cursor = 0;
      let hasMore = true;
      while (hasMore) {
        const resp = await api.get('/item-attributes/pull', {
          params: {
            lastSyncAt: lastSyncAt ? new Date(lastSyncAt).toISOString() : undefined,
            limit: 200,
            cursor,
          },
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const { attributes = [], hasMore: more = false, nextCursor } = resp.data || {};
        for (const a of attributes) {
          await this.upsertItemAttribute(a);
        }
        hasMore = !!more;
        cursor = nextCursor || cursor;
        if (attributes.length === 0) break;
      }
      console.log('📥 Item attributes pull complete');
    } catch (err: any) {
      console.warn('Item attributes pull failed:', err?.response?.data || err?.message || err);
    }
  }

  private async upsertItemAttribute(remote: any): Promise<void> {
    const db = await getDatabaseInstance();
    const existing = await getFirstWithRetry<any>(
      db,
      'SELECT id FROM item_attributes WHERE serverId = ? OR uuid = ?',
      [remote.id, remote.uuid],
    );
    const updatedAt = remote.updatedAt
      ? new Date(remote.updatedAt).getTime()
      : Date.now();
    if (existing) {
      await runWithRetry(
        db,
        `UPDATE item_attributes SET
          serverId = ?, uuid = ?, itemUuid = ?, name = ?, value = ?, attrType = ?, unit = ?,
          sortOrder = ?, version = ?, isDeleted = ?, needsSync = 0, updatedAt = ?
         WHERE id = ?`,
        [
          remote.id,
          remote.uuid,
          remote.itemUuid,
          remote.name,
          remote.value,
          remote.attrType ?? 'text',
          remote.unit ?? null,
          remote.sortOrder ?? 0,
          remote.version ?? 1,
          remote.isDeleted ? 1 : 0,
          updatedAt,
          existing.id,
        ],
      );
    } else {
      await runWithRetry(
        db,
        `INSERT INTO item_attributes
          (serverId, uuid, itemUuid, name, value, attrType, unit, sortOrder, version, isDeleted, needsSync, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        [
          remote.id,
          remote.uuid,
          remote.itemUuid,
          remote.name,
          remote.value,
          remote.attrType ?? 'text',
          remote.unit ?? null,
          remote.sortOrder ?? 0,
          remote.version ?? 1,
          remote.isDeleted ? 1 : 0,
          updatedAt,
          updatedAt,
        ],
      );
    }
  }

  async syncCatalogs(): Promise<void> {
    const accessToken = await AuthService.getAccessToken();
    if (!accessToken) {
      console.warn('No access token, skipping catalogs sync');
      return;
    }
    const api = AuthService.getApiInstance();
    const db = await getDatabaseInstance();

    // 1. PUSH — отправляем все каталоги с needsSync=1
    try {
      const dirty = await getAllWithRetry<any>(db, 'SELECT * FROM catalogs WHERE needsSync = 1');
      if (dirty.length > 0) {
        const payload = dirty.map((row: any) => ({
          localId: row.id,
          serverId: row.serverId ?? undefined,
          uuid: row.uuid,
          name: row.name,
          icon: row.icon ?? undefined,
          color: row.color ?? undefined,
          sortOrder: row.sortOrder ?? 0,
          isEnabled: !!row.isEnabled,
          sizeTypes: row.sizeTypes ?? '[]',
          version: row.version ?? 1,
          isDeleted: !!row.isDeleted,
        }));
        const resp = await api.post(
          '/catalogs/push',
          { catalogs: payload },
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        const result = resp.data?.catalogs ?? [];
        for (const r of result) {
          if (r.localId && r.serverId) {
            await runWithRetry(
              db,
              'UPDATE catalogs SET serverId = ?, needsSync = 0 WHERE id = ?',
              [r.serverId, r.localId],
            );
          }
        }
        console.log(`📤 Pushed ${dirty.length} catalogs`);
      }
    } catch (err: any) {
      console.warn('Catalogs push failed:', err?.response?.data || err?.message || err);
    }

    // 2. PULL — забираем изменения с сервера
    try {
      const lastSyncAt = await this.getLastSyncTimestamp();
      let cursor = 0;
      let hasMore = true;
      while (hasMore) {
        const resp = await api.get('/catalogs/pull', {
          params: {
            lastSyncAt: lastSyncAt ? new Date(lastSyncAt).toISOString() : undefined,
            limit: 200,
            cursor,
          },
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const { catalogs = [], hasMore: more = false, nextCursor } = resp.data || {};
        for (const cat of catalogs) {
          await this.upsertCatalog(cat);
        }
        hasMore = !!more;
        cursor = nextCursor || cursor;
        if (catalogs.length === 0) break;
      }
      console.log('📥 Catalogs pull complete');
    } catch (err: any) {
      console.warn('Catalogs pull failed:', err?.response?.data || err?.message || err);
    }
  }

  private async upsertCatalog(remote: any): Promise<void> {
    const db = await getDatabaseInstance();
    let existing = await getFirstWithRetry<any>(
      db,
      'SELECT id FROM catalogs WHERE serverId = ? OR uuid = ?',
      [remote.id, remote.uuid],
    );
    // Если по uuid/serverId не нашли, но локально есть каталог с таким же именем,
    // ещё не отправленный на сервер — сливаем (избегаем дубликата при seed на двух устройствах).
    if (!existing) {
      existing = await getFirstWithRetry<any>(
        db,
        'SELECT id FROM catalogs WHERE LOWER(name) = LOWER(?) AND (serverId IS NULL OR needsSync = 1) LIMIT 1',
        [remote.name],
      );
    }
    const updatedAt = remote.updatedAt
      ? new Date(remote.updatedAt).getTime()
      : Date.now();
    if (existing) {
      await runWithRetry(
        db,
        `UPDATE catalogs SET
          serverId = ?, uuid = ?, name = ?, icon = ?, color = ?, sortOrder = ?,
          isEnabled = ?, sizeTypes = ?, version = ?, isDeleted = ?, needsSync = 0, updatedAt = ?
         WHERE id = ?`,
        [
          remote.id,
          remote.uuid,
          remote.name,
          remote.icon ?? null,
          remote.color ?? null,
          remote.sortOrder ?? 0,
          remote.isEnabled === false ? 0 : 1,
          remote.sizeTypes ?? '[]',
          remote.version ?? 1,
          remote.isDeleted ? 1 : 0,
          updatedAt,
          existing.id,
        ],
      );
    } else {
      await runWithRetry(
        db,
        `INSERT INTO catalogs
          (serverId, uuid, name, icon, color, sortOrder, isEnabled, sizeTypes, version, isDeleted, needsSync, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        [
          remote.id,
          remote.uuid,
          remote.name,
          remote.icon ?? null,
          remote.color ?? null,
          remote.sortOrder ?? 0,
          remote.isEnabled === false ? 0 : 1,
          remote.sizeTypes ?? '[]',
          remote.version ?? 1,
          remote.isDeleted ? 1 : 0,
          updatedAt,
          updatedAt,
        ],
      );
    }
  }

  // ============================================
  // SUPPLIERS / SUPPLIES / SUPPLIER_PAYMENTS SYNC
  // ============================================
  async syncSuppliers(): Promise<void> {
    const accessToken = await AuthService.getAccessToken();
    if (!accessToken) {
      console.warn('No access token, skipping suppliers sync');
      return;
    }
    const api = AuthService.getApiInstance();
    const db = await getDatabaseInstance();
    const headers = { Authorization: `Bearer ${accessToken}` };

    // 1) PUSH — сначала поставщики, потом поставки/оплаты (зависят от supplierUuid)
    try {
      const dirtySuppliers = await getAllWithRetry<any>(db, 'SELECT * FROM suppliers WHERE needsSync = 1');
      const dirtySupplies = await getAllWithRetry<any>(db, 'SELECT * FROM supplies WHERE needsSync = 1');
      const dirtyPayments = await getAllWithRetry<any>(db, 'SELECT * FROM supplier_payments WHERE needsSync = 1');

      if (dirtySuppliers.length || dirtySupplies.length || dirtyPayments.length) {
        const payload: any = {};
        if (dirtySuppliers.length) {
          payload.suppliers = dirtySuppliers.map((s: any) => ({
            localId: s.id,
            serverId: s.serverId ?? undefined,
            uuid: s.uuid,
            name: s.name,
            phone: s.phone ?? undefined,
            address: s.address ?? undefined,
            notes: s.notes ?? undefined,
            isDeleted: !!s.isDeleted,
          }));
        }
        if (dirtySupplies.length) {
          payload.supplies = dirtySupplies.map((s: any) => ({
            localId: s.id,
            serverId: s.serverId ?? undefined,
            uuid: s.uuid,
            supplierId: s.supplierServerId ?? undefined,
            supplierUuid: s.supplierUuid ?? undefined,
            lines: s.lines || '[]',
            totalAmount: s.totalAmount || 0,
            paidAmount: s.paidAmount || 0,
            note: s.note ?? undefined,
            date: Number(s.date),
            isDeleted: !!s.isDeleted,
          }));
        }
        if (dirtyPayments.length) {
          payload.payments = dirtyPayments.map((p: any) => ({
            localId: p.id,
            serverId: p.serverId ?? undefined,
            uuid: p.uuid,
            supplierId: p.supplierServerId ?? undefined,
            supplierUuid: p.supplierUuid ?? undefined,
            supplyUuid: p.supplyUuid ?? undefined,
            allocations: p.allocations || '[]',
            amount: p.amount || 0,
            note: p.note ?? undefined,
            date: Number(p.date),
            isDeleted: !!p.isDeleted,
          }));
        }

        const resp = await api.post('/suppliers/push', payload, { headers });
        const result = resp.data || {};

        for (const r of result.suppliers ?? []) {
          if (r.localId && r.serverId) {
            await runWithRetry(db, 'UPDATE suppliers SET serverId = ?, needsSync = 0 WHERE id = ?', [r.serverId, r.localId]);
          }
        }
        for (const r of result.supplies ?? []) {
          if (r.localId && r.serverId) {
            await runWithRetry(db, 'UPDATE supplies SET serverId = ?, needsSync = 0 WHERE id = ?', [r.serverId, r.localId]);
          }
        }
        for (const r of result.payments ?? []) {
          if (r.localId && r.serverId) {
            await runWithRetry(db, 'UPDATE supplier_payments SET serverId = ?, needsSync = 0 WHERE id = ?', [r.serverId, r.localId]);
          }
        }
        console.log(`📤 Pushed ${dirtySuppliers.length} suppliers, ${dirtySupplies.length} supplies, ${dirtyPayments.length} payments`);
      }
    } catch (err: any) {
      console.warn('Suppliers push failed:', err?.response?.data || err?.message || err);
    }

    // 2) PULL — забираем все три типа
    const pullList: { type: 'suppliers' | 'supplies' | 'payments'; url: string; upsert: (row: any) => Promise<void> }[] = [
      { type: 'suppliers', url: '/suppliers/pull/suppliers', upsert: (r) => this.upsertSupplierRow(r) },
      { type: 'supplies', url: '/suppliers/pull/supplies', upsert: (r) => this.upsertSupplyRow(r) },
      { type: 'payments', url: '/suppliers/pull/payments', upsert: (r) => this.upsertPaymentRow(r) },
    ];
    const lastSyncAt = await this.getLastSyncTimestamp();

    for (const p of pullList) {
      try {
        let cursor = 0;
        let hasMore = true;
        while (hasMore) {
          const resp = await api.get(p.url, {
            params: {
              lastSyncAt: lastSyncAt ? new Date(lastSyncAt).toISOString() : undefined,
              limit: 200,
              cursor,
            },
            headers,
          });
          const { rows = [], hasMore: more = false, nextCursor } = resp.data || {};
          for (const row of rows) {
            await p.upsert(row);
          }
          hasMore = !!more;
          cursor = nextCursor || cursor;
          if (rows.length === 0) break;
        }
        console.log(`📥 ${p.type} pull complete`);
      } catch (err: any) {
        console.warn(`${p.type} pull failed:`, err?.response?.data || err?.message || err);
      }
    }
  }

  private async upsertSupplierRow(s: any): Promise<void> {
    const db = await getDatabaseInstance();
    const existing = await getFirstWithRetry<any>(
      db, 'SELECT id FROM suppliers WHERE serverId = ? OR uuid = ?', [s.id, s.uuid]
    );
    if (existing) {
      await runWithRetry(db, `
        UPDATE suppliers SET serverId = ?, name = ?, phone = ?, address = ?, notes = ?,
          isDeleted = ?, needsSync = 0, updatedAt = ?
        WHERE id = ?
      `, [s.id, s.name, s.phone || null, s.address || null, s.notes || null, s.isDeleted ? 1 : 0, Date.now(), existing.id]);
    } else {
      await runWithRetry(db, `
        INSERT INTO suppliers (serverId, uuid, name, phone, address, notes, isDeleted, needsSync, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `, [s.id, s.uuid || null, s.name, s.phone || null, s.address || null, s.notes || null, s.isDeleted ? 1 : 0, Date.now(), Date.now()]);
    }
  }

  private async upsertSupplyRow(s: any): Promise<void> {
    const db = await getDatabaseInstance();
    const existing = await getFirstWithRetry<any>(
      db, 'SELECT id FROM supplies WHERE serverId = ? OR uuid = ?', [s.id, s.uuid]
    );
    if (existing) {
      await runWithRetry(db, `
        UPDATE supplies SET serverId = ?, supplierServerId = ?, supplierUuid = ?, lines = ?,
          totalAmount = ?, paidAmount = ?, note = ?, date = ?, isDeleted = ?, needsSync = 0, updatedAt = ?
        WHERE id = ?
      `, [
        s.id, s.supplierId ?? null, s.supplierUuid ?? null, s.lines || '[]',
        s.totalAmount || 0, s.paidAmount || 0, s.note || null,
        Number(s.date), s.isDeleted ? 1 : 0, Date.now(), existing.id,
      ]);
    } else {
      await runWithRetry(db, `
        INSERT INTO supplies (serverId, uuid, supplierServerId, supplierUuid, lines, totalAmount,
          paidAmount, note, date, isDeleted, needsSync, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `, [
        s.id, s.uuid || null, s.supplierId ?? null, s.supplierUuid ?? null, s.lines || '[]',
        s.totalAmount || 0, s.paidAmount || 0, s.note || null, Number(s.date),
        s.isDeleted ? 1 : 0, Date.now(), Date.now(),
      ]);
    }
  }

  private async upsertPaymentRow(p: any): Promise<void> {
    const db = await getDatabaseInstance();
    const existing = await getFirstWithRetry<any>(
      db, 'SELECT id FROM supplier_payments WHERE serverId = ? OR uuid = ?', [p.id, p.uuid]
    );
    if (existing) {
      await runWithRetry(db, `
        UPDATE supplier_payments SET serverId = ?, supplierServerId = ?, supplierUuid = ?, supplyUuid = ?,
          allocations = ?, amount = ?, note = ?, date = ?, isDeleted = ?, needsSync = 0, updatedAt = ?
        WHERE id = ?
      `, [
        p.id, p.supplierId ?? null, p.supplierUuid ?? null, p.supplyUuid ?? null,
        p.allocations ?? '[]', p.amount, p.note || null, Number(p.date),
        p.isDeleted ? 1 : 0, Date.now(), existing.id,
      ]);
    } else {
      await runWithRetry(db, `
        INSERT INTO supplier_payments (serverId, uuid, supplierServerId, supplierUuid, supplyUuid,
          allocations, amount, note, date, isDeleted, needsSync, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `, [
        p.id, p.uuid || null, p.supplierId ?? null, p.supplierUuid ?? null, p.supplyUuid ?? null,
        p.allocations ?? '[]', p.amount, p.note || null, Number(p.date),
        p.isDeleted ? 1 : 0, Date.now(), Date.now(),
      ]);
    }
  }
}

export interface DataQualityReport {
  totalItems: number;
  itemsWithoutRecommendedPrice: number;
  itemsWithoutQrCode: number;
  itemsWithMissingImages: number;
  issues: string[];
}

export default new SyncService();
