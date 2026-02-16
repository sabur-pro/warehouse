// components/CreateQRModal.tsx
import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { QRCodeType } from '../database/types';
import { createQRCodesForItem } from '../utils/qrCodeUtils';

interface CreateQRModalProps {
  visible: boolean;
  onClose: () => void;
  onCreateQR: (qrCodeType: QRCodeType, qrCodes: string) => Promise<void>;
  itemId: number;
  itemName: string;
  itemCode: string;
  itemUuid?: string; // UUID для кросс-девайс идентификации
  numberOfBoxes: number;
  boxSizeQuantities: string;
}

export const CreateQRModal: React.FC<CreateQRModalProps> = ({
  visible,
  onClose,
  onCreateQR,
  itemId,
  itemName,
  itemCode,
  itemUuid,
  numberOfBoxes,
  boxSizeQuantities,
}) => {
  const [selectedType, setSelectedType] = useState<QRCodeType>('per_box');
  const [isCreating, setIsCreating] = useState(false);

  // Вычисляем общее количество товаров для per_item режима
  const getTotalItemCount = () => {
    try {
      const parsedBoxes = JSON.parse(boxSizeQuantities || '[]');
      if (Array.isArray(parsedBoxes)) {
        return parsedBoxes.reduce((total, box) => {
          if (Array.isArray(box)) {
            return total + box.reduce((sum, sq) => sum + (sq.quantity || 0), 0);
          }
          return total;
        }, 0);
      }
    } catch {
      return 0;
    }
    return 0;
  };

  const handleCreate = async () => {
    if (selectedType === 'none') {
      Alert.alert('Ошибка', 'Выберите тип QR-кода');
      return;
    }

    setIsCreating(true);
    try {
      // Генерируем QR-коды с UUID для кросс-девайс идентификации
      const qrCodes = createQRCodesForItem(itemId, itemName, itemCode, itemUuid, selectedType, numberOfBoxes, boxSizeQuantities);
      const qrCodesString = JSON.stringify(qrCodes);

      await onCreateQR(selectedType, qrCodesString);
      onClose();
      Alert.alert('Успех', 'QR-коды успешно созданы');
    } catch (error) {
      console.error('Error creating QR codes:', error);
      Alert.alert('Ошибка', 'Не удалось создать QR-коды');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-center items-center bg-black/50 p-4">
        <View className="bg-white p-6 rounded-2xl w-full max-w-md">
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-xl font-bold text-gray-800">Создать QR-коды</Text>
            <TouchableOpacity onPress={onClose} disabled={isCreating}>
              <Ionicons name="close" size={24} color="gray" />
            </TouchableOpacity>
          </View>

          <Text className="text-gray-600 mb-4">
            Выберите тип QR-кодов для товара "{itemName}"
          </Text>

          <View className="space-y-3 mb-6">
            <TouchableOpacity
              style={selectedType === 'per_box' ? { backgroundColor: 'rgba(34, 197, 94, 0.15)', borderColor: '#22C55E', borderWidth: 2 } : {}}
              className={`p-4 rounded-xl ${selectedType === 'per_box' ? '' : 'bg-gray-50 border-2 border-gray-300'}`}
              onPress={() => setSelectedType('per_box')}
              disabled={isCreating}
            >
              <View className="flex-row items-center">
                <Ionicons
                  name="cube-outline"
                  size={28}
                  color={selectedType === 'per_box' ? '#22C55E' : '#9CA3AF'}
                />
                <View className="ml-3 flex-1">
                  <Text className={`font-semibold ${selectedType === 'per_box' ? 'text-green-600' : 'text-gray-700'}`}>
                    QR на каждую коробку
                  </Text>
                  <Text className="text-xs text-gray-500 mt-1">
                    {numberOfBoxes} {numberOfBoxes === 1 ? 'QR-код' : 'QR-кода'}
                  </Text>
                </View>
                {selectedType === 'per_box' && (
                  <Ionicons name="checkmark-circle" size={24} color="#22C55E" />
                )}
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={selectedType === 'per_item' ? { backgroundColor: 'rgba(34, 197, 94, 0.15)', borderColor: '#22C55E', borderWidth: 2 } : {}}
              className={`p-4 rounded-xl ${selectedType === 'per_item' ? '' : 'bg-gray-50 border-2 border-gray-300'}`}
              onPress={() => setSelectedType('per_item')}
              disabled={isCreating}
            >
              <View className="flex-row items-center">
                <Ionicons
                  name="pricetags-outline"
                  size={28}
                  color={selectedType === 'per_item' ? '#22C55E' : '#9CA3AF'}
                />
                <View className="ml-3 flex-1">
                  <Text className={`font-semibold ${selectedType === 'per_item' ? 'text-green-600' : 'text-gray-700'}`}>
                    QR на каждый товар
                  </Text>
                  <Text className="text-xs text-gray-500 mt-1">
                    {getTotalItemCount()} QR-кодов (по 1 на каждую пару/единицу)
                  </Text>
                </View>
                {selectedType === 'per_item' && (
                  <Ionicons name="checkmark-circle" size={24} color="#22C55E" />
                )}
              </View>
            </TouchableOpacity>
          </View>

          <View className="flex-row space-x-3">
            <TouchableOpacity
              onPress={onClose}
              disabled={isCreating}
              className="flex-1 bg-gray-200 py-3 rounded-xl items-center"
            >
              <Text className="text-gray-700 font-semibold">Отмена</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleCreate}
              disabled={isCreating}
              className="flex-1 bg-green-500 py-3 rounded-xl items-center"
            >
              {isCreating ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-semibold">Создать</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};
