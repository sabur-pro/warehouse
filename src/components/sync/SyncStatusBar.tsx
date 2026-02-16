// src/components/sync/SyncStatusBar.tsx
import React, { useState, useEffect, useContext } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAutoSync } from '../../hooks/useAutoSync';
import { useTheme } from '../../contexts/ThemeContext';
import { getThemeColors } from '../../../constants/theme';
import { IncompleteDataAlert } from './IncompleteDataAlert';
import { SYNC_INTERVAL_KEY, DEFAULT_SYNC_INTERVAL } from '../../screens/SettingsScreen';

// Создаём локальный контекст для refresh
interface SyncRefreshContextType {
  triggerRefreshAll: () => Promise<void>;
}
const SyncRefreshContext = React.createContext<SyncRefreshContextType | null>(null);

// Глобальное хранилище callbacks
const syncCallbacks = new Map<string, () => void>();

// Экспортируем провайдер
export const SyncRefreshProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {

  const triggerRefreshAll = React.useCallback(async () => {
    console.log('🔄 Triggering refresh for all registered screens...');
    const entries = Array.from(syncCallbacks.entries());

    for (let i = 0; i < entries.length; i++) {
      const [key, callback] = entries[i];
      console.log(`  - Refreshing: ${key}`);
      try {
        // Задержка между вызовами для избежания гонки за БД
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 150));
        }
        callback();
      } catch (error) {
        console.error(`Error refreshing ${key}:`, error);
      }
    }
    console.log('✅ All screens refreshed');
  }, []);

  // Глобальная регистрация 
  (global as any).__triggerSyncRefresh = triggerRefreshAll;

  return (
    <SyncRefreshContext.Provider value={{ triggerRefreshAll }}>
      {children}
    </SyncRefreshContext.Provider>
  );
};

// Хук для регистрации refresh callback
export const useSyncRefresh = (key: string, callback: () => void) => {
  useEffect(() => {
    console.log(`📝 Registering sync callback: ${key}`);
    syncCallbacks.set(key, callback);
    return () => {
      console.log(`🗑️ Unregistering sync callback: ${key}`);
      syncCallbacks.delete(key);
    };
  }, [key, callback]);
};

interface SyncStatusBarProps {
  onSyncComplete?: () => void;
}

