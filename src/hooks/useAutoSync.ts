import { useEffect, useRef, useState, useCallback } from 'react';
import NetInfo from '@react-native-community/netinfo';
import SyncService, { DataQualityReport, SyncProgress } from '../services/SyncService';
import AuthService from '../services/AuthService';

// ============================================
// GLOBAL SYNC STATE MANAGER (Singleton)
// ============================================
// Все компоненты используют один общий state
// чтобы SyncStatusBar показывал статус при любом триггере sync

type SyncStateListener = () => void;

interface GlobalSyncState {
  isSyncing: boolean;
  syncProgress: SyncProgress | null;
  lastSyncTime: Date | null;
  syncError: string | null;
  pendingChangesCount: number;
}

class SyncStateManager {
  private static instance: SyncStateManager;
  private listeners: Set<SyncStateListener> = new Set();
  private state: GlobalSyncState = {
    isSyncing: false,
    syncProgress: null,
    lastSyncTime: null,
    syncError: null,
    pendingChangesCount: 0,
  };

  static getInstance(): SyncStateManager {
    if (!SyncStateManager.instance) {
      SyncStateManager.instance = new SyncStateManager();
    }
    return SyncStateManager.instance;
  }

  getState(): GlobalSyncState {
    return this.state;
  }

  setIsSyncing(value: boolean) {
    this.state.isSyncing = value;
    this.notifyListeners();
  }

  setSyncProgress(progress: SyncProgress | null) {
    this.state.syncProgress = progress;
    this.notifyListeners();
  }

  setLastSyncTime(time: Date | null) {
    this.state.lastSyncTime = time;
    this.notifyListeners();
  }

  setSyncError(error: string | null) {
    this.state.syncError = error;
    this.notifyListeners();
  }

  setPendingChangesCount(count: number) {
    this.state.pendingChangesCount = count;
    this.notifyListeners();
  }

  subscribe(listener: SyncStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener());
  }
}

// Экспортируем singleton для использования
export const syncStateManager = SyncStateManager.getInstance();

interface UseAutoSyncOptions {
  enabled?: boolean;
  syncInterval?: number; // в миллисекундах, по умолчанию 5 минут
}

export const useAutoSync = (options: UseAutoSyncOptions = {}) => {
  const { enabled = true, syncInterval = 5 * 60 * 1000 } = options;

  // Используем глобальный state для синхронизации
  const globalState = syncStateManager.getState();
  const [, forceUpdate] = useState(0);

  // Подписываемся на изменения глобального state
  useEffect(() => {
    const unsubscribe = syncStateManager.subscribe(() => {
      forceUpdate(n => n + 1);
    });
    return unsubscribe;
  }, []);

  // Локальные состояния для data quality (не нужны глобально)
  const [dataQualityReport, setDataQualityReport] = useState<DataQualityReport | null>(null);
  const [showDataQualityAlert, setShowDataQualityAlert] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isAuthenticatedRef = useRef(false);
  const userRoleRef = useRef<string | null>(null);
  const isFirstSyncRef = useRef(true);

  // Callback для обновления прогресса синхронизации (глобальный)
  const handleSyncProgress = useCallback((progress: SyncProgress) => {
    syncStateManager.setSyncProgress(progress);
  }, []);

  /**
   * Выполнить синхронизацию
   * @returns true если синхронизация прошла успешно, false если ошибка
   */
  const performSync = async (): Promise<boolean> => {
    // Проверяем глобальный isSyncing
    if (!enabled || syncStateManager.getState().isSyncing || !isAuthenticatedRef.current) {
      return false;
    }

    try {
      syncStateManager.setIsSyncing(true);
      syncStateManager.setSyncError(null);
      syncStateManager.setSyncProgress(null);

      // Установить callback для прогресса
      SyncService.setSyncProgressCallback(handleSyncProgress);

      const role = userRoleRef.current;

      if (role === 'ASSISTANT') {
        await SyncService.assistantPush();
        await SyncService.assistantPull();
      } else if (role === 'ADMIN') {
        await SyncService.adminPull();
      }

      syncStateManager.setLastSyncTime(new Date());

      // Обновить количество несинхронизированных записей
      const count = await SyncService.getPendingChangesCount();
      syncStateManager.setPendingChangesCount(count);

      // Проверить качество данных после первой успешной синхронизации
      if (isFirstSyncRef.current) {
        isFirstSyncRef.current = false;
        const report = await SyncService.analyzeDataQuality();
        setDataQualityReport(report);
        if (report.issues.length > 0) {
          setShowDataQualityAlert(true);
          console.log('⚠️ Data quality issues detected:', report.issues);
        }
      }

      console.log('✅ Auto-sync completed successfully');
      return true;
    } catch (error: any) {
      console.error('❌ Auto-sync failed:', error);
      syncStateManager.setSyncError(error.message || 'Sync failed');
      return false;
    } finally {
      syncStateManager.setIsSyncing(false);
      SyncService.setSyncProgressCallback(null);
      // Очистить прогресс через 2 секунды
      setTimeout(() => syncStateManager.setSyncProgress(null), 2000);
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
    isSyncing: syncStateManager.getState().isSyncing,
    lastSyncTime: syncStateManager.getState().lastSyncTime,
    syncError: syncStateManager.getState().syncError,
    pendingChangesCount: syncStateManager.getState().pendingChangesCount,
    performSync,
    dataQualityReport,
    showDataQualityAlert,
    dismissDataQualityAlert,
    recheckDataQuality,
    syncProgress: syncStateManager.getState().syncProgress,
  };
};
