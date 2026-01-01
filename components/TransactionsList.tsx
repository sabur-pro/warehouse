// components/TransactionsList.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Dimensions,
  Alert,
  Modal,
  RefreshControl,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useDatabase } from '../hooks/useDatabase';
import { Transaction } from '../database/types';
import TransactionDetailsModal from './TransactionDetailsModal';
import { useTheme } from '../src/contexts/ThemeContext';
import { getThemeColors } from '../constants/theme';

const { width: screenWidth } = Dimensions.get('window');
const ITEM_LIMIT = 50;

interface DayGroup {
  day: string; // 'YYYY-MM-DD'
  transactions: Transaction[];
}

export interface GroupedTransaction {
  id: string;
  type: 'single' | 'grouped';
  transactions: Transaction[];
  timestamp: number;
  itemName: string;
}

const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString('ru-RU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const getDayKey = (timestamp: number): string => {
  const date = new Date(timestamp * 1000);
  return date.toISOString().split('T')[0]; // YYYY-MM-DD
};

const groupTransactionsByDay = (transactions: Transaction[]): DayGroup[] => {
  const groups: { [key: string]: Transaction[] } = {};
  transactions.forEach((tx) => {
    const dayKey = getDayKey(tx.timestamp);
    if (!groups[dayKey]) {
      groups[dayKey] = [];
    }
    groups[dayKey].push(tx);
  });

  return Object.entries(groups)
    .map(([day, txs]) => ({
      day,
      transactions: txs.sort((a, b) => b.timestamp - a.timestamp), // Within day, newest first
    }))
    .sort((a, b) => new Date(b.day).getTime() - new Date(a.day).getTime()); // Days descending
};

const getActionIconAndColor = (action: Transaction['action']): { icon: keyof typeof MaterialIcons.glyphMap; color: string } => {
  switch (action) {
    case 'sale':
      return { icon: 'shopping-cart', color: '#8b5cf6' }; // Purple for sales
    case 'wholesale':
      return { icon: 'store', color: '#f59e0b' }; // Orange for wholesale
    case 'create':
      return { icon: 'add', color: '#10b981' }; // Green for creation
    case 'update':
      return { icon: 'shopping-cart', color: '#8b5cf6' }; // Same as sale
    case 'delete':
      return { icon: 'delete', color: '#ef4444' }; // Red for deletion
    default:
      return { icon: 'history', color: '#6b7280' };
  }
};

const getActionText = (action: Transaction['action']): string => {
  switch (action) {
    case 'sale':
      return 'Продажа';
    case 'wholesale':
      return 'Продажа оптом';
    case 'create':
      return 'Создание';
    case 'update':
      return 'Продажа'; // Changed to Продажа
    case 'delete':
      return 'Удаление';
    default:
      return 'Действие';
  }
};

const parseDetailsType = (details: string | null | undefined): { text: string; detailsType?: string } => {
  if (!details) return { text: 'Детали' };
  try {
    const parsed = JSON.parse(details);
    if (parsed.type === 'admin_approved_sale_deletion') {
      const saleInfo = parsed.deletedTransaction?.details?.sale;
      return {
        text: `Возврат - Размер ${saleInfo?.size || 'N/A'}, ${parsed.restoredQuantity || 1} шт.`,
        detailsType: 'admin_approved_sale_deletion'
      };
    } else if (parsed.type === 'admin_approved_delete') {
      return { text: 'Удаление товара (одобрено)', detailsType: 'admin_approved_delete' };
    } else if (parsed.type === 'admin_approved_update') {
      return { text: 'Обновление (одобрено)', detailsType: 'admin_approved_update' };
    } else if (parsed.type === 'sale' || parsed.type === 'update') {
      return { text: `Продажа - Размер ${parsed.size || parsed.sale?.size || 'N/A'}` };
    } else if (parsed.type === 'wholesale') {
      return { text: `Оптовая продажа - ${parsed.wholesale?.totalBoxes || 0} коробок` };
    } else if (parsed.type === 'create') {
      return { text: `Создание - ${parsed.initialSizes?.length || 0} размеров` };
    } else if (parsed.type === 'delete') {
      return { text: `Удаление - ${parsed.finalSizes?.length || 0} размеров` };
    }
    return { text: parsed.type ? `${parsed.type}` : 'Детали' };
  } catch {
    return { text: details.substring(0, 30) + '...' };
  }
};

