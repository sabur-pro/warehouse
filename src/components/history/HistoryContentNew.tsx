// src/components/history/HistoryContentNew.tsx
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
  TextInput,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useDatabase } from '../../../hooks/useDatabase';
import { Transaction } from '../../../database/types';
import TransactionDetailsModal from '../../../components/TransactionDetailsModal';
import { GroupedTransaction } from '../../../components/TransactionsList';
import { useTheme } from '../../contexts/ThemeContext';
import { getThemeColors } from '../../../constants/theme';

const ITEM_LIMIT = 50;

interface DateGroup {
  date: string;
  dateObj: Date;
  weekDay: string;
  transactions: GroupedTransaction[];
}

const HistoryContentNew: React.FC = () => {
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);

  const [dateGroups, setDateGroups] = useState<DateGroup[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [selectedGroup, setSelectedGroup] = useState<GroupedTransaction | null>(null);
  const [detailsVisible, setDetailsVisible] = useState(false);

  // Поиск и фильтрация
  const [searchQuery, setSearchQuery] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [filterDate, setFilterDate] = useState<Date | null>(null);

  const { getTransactionsPage, searchTransactions, filterTransactionsByDate } = useDatabase();

  // Группировка транзакций по датам
  const groupTransactionsByDate = (txs: Transaction[]): DateGroup[] => {
    const grouped: { [key: string]: { dateObj: Date; transactions: GroupedTransaction[] } } = {};

    // Сначала группируем связанные транзакции
    const groupedTxs = groupRelatedTransactions(txs);

    // Затем группируем по датам
    groupedTxs.forEach(tx => {
      const date = new Date(tx.timestamp * 1000);
      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

      if (!grouped[dateKey]) {
        grouped[dateKey] = {
          dateObj: date,
          transactions: []
        };
      }

      grouped[dateKey].transactions.push(tx);
    });

    // Конвертируем в массив и сортируем
    const result: DateGroup[] = Object.entries(grouped).map(([dateKey, data]) => {
      const weekDays = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
      const weekDay = weekDays[data.dateObj.getDay()];

      return {
        date: dateKey,
        dateObj: data.dateObj,
        weekDay,
        transactions: data.transactions.sort((a, b) => b.timestamp - a.timestamp)
      };
    });

    return result.sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());
  };

  const groupRelatedTransactions = (txs: Transaction[]): GroupedTransaction[] => {
    // Создаем карту всех транзакций для быстрого поиска
    const txMap = new Map<number, Transaction>();
    txs.forEach(tx => txMap.set(tx.id, tx));

    const result: GroupedTransaction[] = [];
    const processedIds = new Set<number>();

    for (let i = 0; i < txs.length; i++) {
      if (processedIds.has(txs[i].id)) continue;

      const currentTx = txs[i];
      const relatedTransactions: Transaction[] = [currentTx];
      processedIds.add(currentTx.id);

      // Ищем ВСЕ связанные транзакции с тем же itemId и близким временем
      for (let j = 0; j < txs.length; j++) {
        if (i === j || processedIds.has(txs[j].id)) continue;

        const otherTx = txs[j];

        // Проверяем: тот же товар + время в пределах 5 секунд
        if (otherTx.itemId === currentTx.itemId &&
          Math.abs(otherTx.timestamp - currentTx.timestamp) < 5) {
          relatedTransactions.push(otherTx);
          processedIds.add(otherTx.id);
        }
      }

      // Сортируем связанные транзакции по приоритету (sale/wholesale сначала)
      relatedTransactions.sort((a, b) => {
        const priority = { wholesale: 0, sale: 1, update: 2, create: 3, delete: 4 };
        const aPriority = priority[a.action] ?? 5;
        const bPriority = priority[b.action] ?? 5;
        return aPriority - bPriority;
      });

      if (relatedTransactions.length > 1) {
        result.push({
          id: `group-${relatedTransactions.map(t => t.id).join('-')}`,
          type: 'grouped',
          transactions: relatedTransactions,
          timestamp: currentTx.timestamp,
          itemName: currentTx.itemName
        });
      } else {
        result.push({
          id: `single-${currentTx.id}`,
          type: 'single',
          transactions: [currentTx],
          timestamp: currentTx.timestamp,
          itemName: currentTx.itemName
        });
      }
    }

    return result;
  };

  const loadTransactions = useCallback(async (isLoadMore = false, isRefresh = false) => {
    if (isLoadMore && loadingMore) return;
    if (isRefresh && refreshing) return;

    const hasSearch = searchQuery.trim().length > 0;
    const hasDateFilter = filterDate !== null;
    console.log('Loading transactions, hasSearch:', hasSearch, 'hasDateFilter:', hasDateFilter, 'isLoadMore:', isLoadMore, 'offset:', offset);

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
      let result: { transactions: Transaction[]; hasMore: boolean };

      const hasSearch = searchQuery.trim().length > 0;
      const hasDateFilter = filterDate !== null;

      // Комбинированный фильтр: поиск + дата
      if (hasSearch && hasDateFilter) {
        const startOfDay = new Date(filterDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(filterDate);
        endOfDay.setHours(23, 59, 59, 999);

        const startTimestamp = Math.floor(startOfDay.getTime() / 1000);
        const endTimestamp = Math.floor(endOfDay.getTime() / 1000);

        // Сначала фильтруем по дате, потом по поиску на клиенте
        const dateResult = await filterTransactionsByDate(startTimestamp, endTimestamp, 1000, 0);
        const filtered = dateResult.transactions.filter(tx =>
          tx.itemName.toLowerCase().includes(searchQuery.trim().toLowerCase())
        );
        const paginated = filtered.slice(currentOffset, currentOffset + ITEM_LIMIT);
        result = {
          transactions: paginated,
          hasMore: filtered.length > currentOffset + ITEM_LIMIT
        };
      } else if (hasSearch) {
        result = await searchTransactions(searchQuery.trim(), ITEM_LIMIT, currentOffset);
      } else if (hasDateFilter) {
        const startOfDay = new Date(filterDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(filterDate);
        endOfDay.setHours(23, 59, 59, 999);

        const startTimestamp = Math.floor(startOfDay.getTime() / 1000);
        const endTimestamp = Math.floor(endOfDay.getTime() / 1000);

        result = await filterTransactionsByDate(startTimestamp, endTimestamp, ITEM_LIMIT, currentOffset);
      } else {
        result = await getTransactionsPage(ITEM_LIMIT, currentOffset);
      }

      console.log('Received', result.transactions.length, 'transactions, hasMore:', result.hasMore);

      const allTransactions = (isLoadMore && !isRefresh) ? [...transactions, ...result.transactions] : result.transactions;
      setTransactions(allTransactions);

      const grouped = groupTransactionsByDate(allTransactions);
      setDateGroups(grouped);

      if (!isLoadMore || isRefresh) {
        setOffset(result.transactions.length);
      } else {
        setOffset(prev => prev + result.transactions.length);
      }
      setHasMore(result.hasMore && result.transactions.length > 0);
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
  }, [getTransactionsPage, searchTransactions, filterTransactionsByDate, loadingMore, refreshing, searchQuery, filterDate, offset]);

  useEffect(() => {
    loadTransactions(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Автоматическое обновление при изменении поиска или фильтра
  useEffect(() => {
    const hasFilters = searchQuery.trim().length > 0 || filterDate !== null;
    if (hasFilters) {
      setTransactions([]);
      setOffset(0);
      setHasMore(true);
      loadTransactions(false, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, filterDate]);

  const handleLoadMore = () => {
    if (hasMore && !loadingMore) {
      loadTransactions(true, false);
    }
  };

  const handleRefresh = () => {
    loadTransactions(false, true);
  };

  const handleSearch = () => {
    // Просто сбрасываем offset, useEffect сделает загрузку
    if (searchQuery.trim()) {
      setTransactions([]);
      setOffset(0);
      setHasMore(true);
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setTransactions([]);
    setOffset(0);
    setHasMore(true);
    // Если есть фильтр по дате, useEffect перезагрузит с датой
    // Если нет фильтров, загружаем вручную
    if (!filterDate) {
      loadTransactions(false, false);
    }
  };

  const handleDateFilter = (selectedDate: Date) => {
    setShowDatePicker(false);
    setFilterDate(selectedDate);
    setTransactions([]);
    setOffset(0);
    setHasMore(true);
    // useEffect сделает загрузку автоматически
  };

  const handleClearDateFilter = () => {
    setFilterDate(null);
    setTransactions([]);
    setOffset(0);
    setHasMore(true);
    // Если есть поиск, useEffect перезагрузит с поиском
    // Если нет фильтров, загружаем вручную
    if (!searchQuery.trim()) {
      loadTransactions(false, false);
    }
  };

  const handleTransactionPress = (group: GroupedTransaction) => {
    setSelectedGroup(group);
    setDetailsVisible(true);
  };

  const renderDateHeader = (dateGroup: DateGroup) => {
    const formattedDate = `${dateGroup.dateObj.getDate()} ${getMonthName(dateGroup.dateObj.getMonth())} ${dateGroup.dateObj.getFullYear()}`;

    return (
      <View style={[styles.dateHeader, { borderBottomColor: isDark ? colors.primary.gold : '#10b981' }]}>
        <Text style={[styles.dateText, { color: colors.text.normal }]}>{formattedDate}</Text>
        <Text style={[styles.weekDayText, { color: colors.text.muted }]}>{dateGroup.weekDay}</Text>
      </View>
    );
  };

  const renderTransactionItem = (item: GroupedTransaction) => {
    let mainAction = item.transactions[0].action;
    let actionText = getActionText(mainAction);

    let isPriceUpdate = false;
    let isRegularUpdate = false;

    // СНАЧАЛА проверяем grouped транзакции (приоритет у продажи!)
    if (item.type === 'grouped') {
      const wholesaleTx = item.transactions.find(tx => tx.action === 'wholesale');
      // Проверяем как action='sale', так и action='update' с details.sale
      const saleTx = item.transactions.find(tx => {
        if (tx.action === 'sale') return true;
        if (tx.action === 'update') {
          try {
            const details = JSON.parse(tx.details || '{}');
            return details.sale !== undefined;
          } catch {
            return false;
          }
        }
        return false;
      });

      if (wholesaleTx) {
        mainAction = 'wholesale';
        actionText = 'Продажа оптом';
      } else if (saleTx) {
        mainAction = 'sale';
        actionText = 'Продажа';
      }
    } else {
      // ТОЛЬКО для одиночных транзакций проверяем детали
      try {
        const details = JSON.parse(item.transactions[0].details || '{}');
        if (details.type === 'price_update') {
          isPriceUpdate = true;
          actionText = 'Обновление цены';
        } else if (details.type === 'update' && details.changes && details.changes.length > 0) {
          isRegularUpdate = true;
          actionText = 'Обновление';
        }
      } catch { }
    }

    // Получаем иконку и цвет
    let icon: keyof typeof MaterialIcons.glyphMap;
    let color: string;

    if (isPriceUpdate) {
      icon = 'edit';
      color = '#3b82f6';
    } else if (isRegularUpdate) {
      icon = 'sync';
      color = '#f59e0b';
    } else {
      const iconData = getActionIconAndColor(mainAction);
      icon = iconData.icon;
      color = iconData.color;
    }
    const formattedTime = new Date(item.transactions[0].timestamp * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

    return (
      <TouchableOpacity onPress={() => handleTransactionPress(item)} activeOpacity={0.7}>
        <View style={[
          styles.transactionItem,
          { backgroundColor: colors.background.card },
          item.type === 'grouped' && styles.groupedTransactionItem
        ]}>
          <View style={[styles.iconContainer, { backgroundColor: `${color}20` }]}>
            <MaterialIcons name={icon} size={24} color={color} />
          </View>
          <View style={styles.content}>
            <Text style={[styles.actionText, { color: colors.text.normal }]}>{actionText}</Text>
            <Text style={[styles.itemName, { color: colors.text.muted }]} numberOfLines={1}>{item.transactions[0].itemName}</Text>
            <Text style={[styles.details, { color: colors.text.muted }]} numberOfLines={1}>
              {item.transactions.length > 1
                ? (mainAction === 'wholesale' ? 'Оптовая продажа и обновление' : 'Продажа и обновление') + ` - ${item.transactions.length} действия`
                : parseDetailsType(item.transactions[0].details)
              }
            </Text>
            <Text style={[styles.time, { color: colors.text.muted }]}>{formattedTime}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderDateGroup = ({ item }: { item: DateGroup }) => {
    return (
      <View style={styles.dateGroupContainer}>
        {renderDateHeader(item)}
        {item.transactions.map(tx => (
          <View key={tx.id}>
            {renderTransactionItem(tx)}
          </View>
        ))}
      </View>
    );
  };

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color={isDark ? colors.primary.gold : '#10b981'} />
        <Text style={[styles.footerText, { color: colors.text.muted }]}>Загрузка...</Text>
      </View>
    );
  };

  const renderEmpty = () => {
    const hasSearch = searchQuery.trim().length > 0;
    const hasDateFilter = filterDate !== null;
    const hasFilters = hasSearch || hasDateFilter;

    return (
      <View style={styles.emptyContainer}>
        <MaterialIcons name="history" size={64} color={isDark ? '#4a4a4a' : '#d1d5db'} />
        <Text style={[styles.emptyText, { color: colors.text.normal }]}>
          {hasFilters ? 'Ничего не найдено' : 'История пуста'}
        </Text>
        <Text style={[styles.emptySubtext, { color: colors.text.muted }]}>
          {hasFilters ? 'Попробуйте другой запрос или фильтр' : 'Начните добавлять товары для отслеживания действий'}
        </Text>
      </View>
    );
  };

  if (initialLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={isDark ? colors.primary.gold : '#10b981'} />
        <Text style={[styles.loadingText, { color: colors.text.muted }]}>Загрузка истории...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Панель поиска и фильтров */}
      <View style={[styles.searchContainer, {
        backgroundColor: colors.background.card,
        borderBottomColor: colors.border.normal
      }]}>
        <View style={[styles.searchInputContainer, {
          backgroundColor: isDark ? colors.background.light : '#f3f4f6'
        }]}>
          <MaterialIcons name="search" size={20} color={colors.text.muted} style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { color: colors.text.normal }]}
            placeholder="Поиск по названию товара..."
            placeholderTextColor={colors.text.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={handleClearSearch} style={styles.clearButton}>
              <MaterialIcons name="close" size={20} color={colors.text.muted} />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          onPress={() => setShowDatePicker(true)}
          style={[styles.filterButton, {
            backgroundColor: isDark ? colors.background.light : '#f3f4f6'
          }]}
        >
          <MaterialIcons
            name="event"
            size={24}
            color={filterDate ? (isDark ? colors.primary.gold : '#10b981') : colors.text.muted}
          />
        </TouchableOpacity>
      </View>

      {/* Активные фильтры */}
      {(searchQuery.trim().length > 0 || filterDate !== null) && (
        <View style={[styles.activeFiltersContainer, { backgroundColor: colors.background.screen }]}>
          {searchQuery.trim().length > 0 && (
            <View style={[styles.filterChip, {
              backgroundColor: isDark ? 'rgba(212, 175, 55, 0.2)' : '#d1fae5'
            }]}>
              <Text style={[styles.filterChipText, {
                color: isDark ? colors.primary.gold : '#065f46'
              }]}>Поиск: {searchQuery}</Text>
              <TouchableOpacity onPress={handleClearSearch}>
                <MaterialIcons name="close" size={16} color={isDark ? colors.primary.gold : '#10b981'} />
              </TouchableOpacity>
            </View>
          )}
          {filterDate && (
            <View style={[styles.filterChip, {
              backgroundColor: isDark ? 'rgba(212, 175, 55, 0.2)' : '#d1fae5'
            }]}>
              <Text style={[styles.filterChipText, {
                color: isDark ? colors.primary.gold : '#065f46'
              }]}>
                Дата: {filterDate.getDate()} {getMonthName(filterDate.getMonth())}
              </Text>
              <TouchableOpacity onPress={handleClearDateFilter}>
                <MaterialIcons name="close" size={16} color={isDark ? colors.primary.gold : '#10b981'} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      <FlatList
        data={dateGroups}
        renderItem={renderDateGroup}
        keyExtractor={(item) => item.date}
        contentContainerStyle={dateGroups.length === 0 ? styles.emptyListContent : styles.listContent}
        showsVerticalScrollIndicator={false}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.1}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={renderEmpty}
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

      {/* Date Picker */}
      {showDatePicker && (
        <DateTimePicker
          value={filterDate || new Date()}
          mode="date"
          display="default"
          onChange={(event: DateTimePickerEvent, selectedDate?: Date) => {
            if (event.type === 'set' && selectedDate) {
              handleDateFilter(selectedDate);
            } else {
              setShowDatePicker(false);
            }
          }}
        />
      )}

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
const getMonthName = (month: number): string => {
  const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  return months[month];
};

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
      return 'Обновление';
    case 'delete':
      return 'Удаление';
    default:
      return 'Действие';
  }
};

const parseDetailsType = (details: string | null | undefined): string => {
  if (!details) return 'Детали';
  try {
    const parsed = JSON.parse(details);
    if (parsed.type === 'price_update') {
      return `Обновление цены - было ${parsed.oldTotalValue?.toFixed(2) || '0'} сом., стало ${parsed.newTotalValue?.toFixed(2) || '0'} сом.`;
    } else if (parsed.type === 'update' && parsed.changes && parsed.changes.length > 0) {
      return `Обновление - ${parsed.changes.length} изменений`;
    } else if (parsed.type === 'sale') {
      return `Продажа - Размер ${parsed.size || parsed.sale?.size || 'N/A'}`;
    } else if (parsed.type === 'wholesale') {
      return `Оптовая продажа - ${parsed.wholesale?.totalBoxes || 0} коробок`;
    } else if (parsed.type === 'create') {
      return `Создание - ${parsed.initialSizes?.length || 0} размеров`;
    } else if (parsed.type === 'delete') {
      return `Удаление - ${parsed.finalSizes?.length || 0} размеров`;
    } else if (parsed.type === 'admin_approved_delete') {
      const itemName = parsed.deletedItem?.name || 'товар';
      return `Удаление одобрено админом - ${itemName}`;
    } else if (parsed.type === 'admin_approved_update') {
      const changedFields = parsed.newData ? Object.keys(parsed.newData).length : 0;
      return `Обновление одобрено админом - ${changedFields} полей`;
    }
    return parsed.type ? `${parsed.type}` : 'Детали';
  } catch {
    return details.substring(0, 30) + '...';
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
  },
  searchContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 8,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 40,
    fontSize: 14,
  },
  clearButton: {
    padding: 4,
  },
  filterButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  activeFiltersContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '500',
  },
  listContent: {
    padding: 16,
  },
  emptyListContent: {
    flexGrow: 1,
    padding: 16,
  },
  dateGroupContainer: {
    marginBottom: 24,
  },
  dateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 12,
    borderBottomWidth: 2,
  },
  dateText: {
    fontSize: 16,
    fontWeight: '700',
  },
  weekDayText: {
    fontSize: 14,
    fontWeight: '500',
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

export default HistoryContentNew;
