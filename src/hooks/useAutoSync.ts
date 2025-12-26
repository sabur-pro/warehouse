import { useEffect, useRef, useState, useCallback } from 'react';
import NetInfo from '@react-native-community/netinfo';
import SyncService, { DataQualityReport, SyncProgress } from '../services/SyncService';
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
  const [dataQualityReport, setDataQualityReport] = useState<DataQualityReport | null>(null);
  const [showDataQualityAlert, setShowDataQualityAlert] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isAuthenticatedRef = useRef(false);
  const userRoleRef = useRef<string | null>(null);
  const isFirstSyncRef = useRef(true); // Флаг первой синхронизации

  // Callback для обновления прогресса синхронизации
  const handleSyncProgress = useCallback((progress: SyncProgress) => {
    setSyncProgress(progress);
  }, []);

  /**
   * Выполнить синхронизацию
   * @returns true если синхронизация прошла успешно, false если ошибка
   */
  const performSync = async (): Promise<boolean> => {
    if (!enabled || isSyncing || !isAuthenticatedRef.current) {
      return false;
    }

    try {
      setIsSyncing(true);
      setSyncError(null);
      setSyncProgress(null); // Сбросить прогресс

      // Установить callback для прогресса
      SyncService.setSyncProgressCallback(handleSyncProgress);

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

      // Проверить качество данных после первой успешной синхронизации
      if (isFirstSyncRef.current) {
        isFirstSyncRef.current = false;
        const report = await SyncService.analyzeDataQuality();
        setDataQualityReport(report);
        // Показать алерт только если есть проблемы
        if (report.issues.length > 0) {
          setShowDataQualityAlert(true);
          console.log('⚠️ Data quality issues detected:', report.issues);
        }
      }

      console.log('✅ Auto-sync completed successfully');
      return true; // Успешно
    } catch (error: any) {
      console.error('❌ Auto-sync failed:', error);
      setSyncError(error.message || 'Sync failed');
      return false; // Ошибка
    } finally {
      setIsSyncing(false);
      // Очистить callback после завершения
      SyncService.setSyncProgressCallback(null);
      // Очистить прогресс через 2 секунды
      setTimeout(() => setSyncProgress(null), 2000);
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

  /**
   * Скрыть уведомление о качестве данных
   */
  const dismissDataQualityAlert = () => {
    setShowDataQualityAlert(false);
  };

  /**
   * Повторно проанализировать качество данных
   */
  const recheckDataQuality = async () => {
    try {
      const report = await SyncService.analyzeDataQuality();
      setDataQualityReport(report);
      return report;
    } catch (error) {
      console.error('Failed to analyze data quality:', error);
      return null;
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
    // Новые поля для качества данных
    dataQualityReport,
    showDataQualityAlert,
    dismissDataQualityAlert,
    recheckDataQuality,
    // Прогресс синхронизации (для batch sync)
    syncProgress,
  };
};