export const SyncStatusBar: React.FC<SyncStatusBarProps> = ({ onSyncComplete }) => {
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);

  // Загрузить интервал из AsyncStorage
  const [syncInterval, setSyncIntervalState] = useState(DEFAULT_SYNC_INTERVAL);
  useEffect(() => {
    const loadInterval = async () => {
      const val = await AsyncStorage.getItem(SYNC_INTERVAL_KEY);
      if (val) setSyncIntervalState(parseInt(val, 10));
    };
    loadInterval();
    // Перечитывать интервал каждую минуту (на случай изменения в настройках)
    const timer = setInterval(loadInterval, 60000);
    return () => clearInterval(timer);
  }, []);

  const {
    isSyncing,
    lastSyncTime,
    syncError,
    pendingChangesCount,
    performSync,
    dataQualityReport,
    showDataQualityAlert,
    dismissDataQualityAlert,
    syncProgress,
  } = useAutoSync({ syncInterval });
  const [isConnected, setIsConnected] = useState<boolean | null>(true);
  const syncContext = useContext(SyncRefreshContext);

  // Отслеживаем интернет соединение
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      // Используем isConnected, но также проверяем isInternetReachable для надёжности
      // На iOS isConnected может быть true, но isInternetReachable - false
      const connected = state.isConnected === true && state.isInternetReachable !== false;
      console.log('📡 Network state changed:', {
        isConnected: state.isConnected,
        isInternetReachable: state.isInternetReachable,
        type: state.type,
        resolved: connected,
      });
      setIsConnected(connected);
    });

    // Получить начальное состояние
    NetInfo.fetch().then((state: NetInfoState) => {
      const connected = state.isConnected === true && state.isInternetReachable !== false;
      console.log('📡 Initial network state:', {
        isConnected: state.isConnected,
        isInternetReachable: state.isInternetReachable,
        type: state.type,
        resolved: connected,
      });
      setIsConnected(connected);
    });

    return () => unsubscribe();
  }, []);

  const formatLastSyncTime = () => {
    if (!lastSyncTime) return 'Не синхронизировано';

    const now = new Date();
    const diff = now.getTime() - lastSyncTime.getTime();
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return 'Только что';
    if (minutes === 1) return '1 мин. назад';
    if (minutes < 60) return `${minutes} мин. назад`;

    const hours = Math.floor(minutes / 60);
    if (hours === 1) return '1 час назад';
    if (hours < 24) return `${hours} ч. назад`;

    return lastSyncTime.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  };

  const handleSync = async () => {
    const success = await performSync();

    // Триггерим обновление всех зарегистрированных экранов только при успехе
    if (success) {
      console.log('🔄 Sync successful, triggering screen refresh...');
      if (syncContext) {
        syncContext.triggerRefreshAll();
      } else if ((global as any).__triggerSyncRefresh) {
        (global as any).__triggerSyncRefresh();
      }

      // Вызываем callback после успешной синхронизации
      if (onSyncComplete) {
        onSyncComplete();
      }
    }
  };

  const getStatusText = () => {
    // Показать прогресс синхронизации если есть
    if (isSyncing && syncProgress) {
      return syncProgress.message;
    }
    if (isSyncing) return 'Синхронизация...';
    if (syncError) return syncError.substring(0, 25);
    if (pendingChangesCount > 0) return `${pendingChangesCount} не синхр.`;
    return formatLastSyncTime();
  };

  const getStatusColor = () => {
    if (syncError) return '#ef4444';
    if (pendingChangesCount > 0) return '#f59e0b';
    return colors.text.muted;
  };

  return (
    <>
      {/* Уведомление о неполных данных */}
      <IncompleteDataAlert
        report={dataQualityReport}
        visible={showDataQualityAlert}
        onDismiss={dismissDataQualityAlert}
      />

      <View style={[styles.container, {
        backgroundColor: isDark ? colors.background.light : '#f8fafc',
        borderTopColor: colors.border.normal,
      }]}>
        {/* Индикатор интернета */}
        <View style={styles.statusSection}>
          <View style={[
            styles.connectionDot,
            { backgroundColor: isConnected ? '#22c55e' : '#ef4444' }
          ]} />

          {isSyncing ? (
            <ActivityIndicator size="small" color={isDark ? colors.primary.gold : '#3b82f6'} style={styles.spinner} />
          ) : (
            <MaterialIcons
              name={syncError ? "error-outline" : pendingChangesCount > 0 ? "sync-problem" : "cloud-done"}
              size={16}
              color={getStatusColor()}
              style={styles.statusIcon}
            />
          )}

          <Text style={[styles.statusText, { color: getStatusColor() }]} numberOfLines={1}>
            {getStatusText()}
          </Text>
        </View>

        {/* Кнопка синхронизации */}
        <TouchableOpacity
          onPress={handleSync}
          disabled={isSyncing || !isConnected}
          style={[
            styles.syncButton,
            {
              backgroundColor: isSyncing || !isConnected
                ? (isDark ? '#374151' : '#e5e7eb')
                : (isDark ? colors.primary.gold : '#3b82f6'),
            }
          ]}
          activeOpacity={0.7}
        >
          <MaterialIcons
            name="sync"
            size={14}
            color={isSyncing || !isConnected ? colors.text.muted : '#ffffff'}
          />
          <Text style={[
            styles.syncButtonText,
            { color: isSyncing || !isConnected ? colors.text.muted : '#ffffff' }
          ]}>
            Синхр.
          </Text>
        </TouchableOpacity>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderTopWidth: 1,
  },
  statusSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  connectionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 8,
  },
  spinner: {
    marginRight: 6,
  },
  statusIcon: {
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    flex: 1,
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    gap: 4,
  },
  syncButtonText: {
    fontSize: 11,
    fontWeight: '600',
  },
});

export default SyncStatusBar;
