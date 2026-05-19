// src/screens/WarehouseScreen.tsx
import React, { useRef, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { ItemList } from '../../components/ItemList';
import { AddItemButton, AddItemButtonRef } from '../../components/AddItemButton';
import { useScanLauncher } from '../hooks/useScanLauncher';
import ItemLookupService from '../services/ItemLookupService';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useCart } from '../contexts/CartContext';
import { getThemeColors, shadows } from '../../constants/theme';

interface ItemListRef {
  openItemById: (itemId: number, context?: { boxIndex?: number; size?: number | string }, itemUuid?: string, itemName?: string) => void;
  refresh: () => void;
}

const WarehouseScreen: React.FC = () => {
  const { user, isAssistant } = useAuth();
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);
  const { cartItems } = useCart();
  const navigation = useNavigation<any>();
  const itemListRef = useRef<ItemListRef>(null);
  const addItemRef = useRef<AddItemButtonRef>(null);

  const handleQRScanned = (data: string) => {
    console.log('🏬 WarehouseScreen.handleQRScanned: raw=', data?.slice(0, 200));
    try {
      const parsedData = JSON.parse(data);
      const { itemId, itemUuid, itemName, boxIndex, size } = parsedData;
      console.log('🏬 parsed: itemId=', itemId, 'uuid=', itemUuid?.slice(0, 8), 'name=', itemName, 'box=', boxIndex, 'size=', size);

      if (itemListRef.current?.openItemById) {
        itemListRef.current.openItemById(itemId, { boxIndex, size }, itemUuid, itemName);
      } else {
        console.warn('🏬 WarehouseScreen: itemListRef.openItemById is not available');
      }
    } catch (error) {
      console.error('🏬 WarehouseScreen: error parsing QR data', error);
    }
  };

  const handleRefresh = () => {
    itemListRef.current?.refresh();
  };

  // Сканирование штрих-кода физического товара (EAN/UPC/Code128 и т.п.).
  // Источник (HID-сканер или камера) выбирается автоматически через
  // useScanLauncher по настройкам сканера.
  const handleBarcodeScanned = useCallback(async (code: string) => {
    console.log('🏬 WarehouseScreen.handleBarcodeScanned: code=', code);
    const lookup = await ItemLookupService.findByBarcode(code);

    if (lookup.item) {
      console.log('🏬 barcode resolved via', lookup.source, '→ id=', lookup.item.id);
      // Открыть карточку через тот же путь, что и QR. Передаём uuid если есть — чтобы быстрый поиск.
      itemListRef.current?.openItemById(lookup.item.id, undefined, lookup.item.uuid, lookup.item.name);
      return;
    }

    // Не нашли. По reason'у показываем разное.
    if (lookup.reason === 'server_404' || lookup.reason === 'no_code') {
      // Самый частый кейс — товара ещё нет в базе. Предложить создать.
      if (!isAssistant()) {
        Alert.alert('Товар не найден', `Штрих-код "${code}" не найден в базе. Только ассистент может добавлять товары.`);
        return;
      }
      Alert.alert(
        'Товар не найден',
        `Штрих-код "${code}" не найден. Хотите добавить новый товар с этим кодом?`,
        [
          { text: 'Отмена', style: 'cancel' },
          {
            text: 'Добавить',
            onPress: () => addItemRef.current?.openWithCode(code),
          },
        ],
      );
      return;
    }

    if (lookup.reason === 'network') {
      Alert.alert('Нет связи', 'Локально товара нет, а сервер недоступен. Проверьте интернет и попробуйте снова.');
      return;
    }
    if (lookup.reason === 'not_authenticated') {
      Alert.alert('Не авторизованы', 'Войдите в аккаунт, чтобы искать на сервере.');
      return;
    }
    Alert.alert('Ошибка', 'Не удалось найти товар.');
  }, [isAssistant]);

  // Барк-скан: открывает либо HID-оверлей, либо камеру (BarcodeScanner) по
  // настройкам сканера.
  const { start: startBarcodeScan, modals: barcodeScanModals } =
    useScanLauncher(handleBarcodeScanned);

  // QR-скан: то же самое, но камерная ветка использует QRScanner (только QR
  // c warehouse_item JSON). HID-ветка одинакова — 2D-сканер (XB-D66/XB-M82)
  // читает QR и шлёт JSON-содержимое в onScan, далее handleQRScanned парсит.
  const { start: startQRScan, modals: qrScanModals } =
    useScanLauncher(handleQRScanned, { cameraType: 'qr' });

  const scanButtonColor = isDark ? colors.primary.gold : colors.primary.purple;
  const barcodeButtonColor = isDark ? colors.primary.purple : colors.primary.gold;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.screen }]} edges={['top']}>
      <ItemList ref={itemListRef} onRefresh={handleRefresh} />
      {/* Кнопка сканера QR. Если в настройках выбран внешний HID-сканер,
          тап покажет «Ждём сканер…» и откроет карточку по физическому скану;
          иначе — откроется камерный QRScanner. */}
      <TouchableOpacity
        style={[styles.scanButton, {
          backgroundColor: scanButtonColor,
          shadowColor: scanButtonColor,
        }]}
        onPress={startQRScan}
        activeOpacity={0.8}
        accessibilityLabel="Сканировать QR-код"
      >
        <Ionicons name="scan" size={28} color="white" />
      </TouchableOpacity>

      {/* Кнопка сканера штрих-кода — рядом с QR. Если в настройках выбран
          внешний HID-сканер, тап покажет оверлей «Ждём сканер…» и откроет
          карточку товара по физическому скану; иначе — откроется камера. */}
      <TouchableOpacity
        style={[styles.barcodeButton, {
          backgroundColor: barcodeButtonColor,
          shadowColor: barcodeButtonColor,
        }]}
        onPress={startBarcodeScan}
        activeOpacity={0.8}
        accessibilityLabel="Сканировать штрих-код"
      >
        <Ionicons name="barcode-outline" size={28} color="white" />
      </TouchableOpacity>

      {/* Кнопка добавления товара - только для ассистента */}
      {isAssistant() && (
        <AddItemButton ref={addItemRef} />
      )}

      {/* Фиксированная кнопка "В корзину" - только для ассистента и только если есть товары в корзине */}
      {isAssistant() && cartItems.length > 0 && (
        <View style={styles.cartButtonContainer}>
          <TouchableOpacity
            onPress={() => navigation.navigate('Cart')}
            style={[styles.cartButton, {
              backgroundColor: isDark ? colors.primary.gold : colors.primary.purple,
              shadowColor: isDark ? colors.primary.gold : colors.primary.purple,
            }]}
            activeOpacity={0.8}
          >
            <Ionicons name="cart" size={18} color="#fff" style={{ marginRight: 6 }} />
            <Text style={styles.cartButtonText}>Корзина</Text>
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>
                {cartItems.reduce((sum, item) => sum + item.quantity, 0)}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* QR и штрихкод — оба источника (HID-оверлей + камера) монтируются
          через useScanLauncher. */}
      {qrScanModals}
      {barcodeScanModals}
    </SafeAreaView>
  );
};


const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  scanButton: {
    position: 'absolute',
    bottom: 24,
    left: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  barcodeButton: {
    position: 'absolute',
    bottom: 24,
    left: 92, // правее QR-кнопки
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  // "Корзина" — стоит МЕЖДУ FAB штрих-кода (слева) и FAB "+" добавления товара (справа).
  // FAB штрих-кода: left:24..148 → запас 12 → начинаем с left:160.
  // FAB "+" (AddItemButton): right:24..80 → запас 12 → справа right:92.
  cartButtonContainer: {
    position: 'absolute',
    bottom: 24,
    left: 160,
    right: 92,
    alignItems: 'center', // компактная кнопка центрируется в этой полосе
    zIndex: 50,
  },
  cartButton: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  cartButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  cartBadge: {
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    marginLeft: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  cartBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
});

export default WarehouseScreen;
