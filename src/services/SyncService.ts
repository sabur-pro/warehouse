import AuthService from './AuthService';
import ImageService from './ImageService';
import { getDatabaseInstance, runWithRetry, getAllWithRetry, getFirstWithRetry } from '../../database/database';

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

class SyncService {
  // ============================================
  // АССИСТЕНТ
  // ============================================

  /**
   * Push изменений от ассистента на сервер
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
      console.log('🔄 Starting assistant push sync...');

      // 1. Загрузить изображения для items с imageNeedsUpload=1
      const itemsWithImages = await getAllWithRetry<any>(
        db,
        'SELECT * FROM items WHERE needsSync=1 AND imageNeedsUpload=1'
      );

      console.log(`📤 Found ${itemsWithImages.length} items with images to upload`);

      const failedImageUploads: { itemId: number; error: string }[] = [];

      for (const item of itemsWithImages) {
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
      }

      // Если есть ошибки загрузки изображений - прервать синхронизацию
      if (failedImageUploads.length > 0) {
        const errorDetails = failedImageUploads
          .map(f => `Item ${f.itemId}: ${f.error}`)
          .join('; ');
        throw new Error(`Не удалось загрузить ${failedImageUploads.length} изображение(й): ${errorDetails}`);
      }

      // 2. Получить items и transactions для синхронизации
      const items = await getAllWithRetry<any>(db, 'SELECT * FROM items WHERE needsSync=1');
      const transactions = await getAllWithRetry<any>(db, 'SELECT * FROM transactions WHERE needsSync=1');

      if (items.length === 0 && transactions.length === 0) {
        console.log('✅ Nothing to sync');
        return;
      }

      console.log(`📤 Syncing ${items.length} items and ${transactions.length} transactions`);

      // 3. Отправить на сервер
      const response = await api.post('/sync/assistant/push', {
        items: items.map((item: any) => ({
          localId: item.id,
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
        })),
        transactions: transactions.map((tx: any) => ({
          localId: tx.id,
          itemId: tx.itemId,
          action: tx.action,
          itemName: tx.itemName,
          timestamp: tx.timestamp,
          details: tx.details,
        })),
      }, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      // 4. Обновить serverId и needsSync для items
      for (const item of response.data.items || []) {
        await runWithRetry(
          db,
          'UPDATE items SET serverId=?, needsSync=0, syncedAt=? WHERE id=?',
          [item.serverId, Date.now(), item.localId]
        );
      }

      // 5. Обновить serverId и needsSync для transactions
      for (const tx of response.data.transactions || []) {
        await runWithRetry(
          db,
          'UPDATE transactions SET serverId=?, needsSync=0, syncedAt=? WHERE id=?',
          [tx.serverId, Date.now(), tx.localId]
        );
      }

      console.log('✅ Assistant push completed successfully');
    } catch (error: any) {
      console.error('❌ Assistant push failed:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
      });
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
}

export default new SyncService();
