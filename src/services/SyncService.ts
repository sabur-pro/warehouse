import AuthService from './AuthService';
import ImageService from './ImageService';
import { getDatabaseInstance, runWithRetry, getAllWithRetry, getFirstWithRetry, clearDatabase } from '../../database/database';

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
}

interface SyncTransaction {
  localId?: number;
  itemId?: number;
  action: string;
  itemName: string;
  timestamp: number;
  details?: string;
}

/**
 * Прогресс синхронизации для UI
 */
export interface SyncProgress {
  phase: 'uploading_images' | 'syncing_items' | 'syncing_transactions' | 'complete' | 'error';
  current: number;
  total: number;
  message: string;
}

class SyncService {
  // ============================================
  // АССИСТЕНТ
  // ============================================

  // Размер batch для синхронизации
  private readonly BATCH_SIZE = 50;
  // Количество попыток для каждого batch
  private readonly BATCH_RETRY_COUNT = 3;
  // Задержка между попытками (ms)
  private readonly BATCH_RETRY_DELAY = 1000;

  // Callback для прогресса sync
  private onSyncProgress: ((progress: SyncProgress) => void) | null = null;

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
   * Push изменений от ассистента на сервер (с пакетной обработкой)
   */
  async assistantPush(): Promise<void> {
    const accessToken = await AuthService.getAccessToken();
    if (!accessToken) {
      console.warn('No access token, skipping sync');
      return;
    }

    const db = await getDatabaseInstance();
    const api = AuthService.getApiInstance();

    try {
      console.log('🔄 Starting assistant push sync (batch mode)...');

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

      const failedImageUploads: { itemId: number; error: string }[] = [];

      for (let i = 0; i < itemsWithImages.length; i++) {
        const item = itemsWithImages[i];
        if (item.imageUri) {
          try {
            const imageUrl = await ImageService.uploadImage(item.imageUri, accessToken);
            await runWithRetry(
              db,
              'UPDATE items SET serverImageUrl=?, imageNeedsUpload=0 WHERE id=?',
              [imageUrl, item.id]
            );
            console.log(`✅ Uploaded image for item ${item.id}`);
          } catch (error: any) {
            const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
            console.error(`❌ Failed to upload image for item ${item.id}:`, {
              message: error.message,
              status: error.response?.status,
              data: error.response?.data,
            });
            failedImageUploads.push({ itemId: item.id, error: errorMessage });
          }
        }

        // Обновить прогресс загрузки изображений
        if (this.onSyncProgress) {
          this.onSyncProgress({
            phase: 'uploading_images',
            current: i + 1,
            total: itemsWithImages.length,
            message: `Загрузка изображений... ${i + 1}/${itemsWithImages.length}`,
          });
        }
      }

      // Если есть ошибки загрузки изображений - прервать синхронизацию
      if (failedImageUploads.length > 0) {
        const errorDetails = failedImageUploads
          .map(f => `Item ${f.itemId}: ${f.error}`)
          .join('; ');
        throw new Error(`Не удалось загрузить ${failedImageUploads.length} изображение(й): ${errorDetails}`);
      }

      // 2. Получить items и transactions для синхронизации
      const allItems = await getAllWithRetry<any>(db, 'SELECT * FROM items WHERE needsSync=1');
      const allTransactions = await getAllWithRetry<any>(db, 'SELECT * FROM transactions WHERE needsSync=1');

      if (allItems.length === 0 && allTransactions.length === 0) {
        console.log('✅ Nothing to sync');
        if (this.onSyncProgress) {
          this.onSyncProgress({ phase: 'complete', current: 0, total: 0, message: 'Нет данных для синхронизации' });
        }
        return;
      }

      console.log(`📤 Syncing ${allItems.length} items and ${allTransactions.length} transactions (batch size: ${this.BATCH_SIZE})`);

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
            createdAt: item.createdAt,
            version: item.version,
            isDeleted: item.isDeleted === 1,
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
          for (const item of responseData.items || []) {
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

        const payload = {
          items: [], // Transactions только в этом batch
          transactions: batch.map((tx: any) => ({
            localId: tx.id,
            serverId: tx.serverId,
            itemId: tx.itemId,
            action: tx.action,
            itemName: tx.itemName,
            timestamp: tx.timestamp,
            details: tx.details,
            isDeleted: tx.isDeleted === 1,
          })),
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

      // Завершение - формируем сообщение с учётом ошибок
      const syncedItems = allItems.length - failedItemsCount;
      const syncedTransactions = allTransactions.length - failedTransactionsCount;
      let completionMessage = `Синхронизировано: ${syncedItems} товаров, ${syncedTransactions} записей`;

      if (failedItemsCount > 0 || failedTransactionsCount > 0) {
        completionMessage += ` (не удалось: ${failedItemsCount} товаров, ${failedTransactionsCount} записей)`;
      }

      // Показать прогресс завершения
      if (this.onSyncProgress) {
        this.onSyncProgress({
          phase: 'complete',
          current: totalBatches,
          total: totalBatches,
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
   * Pull изменений с сервера для ассистента
   */
  async assistantPull(): Promise<void> {
    const accessToken = await AuthService.getAccessToken();
    if (!accessToken) {
      console.warn('No access token, skipping sync');
      return;
    }

    const db = await getDatabaseInstance();
    const api = AuthService.getApiInstance();

    try {
      console.log('🔄 Starting assistant pull sync...');

      const lastSyncAt = await this.getLastSyncTimestamp();

      const response = await api.get('/sync/assistant/pull', {
        params: { lastSyncAt: lastSyncAt ? new Date(lastSyncAt).toISOString() : undefined },
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const { items = [], transactions = [], approvedActions = [], isFullSync = false } = response.data;

      console.log(`📥 Received ${items.length} items, ${transactions.length} transactions, ${approvedActions.length} approved actions (fullSync: ${isFullSync})`);

      // Если полная синхронизация - очистить локальные данные
      if (isFullSync) {
        console.log('🗑️ Full sync - clearing local data...');
        await runWithRetry(db, 'DELETE FROM items WHERE serverId IS NOT NULL');
        await runWithRetry(db, 'DELETE FROM transactions WHERE serverId IS NOT NULL');
      }

      // Применить items и скачать изображения
      for (const item of items) {
        // Если item удалён на сервере - удалить локально
        if (item.isDeleted) {
          console.log(`🗑️ Item ${item.id} is deleted on server, removing locally`);
          await runWithRetry(db, 'DELETE FROM items WHERE serverId=?', [item.id]);
          continue;
        }

        let localImageUri = null;

        if (item.imageUrl) {
          try {
            localImageUri = await ImageService.downloadImage(item.imageUrl, accessToken);
            console.log(`✅ Downloaded image for item ${item.id}`);
          } catch (error: any) {
            console.error(`❌ Failed to download image for item ${item.id}:`, {
              message: error.message,
              status: error.response?.status,
              data: error.response?.data,
            });
          }
        }

        await this.upsertItem({
          ...item,
          imageUri: localImageUri,
          serverImageUrl: item.imageUrl,
        });
      }

      // Применить transactions
      for (const tx of transactions) {
        // Если transaction удалён на сервере - удалить локально
        if (tx.isDeleted) {
          console.log(`🗑️ Transaction ${tx.id} is deleted on server, removing locally`);
          await runWithRetry(db, 'DELETE FROM transactions WHERE serverId=?', [tx.id]);
          continue;
        }

        await this.upsertTransaction(tx);
      }

      // Обработать одобренные действия
      for (const action of approvedActions) {
        await this.handleApprovedAction(action);
      }

      // Обновить lastSyncAt
      await this.updateLastSyncTimestamp();

      console.log('✅ Assistant pull completed successfully');
    } catch (error: any) {
      console.error('❌ Assistant pull failed:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
      });
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
   * Pull изменений с сервера для админа
   */
  async adminPull(): Promise<void> {
    const accessToken = await AuthService.getAccessToken();
    if (!accessToken) {
      console.warn('No access token, skipping sync');
      return;
    }

    const db = await getDatabaseInstance();
    const api = AuthService.getApiInstance();

    try {
      console.log('🔄 Starting admin pull sync...');

      const lastSyncAt = await this.getLastSyncTimestamp();

      const response = await api.get('/sync/admin/pull', {
        params: { lastSyncAt: lastSyncAt ? new Date(lastSyncAt).toISOString() : undefined },
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const { items = [], transactions = [], isFullSync = false } = response.data;

      console.log(`📥 Received ${items.length} items and ${transactions.length} transactions (fullSync: ${isFullSync})`);

      // Если полная синхронизация - очистить локальные данные
      if (isFullSync) {
        console.log('🗑️ Full sync - clearing local data...');
        await runWithRetry(db, 'DELETE FROM items WHERE serverId IS NOT NULL');
        await runWithRetry(db, 'DELETE FROM transactions WHERE serverId IS NOT NULL');
      }

      // Применить items и скачать изображения
      for (const item of items) {
        // Если item удалён на сервере - удалить локально
        if (item.isDeleted) {
          console.log(`🗑️ Item ${item.id} is deleted on server, removing locally`);
          await runWithRetry(db, 'DELETE FROM items WHERE serverId=?', [item.id]);
          continue;
        }

        let localImageUri = null;

        if (item.imageUrl) {
          try {
            localImageUri = await ImageService.downloadImage(item.imageUrl, accessToken);
            console.log(`✅ Downloaded image for item ${item.id}`);
          } catch (error: any) {
            console.error(`❌ Failed to download image for item ${item.id}:`, {
              message: error.message,
              status: error.response?.status,
              data: error.response?.data,
            });
          }
        }

        await this.upsertItem({
          ...item,
          imageUri: localImageUri,
          serverImageUrl: item.imageUrl,
        });
      }

      // Применить transactions
      for (const tx of transactions) {
        // Если transaction удалён на сервере - удалить локально
        if (tx.isDeleted) {
          console.log(`🗑️ Transaction ${tx.id} is deleted on server, removing locally`);
          await runWithRetry(db, 'DELETE FROM transactions WHERE serverId=?', [tx.id]);
          continue;
        }

        await this.upsertTransaction(tx);
      }

      // Обновить lastSyncAt
      await this.updateLastSyncTimestamp();

      console.log('✅ Admin pull completed successfully');
    } catch (error: any) {
      console.error('❌ Admin pull failed:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
      });
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
      // Обновить существующий
      await runWithRetry(db, `
        UPDATE items SET
          name=?, code=?, warehouse=?, numberOfBoxes=?, boxSizeQuantities=?,
          sizeType=?, itemType=?, row=?, position=?, side=?,
          imageUri=?, serverImageUrl=?, totalQuantity=?, totalValue=?,
          qrCodeType=?, qrCodes=?, version=?, isDeleted=?, syncedAt=?
        WHERE serverId=?
      `, [
        item.name, item.code, item.warehouse, item.numberOfBoxes, item.boxSizeQuantities,
        item.sizeType, item.itemType, item.row, item.position, item.side,
        item.imageUri, item.serverImageUrl, item.totalQuantity, item.totalValue,
        item.qrCodeType, item.qrCodes, item.version, item.isDeleted ? 1 : 0, Date.now(),
        item.id
      ]);
    } else {
      // Вставить новый
      await runWithRetry(db, `
        INSERT INTO items (
          serverId, name, code, warehouse, numberOfBoxes, boxSizeQuantities,
          sizeType, itemType, row, position, side,
          imageUri, serverImageUrl, totalQuantity, totalValue,
          qrCodeType, qrCodes, version, isDeleted, needsSync, syncedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
      `, [
        item.id, item.name, item.code, item.warehouse, item.numberOfBoxes, item.boxSizeQuantities,
        item.sizeType, item.itemType, item.row, item.position, item.side,
        item.imageUri, item.serverImageUrl, item.totalQuantity, item.totalValue,
        item.qrCodeType, item.qrCodes, item.version, item.isDeleted ? 1 : 0, Date.now()
      ]);
    }
  }

  private async upsertTransaction(tx: any): Promise<void> {
    const db = await getDatabaseInstance();

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
          isDeleted=?, syncedAt=?
        WHERE serverId=?
      `, [
        tx.action, tx.itemId, tx.itemName, tx.timestamp, tx.details,
        tx.isDeleted ? 1 : 0, Date.now(), tx.id
      ]);
    } else {
      // Вставить новый
      await runWithRetry(db, `
        INSERT INTO transactions (
          serverId, action, itemId, itemName, timestamp, details,
          isDeleted, needsSync, syncedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
      `, [
        tx.id, tx.action, tx.itemId, tx.itemName, tx.timestamp, tx.details,
        tx.isDeleted ? 1 : 0, Date.now()
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
      'SELECT id, name, boxSizeQuantities, qrCodeType, qrCodes, itemType FROM items WHERE isDeleted=0'
    );

    let itemsWithoutRecommendedPrice = 0;
    let itemsWithoutQrCode = 0;
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
    }

    // Формируем сообщения о проблемах
    if (itemsWithoutRecommendedPrice > 0) {
      issues.push(`${itemsWithoutRecommendedPrice} товар(ов) без рекомендованной цены`);
    }
    if (itemsWithoutQrCode > 0) {
      issues.push(`${itemsWithoutQrCode} товар(ов) без QR-кода`);
    }

    return {
      totalItems: allItems.length,
      itemsWithoutRecommendedPrice,
      itemsWithoutQrCode,
      issues,
    };
  }
}

export interface DataQualityReport {
  totalItems: number;
  itemsWithoutRecommendedPrice: number;
  itemsWithoutQrCode: number;
  issues: string[];
}

export default new SyncService();
