// components/TransactionDetailsModal.tsx
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Alert,
  BackHandler,
  Image,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Transaction, Item } from '../database/types';
import { useDatabase } from '../hooks/useDatabase';
import { getItemById } from '../database/database';
import { GroupedTransaction } from './TransactionsList';
import { useAuth } from '../src/contexts/AuthContext';
import { useTheme } from '../src/contexts/ThemeContext';
import { getThemeColors } from '../constants/theme';
import SyncService from '../src/services/SyncService';

const { width: screenWidth } = Dimensions.get('window');

interface SaleInfo {
  size: number;
  quantity: number;
  costPrice: number;
  salePrice: number;
  recommendedSellingPrice?: number; // Рекомендуемая цена продажи
  previousQuantity: number;
  profit: number;
  boxIndex?: number; // Добавляем опциональное поле для индекса коробки
}

interface CreateInfo {
  initialSizes: { size: number; quantity: number }[];
  total: number;
  totalValue: number;
}

interface UpdateInfo {
  changes: {
    size: number;
    oldQuantity: number;
    newQuantity: number;
    delta: number
  }[];
  totalAfter: number;
  totalValueAfter: number;
}

interface DeleteInfo {
  finalSizes: { size: number; quantity: number }[];
  total: number;
  totalValue: number;
}

interface WholesaleInfo {
  boxes: {
    boxIndex: number;
    quantity: number;
    costPrice: number;
    salePrice: number;
    profit: number;
    sizes: {
      size: number;
      quantity: number;
      price: number;
    }[];
  }[];
  totalBoxes: number;
  totalQuantity: number;
  totalCostPrice: number;
  totalSalePrice: number;
  totalProfit: number;
}

interface PriceUpdateInfo {
  oldTotalValue: number;
  newTotalValue: number;
  oldRecommendedPrice?: number;
  newRecommendedPrice?: number;
}

interface TransactionDetails {
  type: 'sale' | 'create' | 'update' | 'delete' | 'wholesale' | 'price_update' | 'admin_approved_delete' | 'admin_approved_update' | 'admin_approved_sale_deletion';
  sale?: SaleInfo;
  wholesale?: WholesaleInfo;
  initialSizes?: CreateInfo['initialSizes'];
  total?: number;
  totalValue?: number;
  totalRecommendedValue?: number;
  changes?: UpdateInfo['changes'];
  totalAfter?: number;
  totalValueAfter?: number;
  totalRecommendedValueAfter?: number;
  finalSizes?: DeleteInfo['finalSizes'];
  oldTotalValue?: number;
  newTotalValue?: number;
  oldRecommendedPrice?: number;
  newRecommendedPrice?: number;
  size?: number;
  quantity?: number;
  costPrice?: number;
  salePrice?: number;
  previousQuantity?: number;
  profit?: number;
  boxIndex?: number;
}

const parseDetails = (details: string | null | undefined): TransactionDetails | null => {
  if (!details) return null;
  try {
    return JSON.parse(details);
  } catch {
    return null;
  }
};

interface TransactionDetailsModalProps {
  groupedTransaction: GroupedTransaction;
  visible: boolean;
  onClose: () => void;
  onTransactionDeleted?: () => void;
}

