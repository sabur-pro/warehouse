import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useAutoSync } from '../../hooks/useAutoSync';

export const SyncStatusBar: React.FC = () => {
  const { isSyncing, lastSyncTime, syncError, pendingChangesCount, performSync } = useAutoSync();

  const formatLastSyncTime = () => {
    if (!lastSyncTime) return 'Не синхронизировано';
    
    const now = new Date();
    const diff = now.getTime() - lastSyncTime.getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'Только что';
    if (minutes === 1) return '1 минуту назад';
    if (minutes < 60) return `${minutes} минут назад`;
    
    const hours = Math.floor(minutes / 60);
    if (hours === 1) return '1 час назад';
    if (hours < 24) return `${hours} часов назад`;
    
    return lastSyncTime.toLocaleString('ru-RU');
  };

  return (
    <View className="flex-row items-center justify-between bg-white px-4 py-2 border-b border-gray-200">
      <View className="flex-1">
        {isSyncing ? (
          <View className="flex-row items-center">
            <ActivityIndicator size="small" color="#3B82F6" />
            <Text className="ml-2 text-sm text-gray-600">Синхронизация...</Text>
          </View>
        ) : syncError ? (
          <View className="flex-row items-center">
            <Text className="text-xs text-red-500">❌ {syncError}</Text>
          </View>
        ) : (
          <View className="flex-row items-center">
            <Text className="text-xs text-gray-500">
              {pendingChangesCount > 0 
                ? `⚠️ ${pendingChangesCount} не синхронизировано` 
                : `✅ ${formatLastSyncTime()}`}
            </Text>
          </View>
        )}
      </View>

      <TouchableOpacity
        onPress={performSync}
        disabled={isSyncing}
        className={`px-3 py-1 rounded-md ${isSyncing ? 'bg-gray-200' : 'bg-blue-500'}`}
      >
        <Text className={`text-xs font-medium ${isSyncing ? 'text-gray-400' : 'text-white'}`}>
          🔄 Синхронизация
        </Text>
      </TouchableOpacity>
    </View>
  );
};
