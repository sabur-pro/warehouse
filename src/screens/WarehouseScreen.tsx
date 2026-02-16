// src/screens/WarehouseScreen.tsx
import React, { useState, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { ItemList } from '../../components/ItemList';
import { AddItemButton } from '../../components/AddItemButton';
import { QRScanner } from '../../components/QRScanner';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useCart } from '../contexts/CartContext';
import { getThemeColors, shadows } from '../../constants/theme';

interface ItemListRef {
  openItemById: (itemId: number, context?: { boxIndex?: number; size?: number | string }, itemUuid?: string) => void;
  refresh: () => void;
}

const WarehouseScreen: React.FC = () => {
  const { user, isAssistant } = useAuth();
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);
  const { cartItems } = useCart();
  const navigation = useNavigation<any>();
  const [scannerVisible, setScannerVisible] = useState(false);
  const itemListRef = useRef<ItemListRef>(null);

  const handleQRScanned = (data: string) => {
    try {
      const parsedData = JSON.parse(data);
      const { itemId, itemUuid, boxIndex, size } = parsedData;

      // Открываем карточку товара через ref, передаём itemUuid для кросс-девайс поиска
      if (itemListRef.current?.openItemById) {
        itemListRef.current.openItemById(itemId, { boxIndex, size }, itemUuid);
      }
    } catch (error) {
      console.error('Error parsing QR data:', error);
    }
  };

  const handleRefresh = () => {
    itemListRef.current?.refresh();
  };

  const scanButtonColor = isDark ? colors.primary.gold : colors.primary.purple;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.screen }]} edges={['top']}>
      <ItemList ref={itemListRef} onRefresh={handleRefresh} />
      {/* Кнопка сканера QR - доступна для всех ролей */}
      <TouchableOpacity
        style={[styles.scanButton, {
          backgroundColor: scanButtonColor,
          shadowColor: scanButtonColor,
        }]}
        onPress={() => setScannerVisible(true)}
        activeOpacity={0.8}
      >
        <Ionicons name="scan" size={28} color="white" />
      </TouchableOpacity>

      {/* Кнопка добавления товара - только для ассистента */}
      {isAssistant() && (
        <AddItemButton />
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
            <Ionicons name="cart" size={22} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.cartButtonText}>В корзину</Text>
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>
                {cartItems.reduce((sum, item) => sum + item.quantity, 0)}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* Сканер QR-кодов */}
      <QRScanner
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onScan={handleQRScanned}
      />
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
  cartButtonContainer: {
    position: 'absolute',
    bottom: 24,
    left: 90,
    right: 90,
    alignItems: 'center',
    zIndex: 50,
  },
  cartButton: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 28,
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
    fontSize: 15,
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
