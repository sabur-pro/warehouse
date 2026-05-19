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
import { getItemById, getTransactionsBySaleId } from '../database/database';
import { GroupedTransaction } from './TransactionsList';
import { useAuth } from '../src/contexts/AuthContext';
import { useTheme } from '../src/contexts/ThemeContext';
import { useCurrency } from '../src/contexts/CurrencyContext';
import { formatCurrency as fmtCur } from '../src/utils/formatters';
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

interface ReceiptLine {
  itemUuid?: string;
  itemName?: string;
  itemImageUri?: string | null;
  quantity?: number;
  unitPrice?: number;
  boxIndex?: number;
  size?: number | string;
  sizeType?: string;
}

interface ReceiptInfo {
  line?: ReceiptLine;
}

interface TransactionDetails {
  type: 'sale' | 'create' | 'update' | 'delete' | 'wholesale' | 'price_update' | 'receipt' | 'admin_approved_delete' | 'admin_approved_update' | 'admin_approved_sale_deletion';
  line?: ReceiptLine;
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
  // Новые поля для группировки продаж
  saleId?: string;
  itemName?: string;
  paymentInfo?: {
    method: 'cash' | 'card' | 'mixed';
    bank?: 'alif' | 'dc';
    cashAmount?: number;
    cardAmount?: number;
  };
  clientId?: number | null;
  discount?: { mode: 'amount' | 'percent'; value: number } | null;
  totalProfit?: number;
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
  // Валюту берём из самой транзакции — фиксируется в момент продажи, поэтому
  // история отображается корректно даже после смены валюты аккаунта.
  // Если транзакция старая и currency=null — падаем на текущую валюту аккаунта.
  const { currencyCode: activeCurrencyCode } = useCurrency();
  const txCurrency = (groupedTransaction?.transactions?.[0]?.currency) || activeCurrencyCode;
  // Короткий ярлык валюты транзакции — подставляется вместо
  // хардкода "сомонӣ"/"сом" в JSX-выражениях и template-литералах ниже.
  const currencyShort = React.useMemo(() => {
    const { getCurrency } = require('../src/config/currencies');
    return getCurrency(txCurrency).shortLabel as string;
  }, [txCurrency]);
  const fc = (n: number) => fmtCur(n, txCurrency);
  const colors = getThemeColors(isDark);
  const transactions = groupedTransaction.transactions;
  const mainTransaction = transactions[0];
  const { deleteTransaction } = useDatabase();

