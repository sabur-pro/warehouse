// src/screens/WarehouseScreen.tsx
import React, { useState, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ItemList } from '../../components/ItemList';
import { AddItemButton } from '../../components/AddItemButton';
import { QRScanner } from '../../components/QRScanner';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors, shadows } from '../../constants/theme';

const WarehouseScreen: React.FC = () => {
  const { user, isAssistant } = useAuth();
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);
  const [scannerVisible, setScannerVisible] = useState(false);
  const itemListRef = useRef<any>(null);

  const handleQRScanned = (data: string) => {
    try {
      const parsedData = JSON.parse(data);
      const { itemId, boxIndex, size } = parsedData;

      // Открываем карточку товара через ref
      if (itemListRef.current?.openItemById) {
        itemListRef.current.openItemById(itemId, { boxIndex, size });
      }
    } catch (error) {
      console.error('Error parsing QR data:', error);
    }
  };

  const scanButtonColor = isDark ? colors.primary.gold : colors.primary.purple;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.screen }]} edges={['top']}>
      <ItemList ref={itemListRef} />
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
});

export default WarehouseScreen;
