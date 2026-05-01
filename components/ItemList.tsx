// components/ItemList.tsx
import { useEffect, useState, useRef, forwardRef, useImperativeHandle, useCallback } from 'react';
import {
  View,
  Text,
  RefreshControl,
  FlatList,
  Alert,
  ActivityIndicator,
  TextInput,
  StyleSheet,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  DeviceEventEmitter,
  TouchableOpacity,
  Animated,
  useWindowDimensions,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useDatabase } from '../hooks/useDatabase';
import { Item, ItemType } from '../database/types';
import { ItemGrid } from './ItemGrid';
import ItemDetailsModal from './ItemDetailsModal';
import { useTheme } from '../src/contexts/ThemeContext';
import { getThemeColors } from '../constants/theme';
import { useSyncRefresh } from '../src/components/sync/SyncStatusBar';
import { useCatalogs } from '../src/contexts/CatalogsContext';

type ItemWithExtras = Item & {
  parsedBoxSizeQuantities?: unknown;
  sizeText?: string;
};

interface ItemListProps {
  onRefresh?: () => void;
}

export const ItemList = forwardRef<any, ItemListProps>(({ onRefresh }, ref) => {
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);

  // Используем размеры экрана для адаптивной сетки
  const { width: screenWidth } = useWindowDimensions();

  // Рассчитываем количество колонок в зависимости от ширины экрана
  // < 400px: 2 колонки (маленький телефон)
  // 400-600px: 3 колонки (обычный телефон)
  // 600-900px: 4 колонки (планшет портрет или телефон landscape)
  // 900-1200px: 5 колонок (планшет landscape)
  // > 1200px: 6 колонок (большой планшет)
  const numColumns = screenWidth < 400 ? 2 : screenWidth < 600 ? 3 : screenWidth < 900 ? 4 : screenWidth < 1200 ? 5 : 6;

  const [items, setItems] = useState<ItemWithExtras[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [scannedContext, setScannedContext] = useState<{ boxIndex?: number; size?: number | string } | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const {
    getItemsPage,
    getDistinctWarehouses,
    getItems,
  } = useDatabase();

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState('Все');
  const [warehouses, setWarehouses] = useState<string[]>([]);
  const [selectedItemType, setSelectedItemType] = useState<'all' | string>('all');
  const { enabledCatalogs } = useCatalogs();
  const debounceRef = useRef<number | null>(null);


  const LIMIT = 15;

  // Debounce searchTerm: 300ms
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300) as unknown as number;

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchTerm]);

  const loadWarehouses = async () => {
    try {
      const whs = await getDistinctWarehouses();
      const cleaned = (whs || []).map(w => (typeof w === 'string' ? w.trim() : '')).filter(Boolean);
      console.log('Loaded warehouses:', cleaned); // Логирование для отладки
      const newWarehouses = ['Все', ...cleaned];
      setWarehouses(newWarehouses);

      // Проверяем, существует ли текущий выбранный склад в новом списке
      if (selectedWarehouse !== 'Все' && !cleaned.includes(selectedWarehouse)) {
        console.log(`Selected warehouse ${selectedWarehouse} not found in new list, resetting to 'Все'`);
        setSelectedWarehouse('Все');
      }
    } catch (error) {
      console.error('Failed to load warehouses:', error);
      setWarehouses(['Все']);
      Alert.alert('Ошибка', 'Не удалось загрузить список складов');
    }
  };

  const loadFirstPage = async () => {
    try {
      setRefreshing(true);
      console.log('Starting loadFirstPage, refreshing warehouses...');
      await loadWarehouses(); // Обновляем список складов
      setOffset(0);
      setHasMore(true);
      const { items: page, hasMore: more } = await getItemsPage(LIMIT, 0, debouncedSearch, selectedWarehouse, selectedItemType);
      console.log('Loaded items:', page.length, 'Has more:', more, 'Filters:', { warehouse: selectedWarehouse, itemType: selectedItemType, search: debouncedSearch });
      setItems(page as ItemWithExtras[]);
      setOffset(page.length);
      setHasMore(more);
    } catch (error) {
      console.error('Failed to load first page:', error);
      Alert.alert('Ошибка', 'Не удалось загрузить товары');
    } finally {
      setRefreshing(false);
    }
  };

  const loadMorePage = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const { items: page, hasMore: more } = await getItemsPage(LIMIT, offset, debouncedSearch, selectedWarehouse, selectedItemType);
      console.log('Loaded more items:', page.length, 'New offset:', offset + page.length);
      if (page.length > 0) {
        setItems(prev => [...prev, ...page] as ItemWithExtras[]);
        setOffset(prev => prev + page.length);
      }
      setHasMore(more);
    } catch (error) {
      console.error('Failed to load more items:', error);
      Alert.alert('Ошибка', 'Не удалось загрузить дополнительные товары');
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    (async () => {
      console.log('Initial load: fetching warehouses and first page');
      await loadWarehouses();
      await loadFirstPage();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    console.log('Filters changed, reloading first page. Search:', debouncedSearch, 'Warehouse:', selectedWarehouse, 'ItemType:', selectedItemType);
    loadFirstPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, selectedWarehouse, selectedItemType]);

  // === ПОДПИСКА НА СОБЫТИЕ itemAdded ===
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('itemAdded', async () => {
      try {
        console.log('Received itemAdded event — reloading first page');
        // Просто перезагрузим первую страницу (loadFirstPage уже обновит склады)
        await loadFirstPage();
      } catch (e) {
        console.error('Error handling itemAdded event:', e);
      }
    });

    return () => {
      try {
        subscription.remove();
      } catch (e) {
        console.warn('Failed to remove DeviceEventEmitter subscription', e);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // === АВТОМАТИЧЕСКОЕ ОБНОВЛЕНИЕ ПОСЛЕ СИНХРОНИЗАЦИИ ===
  const handleSyncRefresh = useCallback(() => {
    console.log('🔄 ItemList: sync completed, reloading data...');
    loadFirstPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useSyncRefresh('ItemList', handleSyncRefresh);

  const handleItemPress = (item: Item, context?: { boxIndex?: number; size?: number | string }) => {
    setSelectedItem(item);
    setScannedContext(context || null);
    setDetailModalVisible(true);
  };

  // Метод для открытия товара по ID или UUID (вызывается из QR-сканера)
  useImperativeHandle(ref, () => ({
    openItemById: async (itemId: number, context?: { boxIndex?: number; size?: number | string }, itemUuid?: string) => {
      try {
        // Приоритет поиска:
        // 1. По UUID (самый надёжный после синхронизации)
        // 2. По локальному id
        // 3. По serverId (для QR-кодов созданных на другом устройстве)

        // Поиск по UUID в загруженных товарах
        if (itemUuid) {
          const byUuid = items.find(i => i.uuid === itemUuid);
          if (byUuid) {
            handleItemPress(byUuid, context);
            return;
          }
        }

        // Сначала ищем по локальному id в загруженных товарах
        const existingItem = items.find(i => i.id === itemId);
        if (existingItem) {
          handleItemPress(existingItem, context);
          return;
        }

        // Пробуем найти по serverId в загруженных товарах
        // (важно для QR-кодов созданных на другом устройстве)
        const byServerId = items.find(i => i.serverId === itemId);
        if (byServerId) {
          handleItemPress(byServerId, context);
          return;
        }

        // Если не найден в кэше, загружаем все товары и ищем по всем идентификаторам
        const allItems = await getItems();

        // Сначала по UUID (приоритет)
        if (itemUuid) {
          const foundByUuid = allItems.find(i => i.uuid === itemUuid);
          if (foundByUuid) {
            handleItemPress(foundByUuid, context);
            return;
          }
        }

        // Затем по id или serverId
        const foundItem = allItems.find(i => i.id === itemId || i.serverId === itemId);
        if (foundItem) {
          handleItemPress(foundItem, context);
        } else {
          Alert.alert('Ошибка', 'Товар не найден. Возможно, он был удален или еще не синхронизирован на это устройство.');
        }
      } catch (error) {
        console.error('Error opening item by ID:', error);
        Alert.alert('Ошибка', 'Не удалось открыть товар');
      }
    },

    refresh: () => {
      loadFirstPage();
    },
  }));

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      loadMorePage();
    }
  };


  const handleItemUpdated = async (updatedItem?: Item) => {
    try {
      if (!updatedItem) return;
      console.log('Item updated:', updatedItem.id, 'Warehouse:', updatedItem.warehouse);
      setItems(prev => prev.map(i => (i.id === updatedItem.id ? { ...i, ...updatedItem } : i)));
      // Проверяем, нужно ли обновить список складов
      if (updatedItem.warehouse && !warehouses.includes(updatedItem.warehouse)) {
        console.log('New warehouse detected:', updatedItem.warehouse, 'Reloading warehouses');
        await loadWarehouses();
      }
    } catch (error) {
      console.error('Error handling item update:', error);
    }
  };

  const handleItemDeleted = async (itemId: number) => {
    try {
      console.log('Item deleted:', itemId, 'Reloading warehouses');
      setItems(prev => prev.filter(item => item.id !== itemId));
      await loadWarehouses(); // Обновляем склады после удаления
    } catch (error) {
      console.error('Error handling deletion in UI:', error);
    }
  };

  const handleModalClose = () => {
    setDetailModalVisible(false);
    setSelectedItem(null);
  };

  const renderFooter = () => {
    if (!loadingMore) return null;

    return (
      <View style={{ alignItems: 'center', paddingVertical: 12 }}>
        <ActivityIndicator size="small" color={isDark ? colors.primary.gold : colors.primary.blue} />
      </View>
    );
  };

  const renderEmptyState = () => {
    if (refreshing) return null;

    const hasFilters = debouncedSearch || selectedItemType !== 'all' || selectedWarehouse !== 'Все';

    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <Ionicons name="search-outline" size={64} color={isDark ? '#4a4a4a' : '#d1d5db'} style={{ marginBottom: 16 }} />

        {hasFilters ? (
          <>
            <Text style={{ color: colors.text.normal, fontSize: 16, textAlign: 'center', fontWeight: '600' }}>
              Ничего не найдено
            </Text>
            <View style={{ marginTop: 12 }}>
              <Text style={{ color: colors.text.muted, fontSize: 13, textAlign: 'center' }}>
                Попробуйте изменить фильтры или поисковый запрос
              </Text>
            </View>
          </>
        ) : (
          <>
            <Text style={{ color: colors.text.normal, fontSize: 16, textAlign: 'center', fontWeight: '600' }}>
              Нет товаров
            </Text>
            <View style={{ marginTop: 12 }}>
              <Text style={{ color: colors.text.muted, fontSize: 13, textAlign: 'center' }}>
                Нажмите "+" внизу экрана чтобы создать первый товар
              </Text>
            </View>
            <View style={{ marginTop: 14 }}>
              <Text style={{ color: colors.text.muted, fontSize: 13, textAlign: 'center' }}>
                Для управления данными перейдите в раздел "Настройки"
              </Text>
            </View>
          </>
        )}
      </View>
    );
  };


  const handleOutsidePress = () => {
    Keyboard.dismiss();
  };

  const accentColor = isDark ? colors.primary.gold : colors.primary.blue;

  return (
    <TouchableWithoutFeedback onPress={handleOutsidePress}>
      <View style={{ flex: 1 }}>
        {/* Верхняя строка: поиск и селектор склада */}
        <View style={{
          padding: 8,
          backgroundColor: colors.background.card,
          borderBottomWidth: 1,
          borderBottomColor: colors.border.normal
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <TextInput
              style={[styles.searchInput, {
                flex: 1,
                marginRight: 8,
                backgroundColor: colors.background.card,
                borderColor: colors.border.normal,
                color: colors.text.normal
              }]}
              placeholder="Поиск по названию или коду..."
              placeholderTextColor={colors.text.muted}
              value={searchTerm}
              onChangeText={setSearchTerm}
            />

            <View style={{ width: 140 }}>
              <View style={[styles.pickerWrapper, {
                backgroundColor: colors.background.card,
                borderColor: colors.border.normal
              }]}>
                <Picker
                  selectedValue={selectedWarehouse}
                  onValueChange={(itemValue) => setSelectedWarehouse(itemValue)}
                  style={[styles.picker, { color: colors.text.normal }]}
                  dropdownIconColor={colors.text.normal}
                  mode={Platform.OS === 'android' ? 'dropdown' : 'dialog'}
                  itemStyle={Platform.OS === 'ios' ? { fontSize: 14, height: 40 } : undefined}
                >
                  {warehouses.map((wh) => (
                    <Picker.Item key={String(wh)} label={wh} value={wh} />
                  ))}
                </Picker>
              </View>
            </View>
          </View>

          {/* Фильтры по каталогам */}
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <FlatList
                horizontal
                data={[{ id: 'all', name: 'Все', icon: '🗂' } as any, ...enabledCatalogs]}
                keyExtractor={(item) => String(item.id)}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8 }}
                renderItem={({ item }) => {
                  const value = item.id === 'all' ? 'all' : item.name;
                  const selected = selectedItemType === value;
                  return (
                    <TouchableOpacity
                      onPress={() => setSelectedItemType(value)}
                      style={[
                        styles.filterTag,
                        {
                          backgroundColor: selected ? accentColor : (isDark ? colors.background.light : '#f3f4f6'),
                          borderColor: selected ? accentColor : colors.border.normal,
                        },
                      ]}
                      activeOpacity={0.7}
                    >
                      <Text style={{ fontSize: 14, marginRight: 4 }}>{item.icon || '📦'}</Text>
                      <Text style={[styles.filterTagText, { color: selected ? '#fff' : colors.text.muted }]}>
                        {item.name}
                      </Text>
                    </TouchableOpacity>
                  );
                }}
              />
            </View>

            {/* Refresh button */}
            <TouchableOpacity
              onPress={() => {
                if (onRefresh) {
                  onRefresh();
                } else {
                  loadFirstPage();
                }
              }}
              style={[
                styles.refreshButton,
                {
                  backgroundColor: isDark ? 'rgba(212, 175, 55, 0.15)' : 'rgba(59, 130, 246, 0.1)',
                }
              ]}
              activeOpacity={0.7}
            >
              <MaterialIcons
                name="refresh"
                size={20}
                color={accentColor}
              />
            </TouchableOpacity>
          </View>
        </View>

        <FlatList
          data={items}
          renderItem={({ item }) => (
            <ItemGrid
              item={item}
              onPress={() => handleItemPress(item)}
              searchTerm={debouncedSearch}
            />
          )}
          keyExtractor={(item, index) => `${item.id}_${item.serverId || 'local'}_${index}`}
          numColumns={numColumns}
          key={`grid-${numColumns}`}
          contentContainerStyle={{ padding: 8, flexGrow: 1 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => loadFirstPage()} />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={renderFooter}
          ListEmptyComponent={renderEmptyState}
          ListFooterComponentStyle={{ marginTop: 10, marginBottom: 20 }}
        />

        {selectedItem && (
          <ItemDetailsModal
            item={selectedItem}
            visible={detailModalVisible}
            onClose={handleModalClose}
            onItemUpdated={handleItemUpdated}
            onItemDeleted={handleItemDeleted}
          />
        )}

      </View>
    </TouchableWithoutFeedback>
  );
});

const styles = StyleSheet.create({
  searchInput: {
    height: 40,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
  },
  pickerWrapper: {
    flex: 1,
    height: Platform.OS === 'android' ? 44 : 40,
    borderWidth: 1,
    borderRadius: 8,
    overflow: Platform.OS === 'ios' ? 'hidden' : 'visible',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  picker: {
    height: Platform.OS === 'android' ? 50 : 40,
    width: '100%',
    alignSelf: 'stretch',
    paddingVertical: 0,
    marginTop: Platform.OS === 'ios' ? -4 : 0,
  },
  filterTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterTagActive: {
    // backgroundColor and borderColor set dynamically
  },
  filterTagText: {
    fontSize: 13,
    fontWeight: '600',
  },
  filterTagTextActive: {
    // color set dynamically
  },
  refreshButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
