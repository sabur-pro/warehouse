// components/QRScanner.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';

interface QRScannerProps {
  visible: boolean;
  onClose: () => void;
  onScan: (data: string) => void;
}

export const QRScanner: React.FC<QRScannerProps> = ({ visible, onClose, onScan }) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    if (visible) {
      setScanned(false);
      if (!permission?.granted) {
        requestPermission();
      }
    }
  }, [visible]);

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    if (scanned) return;
    
    setScanned(true);
    console.log('QR code scanned:', data);
    
    // Проверяем, что это наш QR-код
    try {
      const parsedData = JSON.parse(data);
      if (parsedData.itemId && parsedData.type === 'warehouse_item') {
        onScan(data);
        onClose();
      } else {
        Alert.alert(
          'Неизвестный QR-код',
          'Этот QR-код не относится к системе складского учета',
          [
            { text: 'Сканировать снова', onPress: () => setScanned(false) },
            { text: 'Закрыть', onPress: onClose }
          ]
        );
      }
    } catch (error) {
      Alert.alert(
        'Ошибка',
        'Не удалось распознать QR-код',
        [
          { text: 'Сканировать снова', onPress: () => setScanned(false) },
          { text: 'Закрыть', onPress: onClose }
        ]
      );
    }
  };

  if (!permission) {
    return (
      <Modal visible={visible} animationType="slide">
        <View className="flex-1 justify-center items-center bg-black">
          <Text className="text-white text-lg">Запрос доступа к камере...</Text>
        </View>
      </Modal>
    );
  }

  if (!permission.granted) {
    return (
      <Modal visible={visible} animationType="slide">
        <View className="flex-1 justify-center items-center bg-black p-6">
          <Ionicons name="camera" size={64} color="white" />
          <Text className="text-white text-lg text-center mt-4 mb-6">
            Нет доступа к камере. Разрешите доступ в настройках приложения.
          </Text>
          <TouchableOpacity
            onPress={requestPermission}
            className="bg-green-500 px-6 py-3 rounded-xl mb-3"
          >
            <Text className="text-white font-semibold">Запросить разрешение</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onClose}
            className="bg-gray-500 px-6 py-3 rounded-xl"
          >
            <Text className="text-white font-semibold">Закрыть</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide">
      <View className="flex-1 bg-black">
        {/* Header */}
        <View className="absolute top-0 left-0 right-0 z-10 bg-black/70 pt-12 pb-4 px-4">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-white text-xl font-bold">Сканирование QR-кода</Text>
              <Text className="text-gray-300 text-sm mt-1">Наведите камеру на QR-код товара</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              className="bg-red-500 p-3 rounded-full"
            >
              <Ionicons name="close" size={24} color="white" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Scanner */}
        <CameraView
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          style={StyleSheet.absoluteFillObject}
          barcodeScannerSettings={{
            barcodeTypes: ['qr'],
          }}
        />

        {/* Scanning Frame */}
        <View className="flex-1 justify-center items-center">
          <View className="w-64 h-64 border-4 border-green-500 rounded-3xl">
            {/* Corner decorations */}
            <View className="absolute top-0 left-0 w-12 h-12 border-l-4 border-t-4 border-white rounded-tl-3xl" />
            <View className="absolute top-0 right-0 w-12 h-12 border-r-4 border-t-4 border-white rounded-tr-3xl" />
            <View className="absolute bottom-0 left-0 w-12 h-12 border-l-4 border-b-4 border-white rounded-bl-3xl" />
            <View className="absolute bottom-0 right-0 w-12 h-12 border-r-4 border-b-4 border-white rounded-br-3xl" />
          </View>
        </View>

        {/* Instructions */}
        <View className="absolute bottom-0 left-0 right-0 bg-black/70 p-6">
          <View className="flex-row items-center justify-center mb-4">
            <Ionicons name="scan-outline" size={24} color="#22C55E" />
            <Text className="text-white text-center ml-2">
              {scanned ? 'QR-код распознан!' : 'Разместите QR-код в рамке'}
            </Text>
          </View>
          
          {scanned && (
            <TouchableOpacity
              onPress={() => setScanned(false)}
              className="bg-green-500 py-3 px-6 rounded-xl items-center"
            >
              <Text className="text-white font-semibold">Сканировать снова</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
};