const TransactionItem: React.FC<{
  transaction: Transaction;
  onPress: (group: GroupedTransaction) => void;
  colors: ReturnType<typeof getThemeColors>;
}> = ({ transaction, onPress, colors }) => {
  const parsedDetails = parseDetailsType(transaction.details);

  // Определяем иконку и цвет на основе details.type
  let icon: keyof typeof MaterialIcons.glyphMap;
  let color: string;
  let actionText: string;

  if (parsedDetails.detailsType === 'admin_approved_sale_deletion') {
    icon = 'restore';
    color = '#22c55e'; // Green
    actionText = 'Возврат продажи';
  } else if (parsedDetails.detailsType === 'admin_approved_delete') {
    icon = 'delete-forever';
    color = '#ef4444';
    actionText = 'Удаление (одобрено)';
  } else if (parsedDetails.detailsType === 'admin_approved_update') {
    icon = 'check-circle';
    color = '#3b82f6';
    actionText = 'Обновление (одобрено)';
  } else {
    const iconData = getActionIconAndColor(transaction.action);
    icon = iconData.icon;
    color = iconData.color;
    actionText = getActionText(transaction.action);
  }

  const formattedTime = new Date(transaction.timestamp * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const group: GroupedTransaction = {
    id: `single-${transaction.id}`,
    type: 'single',
    transactions: [transaction],
    timestamp: transaction.timestamp,
    itemName: transaction.itemName,
  };

  return (
    <TouchableOpacity onPress={() => onPress(group)} activeOpacity={0.7}>
      <View style={[
        styles.transactionItem,
        { backgroundColor: colors.background.card },
        parsedDetails.detailsType === 'admin_approved_sale_deletion' && { borderLeftWidth: 4, borderLeftColor: '#22c55e' }
      ]}>
        <View style={[styles.iconContainer, { backgroundColor: `${color}20` }]}>
          <MaterialIcons name={icon} size={24} color={color} />
        </View>
        <View style={styles.content}>
          <Text style={[styles.actionText, { color: colors.text.normal }]}>{actionText}</Text>
          <Text style={[styles.itemName, { color: colors.text.muted }]} numberOfLines={1}>{transaction.itemName}</Text>
          <Text style={[styles.details, { color: colors.text.muted }]} numberOfLines={1}>
            {parsedDetails.text}
          </Text>
          <Text style={[styles.time, { color: colors.text.muted }]}>{formattedTime}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const GroupedTransactionItem: React.FC<{
  transactions: Transaction[];
  onPress: (group: GroupedTransaction) => void;
  colors: ReturnType<typeof getThemeColors>;
}> = ({ transactions, onPress, colors }) => {
  const mainTransaction = transactions[0];

  // Определяем тип группированной транзакции
  const wholesaleTx = transactions.find(tx => tx.action === 'wholesale');
  const saleTx = transactions.find(tx => tx.action === 'sale');

  let mainAction: Transaction['action'] = 'update';
  let actionText = 'Продажа';

  if (wholesaleTx) {
    mainAction = 'wholesale';
    actionText = 'Продажа оптом';
  } else if (saleTx) {
    mainAction = 'sale';
    actionText = 'Продажа';
  }

  const { icon, color } = getActionIconAndColor(mainAction);
  const formattedTime = new Date(mainTransaction.timestamp * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const group: GroupedTransaction = {
    id: `group-${mainTransaction.id}`,
    type: 'grouped',
    transactions,
    timestamp: mainTransaction.timestamp,
    itemName: mainTransaction.itemName,
  };

  return (
    <TouchableOpacity onPress={() => onPress(group)} activeOpacity={0.7}>
      <View style={[styles.groupedTransactionItem, { backgroundColor: colors.background.card }]}>
        <View style={[styles.iconContainer, { backgroundColor: `${color}20` }]}>
          <MaterialIcons name={icon} size={24} color={color} />
        </View>
        <View style={styles.content}>
          <Text style={[styles.actionText, { color: colors.text.normal }]}>{actionText}</Text>
          <Text style={[styles.itemName, { color: colors.text.muted }]} numberOfLines={1}>{mainTransaction.itemName}</Text>
          <Text style={[styles.details, { color: colors.text.muted }]} numberOfLines={1}>
            {transactions.length > 1
              ? (mainAction === 'wholesale' ? 'Оптовая продажа и обновление' : 'Продажа и обновление') + ` - ${transactions.length} действия`
              : parseDetailsType(mainTransaction.details).text
            }
          </Text>
          <Text style={[styles.time, { color: colors.text.muted }]}>{formattedTime}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const DaySectionHeader: React.FC<{ day: string }> = ({ day }) => (
  <View style={styles.dayHeader}>
    <Text style={styles.dayTitle}>{day}</Text>
  </View>
);

interface TransactionsListProps {
  onClose: () => void;
}

const TransactionsList: React.FC<TransactionsListProps> = ({ onClose }) => {
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [groupedTransactions, setGroupedTransactions] = useState<GroupedTransaction[]>([]);
  const [dayGroups, setDayGroups] = useState<DayGroup[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [selectedGroup, setSelectedGroup] = useState<GroupedTransaction | null>(null);
  const [detailsVisible, setDetailsVisible] = useState(false);
  const { getTransactionsPage, clearTransactions } = useDatabase();

  const groupRelatedTransactions = (txs: Transaction[]): GroupedTransaction[] => {
    const result: GroupedTransaction[] = [];
    const processedIds = new Set<number>();

    for (let i = 0; i < txs.length; i++) {
      if (processedIds.has(txs[i].id)) continue;

      const currentTx = txs[i];

      // Check if this is a sale/update/wholesale transaction that might have a related update
      if (currentTx.action === 'sale' || currentTx.action === 'update' || currentTx.action === 'wholesale') {
        // Try to find related transactions (same item, around the same time)
        const relatedTransactions: Transaction[] = [currentTx];

        for (let j = i + 1; j < txs.length; j++) {
          if (processedIds.has(txs[j].id)) continue;

          // Check if transactions are related (same item and within 5 seconds)
          if (txs[j].itemId === currentTx.itemId &&
            Math.abs(txs[j].timestamp - currentTx.timestamp) < 5) {
            relatedTransactions.push(txs[j]);
            processedIds.add(txs[j].id);
          }
        }

        if (relatedTransactions.length > 1) {
          // Group related transactions
          result.push({
            id: `group-${currentTx.id}`,
            type: 'grouped',
            transactions: relatedTransactions,
            timestamp: currentTx.timestamp,
            itemName: currentTx.itemName
          });
          processedIds.add(currentTx.id);
          continue;
        }
      }

      // Single transaction
      result.push({
        id: `single-${currentTx.id}`,
        type: 'single',
        transactions: [currentTx],
        timestamp: currentTx.timestamp,
        itemName: currentTx.itemName
      });
      processedIds.add(currentTx.id);
    }

    return result.sort((a, b) => b.timestamp - a.timestamp);
  };

  const loadTransactions = useCallback(async (isLoadMore = false, isRefresh = false) => {
    if (isLoadMore && loadingMore) return;
    if (isRefresh && refreshing) return;

    if (!isLoadMore && !isRefresh) {
      setInitialLoading(true);
      setOffset(0);
    } else if (isLoadMore) {
      setLoadingMore(true);
    } else if (isRefresh) {
      setRefreshing(true);
      setOffset(0);
    }

    try {
      const currentOffset = isLoadMore ? offset : 0;
      const { transactions: newTransactions, hasMore: more } = await getTransactionsPage(ITEM_LIMIT, currentOffset);
      const allTransactions = (isLoadMore && !isRefresh) ? [...transactions, ...newTransactions] : newTransactions;
      setTransactions(allTransactions);

      // Group related transactions
      const grouped = groupRelatedTransactions(allTransactions);
      setGroupedTransactions(grouped);

      // Also maintain day groups for backward compatibility
      setDayGroups(groupTransactionsByDay(allTransactions));

      if (!isLoadMore || isRefresh) {
        setOffset(newTransactions.length);
      } else {
        setOffset(prev => prev + newTransactions.length);
      }
      setHasMore(more && newTransactions.length > 0);
    } catch (error) {
      console.error('Failed to load transactions:', error);
      Alert.alert('Ошибка', 'Не удалось загрузить историю');
    } finally {
      if (!isLoadMore && !isRefresh) {
        setInitialLoading(false);
      } else if (isLoadMore) {
        setLoadingMore(false);
      } else if (isRefresh) {
        setRefreshing(false);
      }
    }
  }, [offset, transactions.length, loadingMore, refreshing]);

  useEffect(() => {
    loadTransactions(false);
  }, []);

  const handleLoadMore = () => {
    if (hasMore && !loadingMore) {
      loadTransactions(true, false);
    }
  };

  const handleRefresh = () => {
    loadTransactions(false, true);
  };

  const handleTransactionPress = (group: GroupedTransaction) => {
    setSelectedGroup(group);
    setDetailsVisible(true);
  };

  const handleClearHistory = () => {
    Alert.alert(
      'Очистить историю?',
      'Все записи об изменениях будут удалены. Это действие нельзя отменить.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Очистить',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearTransactions();
              setTransactions([]);
              setGroupedTransactions([]);
              setDayGroups([]);
              setOffset(0);
              setHasMore(false);
              Alert.alert('Успех', 'История очищена');
            } catch (error) {
              console.error('Failed to clear transactions:', error);
              Alert.alert('Ошибка', 'Не удалось очистить историю');
            }
          }
        }
      ]
    );
  };

  const renderTransactionItem = ({ item }: { item: GroupedTransaction }) => {
    if (item.type === 'grouped') {
      return <GroupedTransactionItem transactions={item.transactions} onPress={handleTransactionPress} colors={colors} />;
    } else {
      return <TransactionItem transaction={item.transactions[0]} onPress={handleTransactionPress} colors={colors} />;
    }
  };

  const keyExtractor = (item: GroupedTransaction) => item.id;
  const groupKeyExtractor = (item: DayGroup) => item.day;

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color={isDark ? colors.primary.gold : '#10b981'} />
        <Text style={[styles.footerText, { color: colors.text.muted }]}>Загрузка...</Text>
      </View>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <MaterialIcons name="history" size={48} color={isDark ? '#4a4a4a' : '#d1d5db'} />
      <Text style={[styles.emptyText, { color: colors.text.normal }]}>История пуста</Text>
      <Text style={[styles.emptySubtext, { color: colors.text.muted }]}>Начните добавлять товары для отслеживания действий</Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background.screen }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: isDark ? colors.primary.gold : '#10b981' }]}>
        <TouchableOpacity onPress={onClose} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>История действий</Text>
        <TouchableOpacity onPress={handleClearHistory} style={styles.clearButton}>
          <MaterialIcons name="delete-sweep" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {initialLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={isDark ? colors.primary.gold : '#10b981'} />
            <Text style={[styles.loadingText, { color: colors.text.muted }]}>Загрузка истории...</Text>
          </View>
        ) : groupedTransactions.length === 0 ? (
          renderEmpty()
        ) : (
          <FlatList
            data={groupedTransactions}
            renderItem={renderTransactionItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.1}
            ListFooterComponent={renderFooter}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                colors={[isDark ? colors.primary.gold : '#10b981']}
                tintColor={isDark ? colors.primary.gold : '#10b981'}
                title="Обновление истории..."
                titleColor={colors.text.muted}
              />
            }
          />
        )}
      </View>

      {selectedGroup && (
        <TransactionDetailsModal
          groupedTransaction={selectedGroup}
          visible={detailsVisible}
          onClose={() => {
            setDetailsVisible(false);
            setSelectedGroup(null);
          }}
          onTransactionDeleted={() => loadTransactions(false)}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },
  clearButton: {
    padding: 4,
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
  },
  listContent: {
    padding: 16,
  },
  dayHeader: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderLeftWidth: 4,
    borderLeftColor: '#10b981',
    backgroundColor: '#f3f4f6',
    marginBottom: 8,
  },
  dayTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  transactionItem: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  groupedTransactionItem: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    borderLeftWidth: 4,
    borderLeftColor: '#8b5cf6',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  actionText: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  itemName: {
    fontSize: 14,
    marginBottom: 2,
  },
  details: {
    fontSize: 12,
    marginBottom: 4,
  },
  time: {
    fontSize: 12,
    fontWeight: '500',
  },
  sectionList: {
    marginBottom: 16,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
  },
  footerText: {
    marginLeft: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
  },
});


export default TransactionsList;