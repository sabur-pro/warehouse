// src/components/history/HistoryContent.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
  RefreshControl,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useDatabase } from '../../../hooks/useDatabase';
import { Transaction } from '../../../database/types';
import TransactionDetailsModal from '../../../components/TransactionDetailsModal';
import { GroupedTransaction } from '../../../components/TransactionsList';

const ITEM_LIMIT = 50;

const HistoryContent: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [groupedTransactions, setGroupedTransactions] = useState<GroupedTransaction[]>([]);
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

      if (currentTx.action === 'sale' || currentTx.action === 'update' || currentTx.action === 'wholesale') {
        const relatedTransactions: Transaction[] = [currentTx];

        for (let j = i + 1; j < txs.length; j++) {
          if (processedIds.has(txs[j].id)) continue;

          if (txs[j].itemId === currentTx.itemId &&
            Math.abs(txs[j].timestamp - currentTx.timestamp) < 5) {
            relatedTransactions.push(txs[j]);
            processedIds.add(txs[j].id);
          }
        }

        if (relatedTransactions.length > 1) {
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

    console.log('HistoryContent: Loading transactions, isLoadMore:', isLoadMore, 'isRefresh:', isRefresh, 'offset:', offset);

    if (!isLoadMore && !isRefresh) {
      setInitialLoading(true);
      setOffset(0); // Сбрасываем offset для нового поиска
    } else if (isLoadMore) {
      setLoadingMore(true);
    } else if (isRefresh) {
      setRefreshing(true);
      setOffset(0); // Сбрасываем offset для обновления
    }

    try {
      const currentOffset = isLoadMore ? offset : 0;
      const { transactions: newTransactions, hasMore: more } = await getTransactionsPage(ITEM_LIMIT, currentOffset);

      console.log('HistoryContent: Received', newTransactions.length, 'transactions, hasMore:', more);

      const allTransactions = (isLoadMore && !isRefresh) ? [...transactions, ...newTransactions] : newTransactions;
      setTransactions(allTransactions);

      const grouped = groupRelatedTransactions(allTransactions);
      setGroupedTransactions(grouped);

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
  }, [getTransactionsPage, transactions, offset, loadingMore, refreshing]);

  useEffect(() => {
    loadTransactions(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const renderTransactionItem = ({ item }: { item: GroupedTransaction }) => {
    // Parse details to check for special types
    const parsedDetails = parseDetailsType(item.transactions[0].details);

    // Для группированных транзакций определяем главный тип
    let mainAction = item.transactions[0].action;
    let actionText = getActionText(mainAction);
    let icon: keyof typeof MaterialIcons.glyphMap;
    let color: string;
    let borderStyle = {};

    // Check for admin_approved types first
    if (parsedDetails.detailsType === 'admin_approved_sale_deletion') {
      icon = 'restore';
      color = '#22c55e';
      actionText = 'Возврат продажи';
      borderStyle = { borderLeftWidth: 4, borderLeftColor: '#22c55e' };
    } else if (parsedDetails.detailsType === 'admin_approved_delete') {
      icon = 'delete-forever';
      color = '#ef4444';
      actionText = 'Удаление (одобрено)';
    } else if (parsedDetails.detailsType === 'admin_approved_update') {
      icon = 'check-circle';
      color = '#3b82f6';
      actionText = 'Обновление (одобрено)';
    } else {
      if (item.type === 'grouped') {
        const wholesaleTx = item.transactions.find(tx => tx.action === 'wholesale');
        const saleTx = item.transactions.find(tx => tx.action === 'sale');

        if (wholesaleTx) {
          mainAction = 'wholesale';
          actionText = 'Продажа оптом';
        } else if (saleTx) {
          mainAction = 'sale';
          actionText = 'Продажа';
        }
      }
      const iconData = getActionIconAndColor(mainAction);
      icon = iconData.icon;
      color = iconData.color;
    }

    const formattedTime = new Date(item.transactions[0].timestamp * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

    return (
      <TouchableOpacity onPress={() => handleTransactionPress(item)} activeOpacity={0.7}>
        <View style={[styles.transactionItem, item.type === 'grouped' && styles.groupedTransactionItem, borderStyle]}>
          <View style={[styles.iconContainer, { backgroundColor: `${color}20` }]}>
            <MaterialIcons name={icon} size={24} color={color} />
          </View>
          <View style={styles.content}>
            <Text style={styles.actionText}>{actionText}</Text>
            <Text style={styles.itemName} numberOfLines={1}>{item.transactions[0].itemName}</Text>
            <Text style={styles.details} numberOfLines={1}>
              {item.transactions.length > 1
                ? (mainAction === 'wholesale' ? 'Оптовая продажа и обновление' : 'Продажа и обновление') + ` - ${item.transactions.length} действия`
                : parsedDetails.text
              }
            </Text>
            <Text style={styles.time}>{formattedTime}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color="#10b981" />
        <Text style={styles.footerText}>Загрузка...</Text>
      </View>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <MaterialIcons name="history" size={64} color="#d1d5db" />
      <Text style={styles.emptyText}>История пуста</Text>
      <Text style={styles.emptySubtext}>Начните добавлять товары для отслеживания действий</Text>
    </View>
  );

  if (initialLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10b981" />
        <Text style={styles.loadingText}>Загрузка истории...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={groupedTransactions}
        renderItem={renderTransactionItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={groupedTransactions.length === 0 ? styles.emptyListContent : styles.listContent}
        showsVerticalScrollIndicator={false}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.1}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#10b981']}
            tintColor="#10b981"
            title="Обновление истории..."
            titleColor="#6b7280"
          />
        }
      />

      {selectedGroup && (
        <TransactionDetailsModal
          groupedTransaction={selectedGroup}
          visible={detailsVisible}
          onClose={() => {
            setDetailsVisible(false);
            setSelectedGroup(null);
          }}
          onTransactionDeleted={() => loadTransactions(false, false)}
        />
      )}
    </View>
  );
};

// Helper functions
const getActionIconAndColor = (action: Transaction['action']): { icon: keyof typeof MaterialIcons.glyphMap; color: string } => {
  switch (action) {
    case 'sale':
      return { icon: 'shopping-cart', color: '#8b5cf6' };
    case 'wholesale':
      return { icon: 'store', color: '#f59e0b' };
    case 'create':
      return { icon: 'add', color: '#10b981' };
    case 'update':
      return { icon: 'shopping-cart', color: '#8b5cf6' };
    case 'delete':
      return { icon: 'delete', color: '#ef4444' };
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
      return 'Продажа';
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

const styles = StyleSheet.create({
  container: {
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
    color: '#6b7280',
  },
  listContent: {
    padding: 16,
  },
  emptyListContent: {
    flexGrow: 1,
    padding: 16,
  },
  transactionItem: {
    flexDirection: 'row',
    backgroundColor: '#fff',
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
    borderLeftWidth: 4,
    borderLeftColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  content: {
    flex: 1,
  },
  actionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  itemName: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 2,
  },
  details: {
    fontSize: 12,
    color: '#9ca3af',
    marginBottom: 4,
  },
  time: {
    fontSize: 12,
    color: '#9ca3af',
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
  },
  footerText: {
    marginLeft: 8,
    color: '#6b7280',
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
    color: '#374151',
    marginTop: 16,
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
});

export default HistoryContent;