  // Компонент для строки с пунктирным разделителем
  const DetailRow = ({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) => (
    <View style={styles.row}>
      <Text style={[styles.label, { color: colors.text.muted }]}>{label}</Text>
      <Text
        style={[styles.rowDotsText, { color: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)' }]}
        numberOfLines={1}
        ellipsizeMode="clip"
      >
        {"................................................................................................"}
      </Text>
      <Text style={[styles.value, { color: valueColor || colors.text.normal }]}>{value}</Text>
    </View>
  );

  // State для хранения данных товара (картинка)
  const [itemData, setItemData] = useState<Item | null>(null);

  // State для хранения связанных транзакций по saleId
  const [relatedTransactions, setRelatedTransactions] = useState<Transaction[]>([]);

  // State для хранения загруженных изображений для групповых транзакций
  // Ключ: itemName, значение: imageUri
  const [loadedItemImages, setLoadedItemImages] = useState<Map<string, string | null>>(new Map());

  // Получаем картинку - сначала из транзакции, потом из БД если нужно
  const transactionImageUri = mainTransaction.itemImageUri;

  // Получаем saleId из деталей транзакции
  let mainDetails: any = null;
  let saleId: string | undefined;
  try {
    mainDetails = mainTransaction.details ? JSON.parse(mainTransaction.details) : null;
    saleId = mainDetails?.saleId;
    console.log(`📋 TransactionDetailsModal: mainTx.id=${mainTransaction.id}, type=${mainDetails?.type}, saleId=${saleId || 'none'}`);
  } catch (e) {
    console.log(`❌ TransactionDetailsModal: Failed to parse mainTransaction.details`);
  }

  // Загрузка связанных транзакций по saleId
  useEffect(() => {
    if (!visible) {
      setRelatedTransactions([]);
      return;
    }

    console.log(`🔄 TransactionDetailsModal useEffect: visible=${visible}, saleId=${saleId}, type=${mainDetails?.type}`);

    if (saleId && mainDetails?.type === 'sale') {
      console.log(`🔍 Loading related transactions for saleId=${saleId}...`);
      getTransactionsBySaleId(saleId)
        .then(txs => {
          console.log(`📦 Loaded ${txs.length} related transactions for saleId=${saleId}`);
          txs.forEach(tx => console.log(`   - TX ${tx.id}: ${tx.itemName}`));
          setRelatedTransactions(txs);
        })
        .catch(err => console.error('Failed to load related transactions:', err));
    } else {
      console.log(`⚠️ Not loading related: saleId=${saleId}, type=${mainDetails?.type}`);
    }
  }, [visible, saleId]);

  // Загрузка изображений товаров для групповых транзакций (когда itemImageUri отсутствует)
  useEffect(() => {
    if (!visible) {
      setLoadedItemImages(new Map());
      return;
    }

    const txList = relatedTransactions.length > 0 ? relatedTransactions : transactions;

    // Собираем все уникальные названия товаров для загрузки картинок
    let uniqueItemNames: string[] = [];

    // 1. Из обычных транзакций без изображений
    if (txList.length > 1) {
      const txsWithoutImages = txList.filter(tx => !tx.itemImageUri);
      if (txsWithoutImages.length > 0) {
        uniqueItemNames.push(...txsWithoutImages.map(tx => tx.itemName));
      }
    }

    // 2. Из allDeletedTransactions в возвратных транзакциях (admin_approved_sale_deletion)
    // Используем mainDetails который парсится вне useEffect
    if (mainDetails?.type === 'admin_approved_sale_deletion') {
      const allDeletedTransactions = mainDetails.allDeletedTransactions || [];
      if (allDeletedTransactions.length > 0) {
        uniqueItemNames.push(...allDeletedTransactions.map((tx: any) => tx.itemName));
      }
    }

    // Убираем дубликаты
    uniqueItemNames = [...new Set(uniqueItemNames.filter(Boolean))];

    if (uniqueItemNames.length === 0) return;

    // Проверяем, все ли изображения уже загружены - если да, выходим
    const allAlreadyLoaded = uniqueItemNames.every(name => loadedItemImages.has(name));
    if (allAlreadyLoaded) {
      console.log(`🖼️ All ${uniqueItemNames.length} images already loaded, skipping...`);
      return;
    }

    console.log(`🖼️ Loading images for ${uniqueItemNames.length} unique items...`);

    const loadImages = async () => {
      const newImages = new Map<string, string | null>();

      for (const itemName of uniqueItemNames) {
        // Пропускаем если уже загружено
        if (loadedItemImages.has(itemName)) continue;

        // Пытаемся найти itemId из транзакций
        const tx = txList.find(t => t.itemName === itemName);
        const deletedTx = mainDetails?.allDeletedTransactions?.find((t: any) => t.itemName === itemName);
        const itemId = tx?.itemId || deletedTx?.itemId || 0;

        try {
          const item = await getItemById(itemId, itemName);
          if (item?.imageUri) {
            console.log(`  ✅ Loaded image for "${itemName}": ${item.imageUri}`);
            newImages.set(itemName, item.imageUri);
          } else {
            console.log(`  ⚠️ No image found for "${itemName}"`);
            newImages.set(itemName, null);
          }
        } catch (err) {
          console.error(`  ❌ Failed to load image for "${itemName}":`, err);
          newImages.set(itemName, null);
        }
      }

      // Только обновляем если есть новые изображения
      if (newImages.size > 0) {
        setLoadedItemImages(prev => {
          const updated = new Map(prev);
          newImages.forEach((val, key) => updated.set(key, val));
          return updated;
        });
      }
    };

    loadImages();
    // Используем mainTransaction.id как стабильную зависимость вместо mainDetails
  }, [visible, relatedTransactions.length, transactions.length, mainTransaction.id]);

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
    const txList = relatedTransactions.length > 0 ? relatedTransactions : transactions;
    const isMultiItem = txList.length > 1;

    const title = isAssistantUser
      ? (isMultiItem ? `Запросить удаление (${txList.length} поз.)?` : 'Запросить удаление?')
      : (isMultiItem ? `Удалить продажу (${txList.length} поз.)?` : 'Удалить транзакцию?');

    const message = isAssistantUser
      ? 'Будет отправлен запрос на удаление транзакции администратору для одобрения.'
      : (isMultiItem
        ? `Это действие отменит продажу всех ${txList.length} товаров и вернёт их на склад. Это нельзя отменить.`
        : 'Это действие отменит продажу и вернёт товар на склад. Это нельзя отменить.');
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

  const renderSaleDetails = (details: TransactionDetails, imageUri?: string | null, itemNameForImage?: string, isGrouped: boolean = false) => {
    // Хелпер для названия способа оплаты
    const getPaymentMethodName = (method?: 'cash' | 'card' | 'mixed') => {
      switch (method) {
        case 'cash': return 'Наличные';
        case 'card': return 'Карта';
        case 'mixed': return 'Смешанная';
        default: return 'Не указан';
      }
    };

    // Хелпер для названия банка
    const getBankName = (bank?: 'alif' | 'dc') => {
      switch (bank) {
        case 'alif': return 'АлифБанк';
        case 'dc': return 'ДушанбеСити';
        default: return null;
      }
    };

    return (
      <View>
        {/* Изображение и название товара в каждой детали продажи */}
        {(imageUri || itemNameForImage) && (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            {imageUri ? (
              <Image
                source={{ uri: imageUri }}
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: 10,
                  backgroundColor: colors.background.card,
                  marginRight: 12,
                }}
                resizeMode="cover"
              />
            ) : (
              <View style={{
                width: 60,
                height: 60,
                borderRadius: 10,
                backgroundColor: colors.background.card,
                justifyContent: 'center',
                alignItems: 'center',
                marginRight: 12,
              }}>
                <MaterialIcons name="image" size={28} color={colors.text.muted} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text.normal, fontSize: 16, fontWeight: '600' }} numberOfLines={2}>
                {itemNameForImage || details.itemName || 'Товар'}
              </Text>
            </View>
          </View>
        )}
        <Text style={[styles.sectionTitle, { color: colors.text.normal }]}>Детали продажи:</Text>
        {details.sale ? (
          <View>
            {/* Название товара если есть */}
            {details.itemName && (
              <DetailRow label="Товар" value={details.itemName} valueColor={colors.text.normal} />
            )}
            <DetailRow label="Размер" value={String(details.sale.size)} />
            <DetailRow label="Количество" value={`${details.sale.quantity} шт.`} />
            <DetailRow label="Было товаров" value={`${details.sale.previousQuantity} шт.`} />
            <DetailRow label="Осталось товаров" value={`${details.sale.previousQuantity - details.sale.quantity} шт.`} />

            {/* Способ оплаты — только если НЕ групповая продажа (для групповых выводится один раз выше) */}
            {!isGrouped && details.paymentInfo && (
              <>
                <View style={[styles.divider, { borderBottomColor: colors.border.normal }]} />
                <Text style={[styles.subsectionTitle, { color: colors.text.normal }]}>Способ оплаты:</Text>
                <DetailRow label="Тип" value={getPaymentMethodName(details.paymentInfo.method)} />
                {getBankName(details.paymentInfo.bank) && (
                  <DetailRow
                    label="Банк"
                    value={getBankName(details.paymentInfo.bank) || ''}
                    valueColor={details.paymentInfo.bank === 'alif' ? '#00C853' : '#1976D2'}
                  />
                )}
                {details.paymentInfo.method === 'mixed' && (
                  <>
                    <DetailRow label="Наличными" value={`${(details.paymentInfo.cashAmount || 0).toLocaleString()} ${currencyShort}`} />
                    <DetailRow label="Картой" value={`${(details.paymentInfo.cardAmount || 0).toLocaleString()} ${currencyShort}`} />
                  </>
                )}
              </>
            )}

            {/* Скидка на весь заказ — только если НЕ групповая */}
            {!isGrouped && details.discount && (
              <DetailRow
                label="Скидка"
                value={details.discount.mode === 'percent' ? `${details.discount.value}%` : `${details.discount.value} ${currencyShort}`}
                valueColor="#F59E0B"
              />
            )}

            {/* Распределённая скидка для этого товара */}
            {(details.sale as any).appliedDiscount > 0 && (
              <DetailRow
                label="Скидка на товар"
                value={`-${(details.sale as any).appliedDiscount.toLocaleString()} ${currencyShort}`}
                valueColor="#EF4444"
              />
            )}

            {/* Итого после скидки */}
            {(details.sale as any).actualSaleAmount !== undefined && (details.sale as any).appliedDiscount > 0 && (
              <DetailRow
                label="Итого со скидкой"
                value={`${(details.sale as any).actualSaleAmount.toLocaleString()} ${currencyShort}`}
                valueColor="#10b981"
              />
            )}

            <View style={[styles.divider, { borderBottomColor: colors.border.normal }]} />

            {isAssistant() ? (
              <>
                <DetailRow label="Рекомендуемая цена" value={`${details.sale.salePrice.toFixed(2)} ${currencyShort}`} />
                <DetailRow
                  label="Цена продажи"
                  value={`${(details.sale as any).actualSaleAmount !== undefined
                    ? ((details.sale as any).actualSaleAmount / details.sale.quantity).toFixed(2)
                    : details.sale.salePrice.toFixed(2)} ${currencyShort}`}
                />
              </>
            ) : (
              <>
                <DetailRow label="Рекомендуемая цена" value={`${details.sale.salePrice.toFixed(2)} ${currencyShort}`} />
                <DetailRow
                  label="Цена продажи"
                  value={`${(details.sale as any).actualSaleAmount !== undefined
                    ? ((details.sale as any).actualSaleAmount / details.sale.quantity).toFixed(2)
                    : details.sale.salePrice.toFixed(2)} ${currencyShort}`}
                />
                <DetailRow label="Себестоимость пары" value={`${details.sale.costPrice.toFixed(2)} ${currencyShort}`} />
                <DetailRow
                  label="Прибыль"
                  value={`${details.sale.profit.toFixed(2)} ${currencyShort}`}
                  valueColor={details.sale.profit > 0 ? '#10b981' : '#ef4444'}
                />
              </>
            )}
          </View>
        ) : (
          <Text style={[styles.noData, { color: colors.text.muted }]}>Нет деталей продажи</Text>
        )}
      </View>
    );
  };

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
              <Text style={[styles.value, { color: colors.text.normal }]}>{details.wholesale.totalCostPrice.toFixed(2)} {currencyShort}</Text>
            </View>
          )}
          <View style={styles.row}>
            <Text style={[styles.label, { color: colors.text.muted }]}>Общая цена продажи:</Text>
            <Text style={[styles.value, { color: colors.text.normal }]}>{details.wholesale.totalSalePrice.toFixed(2)} {currencyShort}</Text>
          </View>
          {isAdmin() && (
            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.text.muted }]}>Общая прибыль:</Text>
              <Text style={[
                styles.value,
                { color: details.wholesale.totalProfit > 0 ? '#10b981' : '#ef4444' }
              ]}>
                {details.wholesale.totalProfit.toFixed(2)} {currencyShort}
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
                    <Text style={[styles.value, { color: colors.text.normal }]}>{box.costPrice.toFixed(2)} {currencyShort}</Text>
                  </View>
                )}
                <View style={styles.row}>
                  <Text style={[styles.label, { color: colors.text.muted }]}>Цена продажи:</Text>
                  <Text style={[styles.value, { color: colors.text.normal }]}>{box.salePrice.toFixed(2)} {currencyShort}</Text>
                </View>
                {isAdmin() && (
                  <View style={styles.row}>
                    <Text style={[styles.label, { color: colors.text.muted }]}>Прибыль:</Text>
                    <Text style={[
                      styles.value,
                      { color: box.profit > 0 ? '#10b981' : '#ef4444' }
                    ]}>
                      {box.profit.toFixed(2)} {currencyShort}
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
                <Text style={[styles.value, { color: colors.text.normal }]}>{details.oldTotalValue?.toFixed(2) || '0.00'} {currencyShort}</Text>
              </View>
              <View style={styles.row}>
                <Text style={[styles.label, { color: colors.text.muted }]}>Стала общая стоимость:</Text>
                <Text style={[styles.value, { color: colors.text.normal }]}>{details.newTotalValue?.toFixed(2) || '0.00'} {currencyShort}</Text>
              </View>
              <View style={styles.row}>
                <Text style={[styles.label, { color: colors.text.muted }]}>Разница:</Text>
                <Text style={[
                  styles.value,
                  { color: costDiff > 0 ? '#10b981' : costDiff < 0 ? '#ef4444' : colors.text.muted, fontWeight: 'bold' }
                ]}>
                  {costDiff > 0 ? '+' : ''}{costDiff.toFixed(2)} {currencyShort}
                </Text>
              </View>
            </>
          )}

          {hasRecommendedChange && (
            <>
              <Text style={[styles.subsectionTitle, { color: colors.text.normal, marginTop: 12, marginBottom: 8 }]}>Рекомендованная цена продажи:</Text>
              <View style={styles.row}>
                <Text style={[styles.label, { color: colors.text.muted }]}>Была:</Text>
                <Text style={[styles.value, { color: colors.text.normal }]}>{details.oldRecommendedPrice?.toFixed(2) || '0.00'} {currencyShort}</Text>
              </View>
              <View style={styles.row}>
                <Text style={[styles.label, { color: colors.text.muted }]}>Стала:</Text>
                <Text style={[styles.value, { color: colors.text.normal }]}>{details.newRecommendedPrice?.toFixed(2) || '0.00'} {currencyShort}</Text>
              </View>
              <View style={styles.row}>
                <Text style={[styles.label, { color: colors.text.muted }]}>Разница:</Text>
                <Text style={[
                  styles.value,
                  { color: recommendedDiff > 0 ? '#10b981' : recommendedDiff < 0 ? '#ef4444' : colors.text.muted, fontWeight: 'bold' }
                ]}>
                  {recommendedDiff > 0 ? '+' : ''}{recommendedDiff.toFixed(2)} {currencyShort}
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
                <Text style={[styles.value, { color: colors.text.normal }]}>{details.sale.recommendedSellingPrice?.toFixed(2) || '0.00'} {currencyShort}</Text>
              </View>
              <View style={styles.row}>
                <Text style={[styles.label, { color: colors.text.muted }]}>Цена продажи:</Text>
                <Text style={[styles.value, { color: colors.text.normal }]}>{details.sale.salePrice.toFixed(2)} {currencyShort}</Text>
              </View>
            </>
          ) : (
            <>
              <View style={styles.row}>
                <Text style={[styles.label, { color: colors.text.muted }]}>Себестоимость пары:</Text>
                <Text style={[styles.value, { color: colors.text.normal }]}>{details.sale.costPrice.toFixed(2)} {currencyShort}</Text>
              </View>
              <View style={styles.row}>
                <Text style={[styles.label, { color: colors.text.muted }]}>Рекомендуемая цена:</Text>
                <Text style={[styles.value, { color: colors.text.normal }]}>{details.sale.recommendedSellingPrice?.toFixed(2) || '0.00'} {currencyShort}</Text>
              </View>
              <View style={styles.row}>
                <Text style={[styles.label, { color: colors.text.muted }]}>Цена продажи:</Text>
                <Text style={[styles.value, { color: colors.text.normal }]}>{details.sale.salePrice.toFixed(2)} {currencyShort}</Text>
              </View>
              <View style={styles.row}>
                <Text style={[styles.label, { color: colors.text.muted }]}>Прибыль:</Text>
                <Text style={[
                  styles.value,
                  { color: details.sale.profit > 0 ? '#10b981' : '#ef4444' }
                ]}>
                  {details.sale.profit.toFixed(2)} {currencyShort}
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
                  <Text style={[styles.value, { color: colors.text.normal }]}>{details.totalValueAfter?.toFixed(2)} {currencyShort}</Text>
                </View>
              ) : (
                <View style={styles.row}>
                  <Text style={[styles.label, { color: colors.text.muted }]}>Новая рекомендованная стоимость:</Text>
                  <Text style={[styles.value, { color: colors.text.normal }]}>{details.totalRecommendedValueAfter?.toFixed(2) || '0.00'} {currencyShort}</Text>
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
              <Text style={[styles.value, { color: colors.text.normal }]}>{details.totalValue?.toFixed(2)} {currencyShort}</Text>
            </View>
          ) : (
            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.text.muted }]}>Общая рекомендованная стоимость:</Text>
              <Text style={[styles.value, { color: colors.text.normal }]}>{details.totalRecommendedValue?.toFixed(2) || '0.00'} {currencyShort}</Text>
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
              <Text style={[styles.value, { color: colors.text.normal }]}>{details.totalValue?.toFixed(2)} {currencyShort}</Text>
            </View>
          ) : (
            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.text.muted }]}>Общая рекомендованная стоимость:</Text>
              <Text style={[styles.value, { color: colors.text.normal }]}>{details.totalRecommendedValue?.toFixed(2) || '0.00'} {currencyShort}</Text>
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

  const renderReceiptDetails = (details: TransactionDetails) => {
    const line = details.line || {};
    const quantity = line.quantity ?? 0;
    const unitPrice = line.unitPrice ?? 0;
    const total = quantity * unitPrice;
    return (
      <View>
        <Text style={[styles.sectionTitle, { color: colors.text.normal }]}>Детали прихода:</Text>
        {line.size !== undefined && line.size !== null && line.size !== '' && (
          <DetailRow label="Размер" value={String(line.size)} />
        )}
        {line.sizeType && (
          <DetailRow label="Размерный ряд" value={line.sizeType} />
        )}
        {typeof line.boxIndex === 'number' && (
          <DetailRow label="Коробка" value={`№${line.boxIndex + 1}`} />
        )}
        <DetailRow label="Количество" value={`${quantity} шт.`} />
        <DetailRow label="Цена закупки" value={`${unitPrice.toFixed(2)} ${currencyShort}`} />
        <DetailRow
          label="Сумма прихода"
          value={`${total.toFixed(2)} ${currencyShort}`}
          valueColor={isDark ? colors.primary.gold : '#0ea5e9'}
        />
      </View>
    );
  };

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
    const restoredQuantity = details.restoredQuantity || saleDetails.sale?.quantity || 0;
    const totalTransactionsDeleted = details.totalTransactionsDeleted || 1;
    const returnSaleId = details.saleId;

    // Хелперы для отображения
    const getPaymentMethodName = (method?: string) => {
      switch (method) {
        case 'cash': return 'Наличные';
        case 'card': return 'Карта';
        case 'mixed': return 'Смешанная';
        default: return null;
      }
    };

    const getBankName = (bank?: string) => {
      switch (bank) {
        case 'alif': return 'АлифБанк';
        case 'dc': return 'ДушанбеСити';
        default: return null;
      }
    };

    // Рендер одной позиции возврата с картинкой
    const renderReturnedItem = (
      itemName: string,
      saleInfo: any,
      imageUri: string | null,
      index?: number,
      showPositionLabel?: boolean
    ) => (
      <View key={index ?? 0} style={{
        marginBottom: 16,
        borderLeftWidth: 2,
        borderLeftColor: '#22c55e',
        paddingLeft: 12
      }}>
        {showPositionLabel && index !== undefined && (
          <Text style={{
            color: colors.text.muted,
            fontSize: 12,
            marginBottom: 4,
            fontWeight: '600'
          }}>
            Возврат {index + 1}
          </Text>
        )}
        {/* Изображение и название товара */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              style={{
                width: 60,
                height: 60,
                borderRadius: 10,
                backgroundColor: colors.background.card,
                marginRight: 12,
              }}
              resizeMode="cover"
            />
          ) : (
            <View style={{
              width: 60,
              height: 60,
              borderRadius: 10,
              backgroundColor: colors.background.card,
              justifyContent: 'center',
              alignItems: 'center',
              marginRight: 12,
            }}>
              <MaterialIcons name="image" size={28} color={colors.text.muted} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text.normal, fontSize: 16, fontWeight: '600' }} numberOfLines={2}>
              {itemName || 'Товар'}
            </Text>
          </View>
        </View>
        {/* Детали продажи */}
        {saleInfo && (
          <>
            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.text.muted }]}>Размер:</Text>
              <Text style={[styles.value, { color: colors.text.normal }]}>{saleInfo.size}</Text>
            </View>
            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.text.muted }]}>Количество:</Text>
              <Text style={[styles.value, { color: colors.text.normal }]}>{saleInfo.quantity} шт.</Text>
            </View>
            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.text.muted }]}>Цена продажи:</Text>
              <Text style={[styles.value, { color: colors.text.normal }]}>{saleInfo.salePrice} {currencyShort}</Text>
            </View>
          </>
        )}
      </View>
    );

    // Используем allDeletedTransactions из деталей (сохранённые сервером)
    const allDeletedTransactions = details.allDeletedTransactions || [];

    // Проверяем есть ли данные о нескольких транзакциях
    const hasMultipleItems = totalTransactionsDeleted > 1 && allDeletedTransactions.length > 1;

    return (
      <View>
        <Text style={[styles.sectionTitle, { color: colors.text.normal }]}>
          Возврат продажи ({totalTransactionsDeleted} {totalTransactionsDeleted === 1 ? 'товар' : totalTransactionsDeleted < 5 ? 'товара' : 'товаров'}):
        </Text>
        <View>
          {hasMultipleItems ? (
            // Показываем все удалённые транзакции из сохранённых данных
            allDeletedTransactions.map((txData: any, index: number) => {
              const txImageUri = loadedItemImages.get(txData.itemName) || null;
              return renderReturnedItem(
                txData.itemName,
                txData.sale,
                txImageUri,
                index,
                true
              );
            })
          ) : (
            // Fallback: показываем данные из deletedTransaction (один товар)
            renderReturnedItem(
              saleDetails.itemName || transactionInfo.itemName,
              saleDetails.sale,
              transactionImageUri || itemData?.imageUri || loadedItemImages.get(saleDetails.itemName || transactionInfo.itemName || '') || null,
              0,
              false
            )
          )}

          {/* Способ оплаты (общий для всей группы) */}
          {saleDetails.paymentInfo && (
            <>
              <View style={[styles.divider, { borderBottomColor: colors.border.normal }]} />
              <View style={styles.row}>
                <Text style={[styles.label, { color: colors.text.muted }]}>Способ оплаты:</Text>
                <Text style={[styles.value, { color: colors.text.normal }]}>
                  {getPaymentMethodName(saleDetails.paymentInfo.method)}
                </Text>
              </View>
              {getBankName(saleDetails.paymentInfo.bank) && (
                <View style={styles.row}>
                  <Text style={[styles.label, { color: colors.text.muted }]}>Банк:</Text>
                  <Text style={[styles.value, {
                    color: saleDetails.paymentInfo.bank === 'alif' ? '#00C853' : '#1976D2',
                    fontWeight: '500'
                  }]}>
                    {getBankName(saleDetails.paymentInfo.bank)}
                  </Text>
                </View>
              )}
            </>
          )}

          {restoredQuantity > 0 && (
            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.text.muted }]}>Всего возвращено:</Text>
              <Text style={[styles.value, { color: '#22c55e', fontWeight: '600' }]}>{restoredQuantity} шт.</Text>
            </View>
          )}
          <View style={[styles.infoBox, {
            backgroundColor: isDark ? 'rgba(34, 197, 94, 0.2)' : '#f0fdf4',
            borderColor: '#22c55e',
            marginTop: 12
          }]}>
            <MaterialIcons name="restore" size={20} color="#22c55e" style={{ marginRight: 8 }} />
            <Text style={[styles.infoText, { color: isDark ? '#4ade80' : '#16a34a' }]}>
              Продажа отменена, товар{totalTransactionsDeleted > 1 ? 'ы' : ''} возвращён{totalTransactionsDeleted > 1 ? 'ы' : ''} на склад.
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
    // Используем загруженные связанные транзакции если есть, иначе из пропса
    const txList = relatedTransactions.length > 0 ? relatedTransactions : transactions;

    // Если это групповая транзакция или просто нашли связанные по saleId
    if (groupedTransaction.type === 'grouped' || txList.length > 1) {
      const saleTxs = txList.filter(tx => tx.action === 'sale');
      const wholesaleTxs = txList.filter(tx => tx.action === 'wholesale');
      const updateTxs = txList.filter(tx => tx.action === 'update');

      return (
        <View>
          {saleTxs.length > 0 && (
            <View>
              {/* Блок оплаты и скидки — один раз для всей продажи */}
              {(() => {
                const firstTxDetails = parseDetails(saleTxs[0].details);
                if (!firstTxDetails) return null;

                const getPaymentMethodName = (method?: 'cash' | 'card' | 'mixed') => {
                  switch (method) {
                    case 'cash': return 'Наличные';
                    case 'card': return 'Карта';
                    case 'mixed': return 'Смешанная';
                    default: return 'Не указан';
                  }
                };

                const getBankName = (bank?: 'alif' | 'dc') => {
                  switch (bank) {
                    case 'alif': return 'АлифБанк';
                    case 'dc': return 'ДушанбеСити';
                    default: return null;
                  }
                };

                // Считаем общую скидку по всем товарам
                let totalAppliedDiscount = 0;
                saleTxs.forEach(tx => {
                  const txDetails = parseDetails(tx.details);
                  if (txDetails?.sale && (txDetails.sale as any).appliedDiscount) {
                    totalAppliedDiscount += (txDetails.sale as any).appliedDiscount;
                  }
                });

                return (
                  <View style={{
                    marginBottom: 16,
                    padding: 12,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#f9fafb',
                    borderRadius: 12
                  }}>
                    {/* Способ оплаты */}
                    {firstTxDetails.paymentInfo && (
                      <>
                        <Text style={[styles.subsectionTitle, { color: colors.text.normal, marginBottom: 8 }]}>Способ оплаты:</Text>
                        <DetailRow label="Тип" value={getPaymentMethodName(firstTxDetails.paymentInfo.method)} />
                        {getBankName(firstTxDetails.paymentInfo.bank) && (
                          <DetailRow
                            label="Банк"
                            value={getBankName(firstTxDetails.paymentInfo.bank) || ''}
                            valueColor={firstTxDetails.paymentInfo.bank === 'alif' ? '#00C853' : '#1976D2'}
                          />
                        )}
                        {firstTxDetails.paymentInfo.method === 'mixed' && (
                          <>
                            <DetailRow label="Наличными" value={`${(firstTxDetails.paymentInfo.cashAmount || 0).toLocaleString()} ${currencyShort}`} />
                            <DetailRow label="Картой" value={`${(firstTxDetails.paymentInfo.cardAmount || 0).toLocaleString()} ${currencyShort}`} />
                          </>
                        )}
                      </>
                    )}

                    {/* Скидка — общая информация */}
                    {firstTxDetails.discount && (
                      <DetailRow
                        label="Скидка"
                        value={firstTxDetails.discount.mode === 'percent'
                          ? `${firstTxDetails.discount.value}%${totalAppliedDiscount > 0 ? ` (−${totalAppliedDiscount.toLocaleString()} ${currencyShort})` : ''}`
                          : `${firstTxDetails.discount.value} ${currencyShort}${totalAppliedDiscount > 0 ? ` (−${totalAppliedDiscount.toLocaleString()} ${currencyShort})` : ''}`}
                        valueColor="#F59E0B"
                      />
                    )}
                  </View>
                );
              })()}

              {saleTxs.length > 1 && (
                <Text style={[styles.sectionTitle, { color: colors.text.normal, marginBottom: 8 }]}>
                  Товары в продаже ({saleTxs.length}):
                </Text>
              )}
              {saleTxs.map((tx, index) => {
                const details = parseDetails(tx.details);
                if (!details) return null;
                return (
                  <View key={tx.id} style={{
                    marginBottom: 16,
                    borderLeftWidth: 2,
                    borderLeftColor: colors.border.normal,
                    paddingLeft: 12
                  }}>
                    {saleTxs.length > 1 && (
                      <Text style={{
                        color: colors.text.muted,
                        fontSize: 12,
                        marginBottom: 4,
                        fontWeight: '600'
                      }}>
                        Позиция {index + 1}
                      </Text>
                    )}
                    {renderSaleDetails(details, tx.itemImageUri || loadedItemImages.get(tx.itemName) || null, tx.itemName, true)}
                  </View>
                );
              })}
            </View>
          )}

          {wholesaleTxs.length > 0 && wholesaleTxs.map(tx => {
            const details = parseDetails(tx.details);
            return details ? renderWholesaleDetails(details) : null;
          })}

          {updateTxs.length > 0 && saleTxs.length === 0 && wholesaleTxs.length === 0 &&
            updateTxs.map(tx => {
              const details = parseDetails(tx.details);
              return details ? renderUpdateDetails(details) : null;
            })
          }
        </View>
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

    // Приход (от поставщика)
    if (details.type === 'receipt' || mainTransaction.action === 'receipt') {
      return renderReceiptDetails(details);
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
      // 'receipt' обработан раньше (если details.type === 'receipt' или action === 'receipt')
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

    if (details?.type === 'receipt') {
      return 'Приход';
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
      case 'receipt':
        return 'Приход';
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
          {/* Header with item info - images are now shown in each sale detail */}
          {(() => {
            // Для групповых транзакций - собираем все уникальные товары
            const txList = relatedTransactions.length > 0 ? relatedTransactions : transactions;
            const uniqueItems = txList.reduce((acc: { name: string; imageUri: string | null }[], tx) => {
              if (!acc.find(item => item.name === tx.itemName)) {
                acc.push({ name: tx.itemName, imageUri: tx.itemImageUri || null });
              }
              return acc;
            }, []);

            const isMultiItem = uniqueItems.length > 1;
            const displayName = isMultiItem
              ? `${uniqueItems[0].name} и еще ${uniqueItems.length - 1}`
              : mainTransaction.itemName;

            // Для одиночных транзакций показываем изображение в шапке
            const showHeaderImage = !isMultiItem;
            const singleImageUri = !isMultiItem ? (transactionImageUri || itemData?.imageUri) : null;

            return (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 }}>
                {/* Image for single item transactions */}
                {showHeaderImage && (
                  <View style={{ marginRight: 12 }}>
                    {singleImageUri ? (
                      <Image
                        source={{ uri: singleImageUri }}
                        style={{
                          width: 70,
                          height: 70,
                          borderRadius: 12,
                          backgroundColor: colors.background.card,
                        }}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={{
                        width: 70,
                        height: 70,
                        borderRadius: 12,
                        backgroundColor: colors.background.card,
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}>
                        <MaterialIcons name="image" size={28} color={colors.text.muted} />
                      </View>
                    )}
                  </View>
                )}
                {/* Name, action, time */}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemName, { color: colors.text.normal }]}>{displayName}</Text>
                  <Text style={[styles.actionText, { color: colors.text.muted }]}>{getActionText()}</Text>
                  <Text style={[styles.timestamp, { color: colors.text.muted }]}>
                    {new Date(mainTransaction.timestamp > 1e12 ? mainTransaction.timestamp : mainTransaction.timestamp * 1000).toLocaleString('ru-RU')}
                  </Text>
                  {isMultiItem && (
                    <Text style={{ color: colors.text.muted, fontSize: 12, marginTop: 4 }}>
                      {uniqueItems.length} товаров в продаже
                    </Text>
                  )}
                </View>
              </View>
            );
          })()}
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
    alignItems: 'center',
    paddingVertical: 6,
  },
  label: {
    fontSize: 14,
    flexShrink: 0,
    marginRight: 4,
  },
  rowDotsText: {
    flex: 1,
    fontSize: 12,
    letterSpacing: 2,
    textAlign: 'center',
    textAlignVertical: 'bottom',
    includeFontPadding: false,
    marginBottom: 2,
  },
  value: {
    fontSize: 14,
    fontWeight: '500',
    flexShrink: 0,
    textAlign: 'right',
    marginLeft: 4,
  },
  noData: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  divider: {
    borderBottomWidth: 1,
    marginVertical: 12,
  },
});

export default TransactionDetailsModal;