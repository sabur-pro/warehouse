import { useEffect, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import SyncService from '../services/SyncService';
import AuthService from '../services/AuthService';

interface UseAutoSyncOptions {
  enabled?: boolean;
  syncInterval?: number; // в миллисекундах, по умолчанию 5 минут
}

export const useAutoSync = (options: UseAutoSyncOptions = {}) => {
  const { enabled = true, syncInterval = 5 * 60 * 1000 } = options;
  
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [pendingChangesCount, setPendingChangesCount] = useState(0);
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isAuthenticatedRef = useRef(false);
  const userRoleRef = useRef<string | null>(null);

  /**
   * Выполнить синхронизацию
   */
  const performSync = async () => {
    if (!enabled || isSyncing || !isAuthenticatedRef.current) {
      return;
    }

    try {
      setIsSyncing(true);
      setSyncError(null);

      const role = userRoleRef.current;
      
      if (role === 'ASSISTANT') {
        // Ассистент: сначала push, потом pull
        await SyncService.assistantPush();
        await SyncService.assistantPull();
      } else if (role === 'ADMIN') {
        // Админ: только pull (не создает данные)
        await SyncService.adminPull();
      }

      setLastSyncTime(new Date());
      
      // Обновить количество несинхронизированных записей
      const count = await SyncService.getPendingChangesCount();
      setPendingChangesCount(count);
      
      console.log('✅ Auto-sync completed successfully');
    } catch (error: any) {
      console.error('❌ Auto-sync failed:', error);
      setSyncError(error.message || 'Sync failed');
    } finally {
      setIsSyncing(false);
    }
  };

  /**
   * Проверить аутентификацию и роль пользователя
   */
  const checkAuthStatus = async () => {
    try {
      const token = await AuthService.getAccessToken();
      const decodedToken = token ? AuthService.decodeToken(token) : null;
      
      isAuthenticatedRef.current = !!token;
      userRoleRef.current = decodedToken?.role || null;
    } catch (error) {
      console.error('Failed to check auth status:', error);
      isAuthenticatedRef.current = false;
      userRoleRef.current = null;
    }
  };

  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Проверить аутентификацию при монтировании
    checkAuthStatus();

    // Подписка на изменения сети
    const unsubscribeNetInfo = NetInfo.addEventListener(state => {
      if (state.isConnected && state.isInternetReachable && isAuthenticatedRef.current) {
        console.log('🌐 Network connected, triggering sync...');
        performSync();
      }
    });

    // Периодическая синхронизация
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    
    intervalRef.current = setInterval(() => {
      if (isAuthenticatedRef.current) {
        performSync();
      }
    }, syncInterval);

    // Выполнить первую синхронизацию сразу
    performSync();

    // Cleanup
    return () => {
      unsubscribeNetInfo();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [enabled, syncInterval]);

  return {
    isSyncing,
    lastSyncTime,
    syncError,
    pendingChangesCount,
    performSync, // Функция для ручной синхронизации
  };
};