const TransactionDetailsModal: React.FC<TransactionDetailsModalProps> = ({ groupedTransaction, visible, onClose, onTransactionDeleted }) => {
  const { isAssistant, isAdmin } = useAuth();
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);
  const transactions = groupedTransaction.transactions;
  const mainTransaction = transactions[0];
  const { deleteTransaction } = useDatabase();

  // State для хранения данных товара (картинка)
  const [itemData, setItemData] = useState<Item | null>(null);

  // Получаем картинку - сначала из транзакции, потом из БД если нужно
  const transactionImageUri = mainTransaction.itemImageUri;

  // Загрузка данных товара при открытии модалки (только если нет картинки в транзакции)
  useEffect(() => {
    if (!visible) {
      setItemData(null);
      return;
    }

    // Если уже есть картинка в транзакции - не ищем
    if (transactionImageUri) {
      console.log('📦 Using image from transaction:', transactionImageUri);
      return;
    }

    // Иначе пробуем найти по ID/имени
    console.log('🔍 TransactionDetailsModal: searching for item, itemId=', mainTransaction.itemId, 'itemName=', mainTransaction.itemName);
    if (mainTransaction.itemId || mainTransaction.itemName) {
      getItemById(mainTransaction.itemId || 0, mainTransaction.itemName)
        .then(item => {
          console.log('📦 Fetched item:', item?.id, 'imageUri:', item?.imageUri);
          setItemData(item);
        })
        .catch(err => console.error('Failed to fetch item:', err));
    }
  }, [visible, transactionImageUri, mainTransaction.itemId, mainTransaction.itemName]);

  // Обработка системной кнопки "назад" на Android
  useEffect(() => {
    if (!visible) return;

    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true; // Предотвращаем дефолтное поведение
    });

    return () => backHandler.remove();
  }, [visible, onClose]);

  const handleDelete = () => {
    const isAssistantUser = isAssistant();
    const title = isAssistantUser ? 'Запросить удаление?' : 'Удалить транзакцию?';
    const message = isAssistantUser
      ? 'Будет отправлен запрос на удаление транзакции администратору для одобрения.'
      : 'Это действие отменит продажу и вернёт товар на склад. Это нельзя отменить.';
    const buttonText = isAssistantUser ? 'Отправить запрос' : 'Удалить';

    Alert.alert(
      title,
      message,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: buttonText,
          style: 'destructive',
          onPress: async () => {
            try {
              if (isAssistantUser) {
                // Сначала синхронизируемся чтобы получить актуальные данные
                try {
                  console.log('🔄 Syncing before delete request...');
                  await SyncService.assistantPull();
                } catch (syncErr) {
                  console.warn('Sync before delete failed:', syncErr);
                }

                // Загружаем данные товара если их нет (для itemServerId и itemCode)
                let currentItemData = itemData;
                if (!currentItemData && (mainTransaction.itemId || mainTransaction.itemName)) {
                  try {
                    currentItemData = await getItemById(mainTransaction.itemId || 0, mainTransaction.itemName);
                    console.log('📦 Loaded item data:', currentItemData?.id, currentItemData?.serverId, currentItemData?.code);
                  } catch (err) {
                    console.warn('Failed to load item data:', err);
                  }
                }

                // Ассистент отправляет запрос на одобрение
                const transactionDetails = parseDetails(mainTransaction.details);
                await SyncService.requestApproval(
                  'DELETE_TRANSACTION',
                  mainTransaction.serverId || mainTransaction.id,
                  {
                    transaction: {
                      id: mainTransaction.id,
                      serverId: mainTransaction.serverId,
                      itemId: mainTransaction.itemId,
                      itemName: mainTransaction.itemName,
                      action: mainTransaction.action,
                      timestamp: mainTransaction.timestamp,
                    },
                    // Добавляем код и serverId товара для уникальной идентификации на сервере
                    itemCode: currentItemData?.code,
                    itemServerId: currentItemData?.serverId,
                    details: transactionDetails,
                  },
                  {}, // newData - пустой объект для удаления (DTO требует объект)
                  'Запрос на удаление транзакции продажи'
                );
                Alert.alert(
                  'Запрос отправлен',
                  'Администратор получит уведомление и рассмотрит ваш запрос на удаление.'
                );
                onClose();
                return;
              }

              // Админ удаляет напрямую
              const res = await deleteTransaction(mainTransaction.id);
              if (res.success) {
                onTransactionDeleted?.();
                onClose();
              } else {
                Alert.alert('Ошибка', res.message || 'Не удалось удалить транзакцию');
              }
            } catch (error: any) {
              console.error('Error in handleDelete:', error);
              Alert.alert(
                'Ошибка',
                error.response?.data?.message || error.message || 'Не удалось выполнить операцию'
              );
            }
          }
        }
      ]
    );
  };

  const renderSaleDetails = (details: TransactionDetails) => (
    <View>
      <Text style={[styles.sectionTitle, { color: colors.text.normal }]}>Детали продажи:</Text>
      {details.sale ? (
        <View>
          <View style={styles.row}>
            <Text style={[styles.label, { color: colors.text.muted }]}>Размер:</Text>
            <Text style={[styles.value, { color: colors.text.normal }]}>{details.sale.size}</Text>
          </View>
          <View style={styles.row}>
            <Text style={[styles.label, { color: colors.text.muted }]}>Было товаров:</Text>
            <Text style={[styles.value, { color: colors.text.normal }]}>{details.sale.previousQuantity} шт.</Text>
          </View>
          <View style={styles.row}>
            <Text style={[styles.label, { color: colors.text.muted }]}>Осталось товаров:</Text>
            <Text style={[styles.value, { color: colors.text.normal }]}>{details.sale.previousQuantity - details.sale.quantity} шт.</Text>
          </View>
          {isAssistant() ? (
            <>
              <View style={styles.row}>
                <Text style={[styles.label, { color: colors.text.muted }]}>Рекомендуемая цена:</Text>
                <Text style={[styles.value, { color: colors.text.normal }]}>{details.sale.recommendedSellingPrice?.toFixed(2) || '0.00'} сомонӣ</Text>
              </View>
              <View style={styles.row}>
                <Text style={[styles.label, { color: colors.text.muted }]}>Цена продажи:</Text>
                <Text style={[styles.value, { color: colors.text.normal }]}>{details.sale.salePrice.toFixed(2)} сомонӣ</Text>
              </View>
            </>
          ) : (
            <>
              <View style={styles.row}>
                <Text style={[styles.label, { color: colors.text.muted }]}>Себестоимость пары:</Text>
                <Text style={[styles.value, { color: colors.text.normal }]}>{details.sale.costPrice.toFixed(2)} сомонӣ</Text>
              </View>
              <View style={styles.row}>
                <Text style={[styles.label, { color: colors.text.muted }]}>Рекомендуемая цена:</Text>
                <Text style={[styles.value, { color: colors.text.normal }]}>{details.sale.recommendedSellingPrice?.toFixed(2) || '0.00'} сомонӣ</Text>
              </View>
              <View style={styles.row}>
                <Text style={[styles.label, { color: colors.text.muted }]}>Цена продажи:</Text>
                <Text style={[styles.value, { color: colors.text.normal }]}>{details.sale.salePrice.toFixed(2)} сомонӣ</Text>
              </View>
              <View style={styles.row}>
                <Text style={[styles.label, { color: colors.text.muted }]}>Прибыль:</Text>
                <Text style={[
                  styles.value,
                  { color: details.sale.profit > 0 ? '#10b981' : '#ef4444' }
                ]}>
                  {details.sale.profit.toFixed(2)} сомонӣ
                </Text>
              </View>
            </>
          )}
        </View>
      ) : (
        <Text style={[styles.noData, { color: colors.text.muted }]}>Нет деталей продажи</Text>
      )}
    </View>
  );

  const renderWholesaleDetails = (details: TransactionDetails) => (
    <View>
      <Text style={[styles.sectionTitle, { color: colors.text.normal }]}>Детали оптовой продажи:</Text>
      {details.wholesale ? (
        <View>
          <View style={styles.row}>
            <Text style={[styles.label, { color: colors.text.muted }]}>Продано коробок:</Text>
            <Text style={[styles.value, { color: colors.text.normal }]}>{details.wholesale.totalBoxes} шт.</Text>
          </View>
          <View style={styles.row}>
            <Text style={[styles.label, { color: colors.text.muted }]}>Общее количество товаров:</Text>
            <Text style={[styles.value, { color: colors.text.normal }]}>{details.wholesale.totalQuantity} шт.</Text>
          </View>
          {isAdmin() && (
            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.text.muted }]}>Общая себестоимость:</Text>
              <Text style={[styles.value, { color: colors.text.normal }]}>{details.wholesale.totalCostPrice.toFixed(2)} сомонӣ</Text>
            </View>
          )}
          <View style={styles.row}>
            <Text style={[styles.label, { color: colors.text.muted }]}>Общая цена продажи:</Text>
            <Text style={[styles.value, { color: colors.text.normal }]}>{details.wholesale.totalSalePrice.toFixed(2)} сомонӣ</Text>
          </View>
          {isAdmin() && (
            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.text.muted }]}>Общая прибыль:</Text>
              <Text style={[
                styles.value,
                { color: details.wholesale.totalProfit > 0 ? '#10b981' : '#ef4444' }
              ]}>
                {details.wholesale.totalProfit.toFixed(2)} сомонӣ
              </Text>
            </View>
          )}
          <Text style={[styles.subsectionTitle, { color: colors.text.normal }]}>Детали по коробкам:</Text>
          {details.wholesale.boxes.map((box, index) => (
            <View key={index} style={[styles.row, { marginLeft: 10, flexDirection: 'column', alignItems: 'flex-start' }]}>
              <Text style={[styles.label, { color: colors.text.muted, fontWeight: 'bold', marginBottom: 4 }]}>
                Коробка {box.boxIndex + 1}:
              </Text>
              <View style={{ marginLeft: 10 }}>
                <View style={styles.row}>
                  <Text style={[styles.label, { color: colors.text.muted }]}>Количество:</Text>
                  <Text style={[styles.value, { color: colors.text.normal }]}>{box.quantity} шт.</Text>
                </View>
                {isAdmin() && (
                  <View style={styles.row}>
                    <Text style={[styles.label, { color: colors.text.muted }]}>Себестоимость:</Text>
                    <Text style={[styles.value, { color: colors.text.normal }]}>{box.costPrice.toFixed(2)} сомонӣ</Text>
                  </View>
                )}
                <View style={styles.row}>
                  <Text style={[styles.label, { color: colors.text.muted }]}>Цена продажи:</Text>
                  <Text style={[styles.value, { color: colors.text.normal }]}>{box.salePrice.toFixed(2)} сомонӣ</Text>
                </View>
                {isAdmin() && (
                  <View style={styles.row}>
                    <Text style={[styles.label, { color: colors.text.muted }]}>Прибыль:</Text>
                    <Text style={[
                      styles.value,
                      { color: box.profit > 0 ? '#10b981' : '#ef4444' }
                    ]}>
                      {box.profit.toFixed(2)} сомонӣ
                    </Text>
                  </View>
                )}
                <Text style={[styles.label, { fontSize: 12, color: colors.text.muted, marginTop: 4 }]}>
                  Размеры: {box.sizes.map(s => `${s.size} (${s.quantity}шт.)`).join(', ')}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <Text style={[styles.noData, { color: colors.text.muted }]}>Нет деталей оптовой продажи</Text>
      )}
    </View>
  );

  const renderPriceUpdateDetails = (details: TransactionDetails) => {
    const costDiff = (details.newTotalValue || 0) - (details.oldTotalValue || 0);
    const recommendedDiff = (details.newRecommendedPrice || 0) - (details.oldRecommendedPrice || 0);
    const hasRecommendedChange = details.oldRecommendedPrice !== undefined && details.newRecommendedPrice !== undefined;

    return (
      <View>
        <Text style={[styles.sectionTitle, { color: colors.text.normal }]}>Детали обновления цены:</Text>
        <View>
          {isAdmin() && (
            <>
              <Text style={[styles.subsectionTitle, { color: colors.text.normal, marginTop: 8, marginBottom: 8 }]}>Себестоимость:</Text>
              <View style={styles.row}>
                <Text style={[styles.label, { color: colors.text.muted }]}>Была общая стоимость:</Text>
                <Text style={[styles.value, { color: colors.text.normal }]}>{details.oldTotalValue?.toFixed(2) || '0.00'} сомонӣ</Text>
              </View>
              <View style={styles.row}>
                <Text style={[styles.label, { color: colors.text.muted }]}>Стала общая стоимость:</Text>
                <Text style={[styles.value, { color: colors.text.normal }]}>{details.newTotalValue?.toFixed(2) || '0.00'} сомонӣ</Text>
              </View>
              <View style={styles.row}>
                <Text style={[styles.label, { color: colors.text.muted }]}>Разница:</Text>
                <Text style={[
                  styles.value,
                  { color: costDiff > 0 ? '#10b981' : costDiff < 0 ? '#ef4444' : colors.text.muted, fontWeight: 'bold' }
                ]}>
                  {costDiff > 0 ? '+' : ''}{costDiff.toFixed(2)} сомонӣ
                </Text>
              </View>
            </>
          )}

          {hasRecommendedChange && (
            <>
              <Text style={[styles.subsectionTitle, { color: colors.text.normal, marginTop: 12, marginBottom: 8 }]}>Рекомендованная цена продажи:</Text>
              <View style={styles.row}>
                <Text style={[styles.label, { color: colors.text.muted }]}>Была:</Text>
                <Text style={[styles.value, { color: colors.text.normal }]}>{details.oldRecommendedPrice?.toFixed(2) || '0.00'} сомонӣ</Text>
              </View>
              <View style={styles.row}>
                <Text style={[styles.label, { color: colors.text.muted }]}>Стала:</Text>
                <Text style={[styles.value, { color: colors.text.normal }]}>{details.newRecommendedPrice?.toFixed(2) || '0.00'} сомонӣ</Text>
              </View>
              <View style={styles.row}>
                <Text style={[styles.label, { color: colors.text.muted }]}>Разница:</Text>
                <Text style={[
                  styles.value,
                  { color: recommendedDiff > 0 ? '#10b981' : recommendedDiff < 0 ? '#ef4444' : colors.text.muted, fontWeight: 'bold' }
                ]}>
                  {recommendedDiff > 0 ? '+' : ''}{recommendedDiff.toFixed(2)} сомонӣ
                </Text>
              </View>
            </>
          )}

          <View style={[styles.infoBox, {
            backgroundColor: isDark ? 'rgba(14, 165, 233, 0.2)' : '#e0f2fe',
            borderColor: '#0284c7',
            marginTop: 12
          }]}>
            <MaterialIcons name="info" size={20} color="#0284c7" style={{ marginRight: 8 }} />
            <Text style={[styles.infoText, { color: isDark ? '#38bdf8' : '#0369a1' }]}>
              Цены были обновлены вручную.
              Количество товаров не изменилось.
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const renderUpdateDetails = (details: TransactionDetails) => (
    <View>
      {details.sale ? (
        <>
          <Text style={[styles.sectionTitle, { color: colors.text.normal }]}>Детали продажи:</Text>
          <View style={styles.row}>
            <Text style={[styles.label, { color: colors.text.muted }]}>Размер:</Text>
            <Text style={[styles.value, { color: colors.text.normal }]}>{details.sale.size}</Text>
          </View>
          <View style={styles.row}>
            <Text style={[styles.label, { color: colors.text.muted }]}>Было товаров:</Text>
            <Text style={[styles.value, { color: colors.text.normal }]}>{details.sale.previousQuantity} шт.</Text>
          </View>
          <View style={styles.row}>
            <Text style={[styles.label, { color: colors.text.muted }]}>Осталось товаров:</Text>
            <Text style={[styles.value, { color: colors.text.normal }]}>{details.sale.previousQuantity - details.sale.quantity} шт.</Text>
          </View>
          {isAssistant() ? (
            <>
              <View style={styles.row}>
                <Text style={[styles.label, { color: colors.text.muted }]}>Рекомендуемая цена:</Text>
                <Text style={[styles.value, { color: colors.text.normal }]}>{details.sale.recommendedSellingPrice?.toFixed(2) || '0.00'} сомонӣ</Text>
              </View>
              <View style={styles.row}>
                <Text style={[styles.label, { color: colors.text.muted }]}>Цена продажи:</Text>
                <Text style={[styles.value, { color: colors.text.normal }]}>{details.sale.salePrice.toFixed(2)} сомонӣ</Text>
              </View>
            </>
          ) : (
            <>
              <View style={styles.row}>
                <Text style={[styles.label, { color: colors.text.muted }]}>Себестоимость пары:</Text>
                <Text style={[styles.value, { color: colors.text.normal }]}>{details.sale.costPrice.toFixed(2)} сомонӣ</Text>
              </View>
              <View style={styles.row}>
                <Text style={[styles.label, { color: colors.text.muted }]}>Рекомендуемая цена:</Text>
                <Text style={[styles.value, { color: colors.text.normal }]}>{details.sale.recommendedSellingPrice?.toFixed(2) || '0.00'} сомонӣ</Text>
              </View>
              <View style={styles.row}>
                <Text style={[styles.label, { color: colors.text.muted }]}>Цена продажи:</Text>
                <Text style={[styles.value, { color: colors.text.normal }]}>{details.sale.salePrice.toFixed(2)} сомонӣ</Text>
              </View>
              <View style={styles.row}>
                <Text style={[styles.label, { color: colors.text.muted }]}>Прибыль:</Text>
                <Text style={[
                  styles.value,
                  { color: details.sale.profit > 0 ? '#10b981' : '#ef4444' }
                ]}>
                  {details.sale.profit.toFixed(2)} сомонӣ
                </Text>
              </View>
            </>
          )}
        </>
      ) : (
        <>
          <Text style={[styles.sectionTitle, { color: colors.text.normal }]}>Детали обновления:</Text>
          {details.changes && (
            <View>
              <View style={styles.row}>
                <Text style={[styles.label, { color: colors.text.muted }]}>Количество изменений:</Text>
                <Text style={[styles.value, { color: colors.text.normal }]}>{details.changes.length}</Text>
              </View>
              <View style={styles.row}>
                <Text style={[styles.label, { color: colors.text.muted }]}>Новое общее количество:</Text>
                <Text style={[styles.value, { color: colors.text.normal }]}>{details.totalAfter} шт.</Text>
              </View>
              {isAdmin() ? (
                <View style={styles.row}>
                  <Text style={[styles.label, { color: colors.text.muted }]}>Новая общая стоимость:</Text>
                  <Text style={[styles.value, { color: colors.text.normal }]}>{details.totalValueAfter?.toFixed(2)} сомонӣ</Text>
                </View>
              ) : (
                <View style={styles.row}>
                  <Text style={[styles.label, { color: colors.text.muted }]}>Новая рекомендованная стоимость:</Text>
                  <Text style={[styles.value, { color: colors.text.normal }]}>{details.totalRecommendedValueAfter?.toFixed(2) || '0.00'} сомонӣ</Text>
                </View>
              )}
              <Text style={[styles.subsectionTitle, { color: colors.text.normal }]}>Изменения:</Text>
              {details.changes.map((change, index) => (
                <View key={index} style={[styles.row, { marginLeft: 10 }]}>
                  <Text style={[styles.label, { color: colors.text.muted }]}>Размер {change.size}:</Text>
                  <Text style={[styles.value, { color: colors.text.normal }]}>
                    {change.oldQuantity} → {change.newQuantity} ({change.delta > 0 ? '+' : ''}{change.delta})
                  </Text>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );

  const renderCreateDetails = (details: TransactionDetails) => (
    <View>
      <Text style={[styles.sectionTitle, { color: colors.text.normal }]}>Детали создания:</Text>
      {details.initialSizes && (
        <View>
          <View style={styles.row}>
            <Text style={[styles.label, { color: colors.text.muted }]}>Количество размеров:</Text>
            <Text style={[styles.value, { color: colors.text.normal }]}>{details.initialSizes.length}</Text>
          </View>
          <View style={styles.row}>
            <Text style={[styles.label, { color: colors.text.muted }]}>Общее количество:</Text>
            <Text style={[styles.value, { color: colors.text.normal }]}>{details.total} шт.</Text>
          </View>
          {isAdmin() ? (
            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.text.muted }]}>Общая стоимость:</Text>
              <Text style={[styles.value, { color: colors.text.normal }]}>{details.totalValue?.toFixed(2)} сомонӣ</Text>
            </View>
          ) : (
            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.text.muted }]}>Общая рекомендованная стоимость:</Text>
              <Text style={[styles.value, { color: colors.text.normal }]}>{details.totalRecommendedValue?.toFixed(2) || '0.00'} сомонӣ</Text>
            </View>
          )}
          <Text style={[styles.subsectionTitle, { color: colors.text.normal }]}>Размеры:</Text>
          {details.initialSizes.map((size, index) => (
            <View key={index} style={[styles.row, { marginLeft: 10 }]}>
              <Text style={[styles.label, { color: colors.text.muted }]}>Размер {size.size}:</Text>
              <Text style={[styles.value, { color: colors.text.normal }]}>{size.quantity} шт.</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );

  const renderDeleteDetails = (details: TransactionDetails) => (
    <View>
      <Text style={[styles.sectionTitle, { color: colors.text.normal }]}>Детали удаления:</Text>
      {details.finalSizes && (
        <View>
          <View style={styles.row}>
            <Text style={[styles.label, { color: colors.text.muted }]}>Количество размеров:</Text>
            <Text style={[styles.value, { color: colors.text.normal }]}>{details.finalSizes.length}</Text>
          </View>
          <View style={styles.row}>
            <Text style={[styles.label, { color: colors.text.muted }]}>Общее количество:</Text>
            <Text style={[styles.value, { color: colors.text.normal }]}>{details.total} шт.</Text>
          </View>
          {isAdmin() ? (
            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.text.muted }]}>Общая стоимость:</Text>
              <Text style={[styles.value, { color: colors.text.normal }]}>{details.totalValue?.toFixed(2)} сомонӣ</Text>
            </View>
          ) : (
            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.text.muted }]}>Общая рекомендованная стоимость:</Text>
              <Text style={[styles.value, { color: colors.text.normal }]}>{details.totalRecommendedValue?.toFixed(2) || '0.00'} сомонӣ</Text>
            </View>
          )}
          <Text style={[styles.subsectionTitle, { color: colors.text.normal }]}>Размеры:</Text>
          {details.finalSizes.map((size, index) => (
            <View key={index} style={[styles.row, { marginLeft: 10 }]}>
              <Text style={[styles.label, { color: colors.text.muted }]}>Размер {size.size}:</Text>
              <Text style={[styles.value, { color: colors.text.normal }]}>{size.quantity} шт.</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );

  const renderAdminApprovedDeleteDetails = (details: any) => {
    const deletedItem = details.deletedItem || {};
    return (
      <View>
        <Text style={[styles.sectionTitle, { color: colors.text.normal }]}>Удаление одобрено администратором:</Text>
        <View>
          <View style={styles.row}>
            <Text style={[styles.label, { color: colors.text.muted }]}>Название товара:</Text>
            <Text style={[styles.value, { color: colors.text.normal }]}>{deletedItem.name || 'Неизвестно'}</Text>
          </View>
          {deletedItem.code && (
            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.text.muted }]}>Артикул:</Text>
              <Text style={[styles.value, { color: colors.text.normal }]}>{deletedItem.code}</Text>
            </View>
          )}
          {deletedItem.warehouse && (
            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.text.muted }]}>Склад:</Text>
              <Text style={[styles.value, { color: colors.text.normal }]}>{deletedItem.warehouse}</Text>
            </View>
          )}
          {deletedItem.totalQuantity !== undefined && (
            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.text.muted }]}>Было товаров:</Text>
              <Text style={[styles.value, { color: colors.text.normal }]}>{deletedItem.totalQuantity} шт.</Text>
            </View>
          )}
          <View style={[styles.infoBox, {
            backgroundColor: isDark ? 'rgba(239, 68, 68, 0.2)' : '#fef2f2',
            borderColor: '#ef4444',
            marginTop: 12
          }]}>
            <MaterialIcons name="delete-forever" size={20} color="#ef4444" style={{ marginRight: 8 }} />
            <Text style={[styles.infoText, { color: isDark ? '#f87171' : '#dc2626' }]}>
              Товар был удалён по запросу ассистента.
            </Text>
          </View>
        </View>
      </View>
    );
  };

  // Рендер для admin_approved_sale_deletion (удаление продажи с возвратом товара)
  const renderAdminApprovedSaleDeletionDetails = (details: any) => {
    const deletedTransaction = details.deletedTransaction || {};
    const transactionInfo = deletedTransaction.transaction || {};
    const saleDetails = deletedTransaction.details || {};
    const restoredQuantity = details.restoredQuantity || 0;

    return (
      <View>
        <Text style={[styles.sectionTitle, { color: colors.text.normal }]}>Возврат продажи (одобрено):</Text>
        <View>
          {transactionInfo.itemName && (
            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.text.muted }]}>Товар:</Text>
              <Text style={[styles.value, { color: colors.text.normal }]}>{transactionInfo.itemName}</Text>
            </View>
          )}
          {saleDetails.sale && (
            <>
              <View style={styles.row}>
                <Text style={[styles.label, { color: colors.text.muted }]}>Размер:</Text>
                <Text style={[styles.value, { color: colors.text.normal }]}>{saleDetails.sale.size}</Text>
              </View>
              <View style={styles.row}>
                <Text style={[styles.label, { color: colors.text.muted }]}>Количество:</Text>
                <Text style={[styles.value, { color: colors.text.normal }]}>{saleDetails.sale.quantity} шт.</Text>
              </View>
              <View style={styles.row}>
                <Text style={[styles.label, { color: colors.text.muted }]}>Цена продажи:</Text>
                <Text style={[styles.value, { color: colors.text.normal }]}>{saleDetails.sale.salePrice} ₽</Text>
              </View>
            </>
          )}
          {restoredQuantity > 0 && (
            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.text.muted }]}>Возвращено:</Text>
              <Text style={[styles.value, { color: '#22c55e' }]}>{restoredQuantity} шт.</Text>
            </View>
          )}
          <View style={[styles.infoBox, {
            backgroundColor: isDark ? 'rgba(34, 197, 94, 0.2)' : '#f0fdf4',
            borderColor: '#22c55e',
            marginTop: 12
          }]}>
            <MaterialIcons name="restore" size={20} color="#22c55e" style={{ marginRight: 8 }} />
            <Text style={[styles.infoText, { color: isDark ? '#4ade80' : '#16a34a' }]}>
              Продажа отменена, товар возвращён на склад.
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const renderAdminApprovedUpdateDetails = (details: any) => {
    const oldData = details.oldData || {};
    const newData = details.newData || {};

    // Хелпер для форматирования значений полей
    const formatFieldValue = (value: any, field: string): string => {
      if (value === null || value === undefined || value === '') {
        return '—';
      }
      if (field === 'boxSizeQuantities') {
        try {
          const boxes = typeof value === 'string' ? JSON.parse(value) : value;
          if (Array.isArray(boxes)) {
            let totalQty = 0;
            let sizeCount = 0;
            boxes.forEach((box: any[]) => {
              if (Array.isArray(box)) {
                box.forEach((item: any) => {
                  if (item && typeof item.quantity === 'number') {
                    totalQty += item.quantity;
                    sizeCount++;
                  }
                });
              }
            });
            return `${boxes.length} кор., ${sizeCount} разм., ${totalQty} шт.`;
          }
        } catch {
          return 'изменено';
        }
      }
      if (field === 'totalValue' || field === 'totalRecommendedValue') {
        return `${Number(value).toLocaleString('ru-RU')} ₽`;
      }
      if (typeof value === 'number') {
        return String(value);
      }
      if (typeof value === 'object') {
        return JSON.stringify(value).substring(0, 25) + '...';
      }
      const str = String(value);
      return str.length > 25 ? str.substring(0, 25) + '...' : str;
    };

    // Находим изменённые поля
    const changes: { field: string; label: string; old: any; new: any }[] = [];
    const fieldLabels: { [key: string]: string } = {
      name: 'Название',
      code: 'Артикул',
      warehouse: 'Склад',
      numberOfBoxes: 'Кол-во коробок',
      row: 'Ряд',
      position: 'Позиция',
      side: 'Сторона',
      totalQuantity: 'Общее кол-во',
      totalValue: 'Общая стоимость',
      totalRecommendedValue: 'Рекомендованная цена',
      boxSizeQuantities: 'Размеры/количества',
    };

    // Скрытые поля
    const hiddenFields = ['id', 'serverId', 'createdAt', 'updatedAt', 'version', 'isDeleted', 'needsSync', 'syncedAt', 'imageNeedsUpload', 'serverImageUrl'];

    for (const key of Object.keys(newData)) {
      if (hiddenFields.includes(key)) continue;
      if (JSON.stringify(oldData[key]) !== JSON.stringify(newData[key])) {
        changes.push({
          field: key,
          label: fieldLabels[key] || key,
          old: oldData[key],
          new: newData[key],
        });
      }
    }

    return (
      <View>
        <Text style={[styles.sectionTitle, { color: colors.text.normal }]}>Обновление одобрено администратором:</Text>
        <View>
          {changes.length > 0 ? (
            <>
              <Text style={[styles.subsectionTitle, { color: colors.text.normal }]}>Изменённые поля:</Text>
              {changes.map((change, index) => (
                <View key={index} style={[styles.row, { marginLeft: 10, flexDirection: 'column', alignItems: 'flex-start', marginBottom: 8 }]}>
                  <Text style={[styles.label, { color: colors.text.muted }]}>{change.label}:</Text>
                  <View style={{ flexDirection: 'row', marginTop: 2, flexWrap: 'wrap' }}>
                    <Text style={[styles.value, { color: '#ef4444', textDecorationLine: 'line-through' }]}>
                      {formatFieldValue(change.old, change.field)}
                    </Text>
                    <MaterialIcons name="arrow-forward" size={16} color={colors.text.muted} style={{ marginHorizontal: 8 }} />
                    <Text style={[styles.value, { color: '#22c55e' }]}>
                      {formatFieldValue(change.new, change.field)}
                    </Text>
                  </View>
                </View>
              ))}
            </>
          ) : (
            <Text style={[styles.noData, { color: colors.text.muted }]}>Нет деталей изменений</Text>
          )}
          <View style={[styles.infoBox, {
            backgroundColor: isDark ? 'rgba(34, 197, 94, 0.2)' : '#f0fdf4',
            borderColor: '#22c55e',
            marginTop: 12
          }]}>
            <MaterialIcons name="check-circle" size={20} color="#22c55e" style={{ marginRight: 8 }} />
            <Text style={[styles.infoText, { color: isDark ? '#4ade80' : '#16a34a' }]}>
              Изменения применены по запросу ассистента.
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const renderContent = () => {
    if (groupedTransaction.type === 'grouped') {
      const saleTx = transactions.find((tx: Transaction) => tx.action === 'sale');
      const wholesaleTx = transactions.find((tx: Transaction) => tx.action === 'wholesale');
      const updateTx = transactions.find((tx: Transaction) => tx.action === 'update');

      const saleParsed = saleTx ? parseDetails(saleTx.details) : null;
      const wholesaleParsed = wholesaleTx ? parseDetails(wholesaleTx.details) : null;
      const updateParsed = updateTx ? parseDetails(updateTx.details) : null;

      return (
        <>
          {saleParsed && renderSaleDetails(saleParsed)}
          {wholesaleParsed && renderWholesaleDetails(wholesaleParsed)}
          {updateParsed && !saleParsed && !wholesaleParsed && renderUpdateDetails(updateParsed)}
        </>
      );
    }

    const details = parseDetails(mainTransaction.details);
    if (!details) {
      return <Text style={styles.noData}>Нет дополнительных деталей</Text>;
    }

    // Проверяем на admin_approved типы
    if (details.type === 'admin_approved_delete') {
      return renderAdminApprovedDeleteDetails(details);
    }
    if (details.type === 'admin_approved_update') {
      return renderAdminApprovedUpdateDetails(details);
    }
    if (details.type === 'admin_approved_sale_deletion') {
      return renderAdminApprovedSaleDeletionDetails(details);
    }

    // Проверяем на price_update
    if (details.type === 'price_update') {
      return renderPriceUpdateDetails(details);
    }

    switch (mainTransaction.action) {
      case 'sale':
        return renderSaleDetails(details);
      case 'wholesale':
        return renderWholesaleDetails(details);
      case 'update':
        return renderUpdateDetails(details);
      case 'create':
        return renderCreateDetails(details);
      case 'delete':
        return renderDeleteDetails(details);
      default:
        return <Text style={styles.noData}>Неизвестный тип транзакции</Text>;
    }
  };

  const getActionText = (): string => {
    if (groupedTransaction.type === 'grouped') {
      // Проверяем какой тип продажи в группе
      const wholesaleTx = transactions.find((tx: Transaction) => tx.action === 'wholesale');
      const saleTx = transactions.find((tx: Transaction) => tx.action === 'sale');

      if (wholesaleTx) {
        return 'Продажа оптом';
      } else if (saleTx) {
        return 'Продажа';
      } else {
        return 'Продажа';
      }
    }

    // Проверяем детали для admin_approved типов
    const details = parseDetails(mainTransaction.details);
    if (details?.type === 'admin_approved_delete') {
      return 'Удаление (одобрено)';
    }
    if (details?.type === 'admin_approved_update') {
      return 'Обновление (одобрено)';
    }
    if (details?.type === 'admin_approved_sale_deletion') {
      return 'Возврат продажи';
    }

    switch (mainTransaction.action) {
      case 'sale':
        return 'Продажа';
      case 'wholesale':
        return 'Продажа оптом';
      case 'create':
        return 'Создание';
      case 'update':
        if (details?.type === 'price_update') {
          return 'Обновление цены';
        }
        if (details?.type === 'update') {
          return 'Обновление';
        }
        return details?.sale ? 'Продажа' : 'Обновление';
      case 'delete':
        return 'Удаление';
      default:
        return 'Действие';
    }
  };

  const isSaleTransaction = transactions.some((tx: Transaction) => {
    const details = parseDetails(tx.details);
    // Проверяем все возможные варианты транзакций продаж
    return tx.action === 'sale' ||
      tx.action === 'wholesale' ||
      (tx.action === 'update' && details?.sale) ||
      (tx.action === 'update' && details?.type === 'sale') ||
      details?.type === 'wholesale';
  });

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.modalContainer, { backgroundColor: colors.background.screen }]}>
        {/* Header */}
        <View style={[styles.modalHeader, { backgroundColor: isDark ? colors.primary.gold : '#10b981' }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <MaterialIcons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Детали транзакции</Text>
          {isSaleTransaction && isAssistant() ? (
            <TouchableOpacity onPress={handleDelete} style={styles.deleteButtonHeader}>
              <MaterialIcons name="delete" size={24} color="#fff" />
            </TouchableOpacity>
          ) : (
            <View style={styles.headerSpacer} />
          )}
        </View>

        {/* Content */}
        <ScrollView style={styles.modalContent} contentContainerStyle={styles.contentPadding}>
          {/* Header with item info and image */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 }}>
            {/* Left side - name, action, time */}
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemName, { color: colors.text.normal }]}>{mainTransaction.itemName}</Text>
              <Text style={[styles.actionText, { color: colors.text.muted }]}>{getActionText()}</Text>
              <Text style={[styles.timestamp, { color: colors.text.muted }]}>
                {new Date(mainTransaction.timestamp * 1000).toLocaleString('ru-RU')}
              </Text>
            </View>
            {/* Right side - item image */}
            {(transactionImageUri || itemData?.imageUri) && (
              <View style={{
                marginLeft: 12,
                borderRadius: 12,
                overflow: 'hidden',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.15,
                shadowRadius: 4,
                elevation: 3,
              }}>
                <Image
                  source={{ uri: transactionImageUri || itemData?.imageUri || '' }}
                  style={{
                    width: 70,
                    height: 70,
                    borderRadius: 12,
                    backgroundColor: colors.background.card,
                  }}
                  resizeMode="cover"
                />
              </View>
            )}
          </View>
          {renderContent()}
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  closeButton: {
    padding: 4,
  },
  modalTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },
  headerSpacer: {
    width: 24,
  },
  deleteButtonHeader: {
    padding: 4,
    marginLeft: 12,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginVertical: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  modalContent: {
    flex: 1,
  },
  contentPadding: {
    padding: 16,
  },
  itemName: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  actionText: {
    fontSize: 16,
    marginBottom: 8,
  },
  timestamp: {
    fontSize: 14,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  subsectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  label: {
    fontSize: 14,
  },
  value: {
    fontSize: 14,
    fontWeight: '500',
  },
  noData: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
});

export default TransactionDetailsModal;