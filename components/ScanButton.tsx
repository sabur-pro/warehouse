// components/ScanButton.tsx
//
// Универсальная кнопка «отсканировать в это поле». Использует useScanLauncher,
// который сам выбирает между HID и камерой по настройкам.
//
// Используется рядом с барк-полем в AddItemButton и в поле поиска ItemList.
import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useScanLauncher } from '../src/hooks/useScanLauncher';

interface ScanButtonProps {
  onScan: (code: string) => void;
  // Если true, рисуется как «иконка» без подложки (для inline-use в поле).
  iconOnly?: boolean;
  color?: string;
  disabled?: boolean;
  accessibilityLabel?: string;
}

export const ScanButton: React.FC<ScanButtonProps> = ({
  onScan,
  iconOnly,
  color = '#3b82f6',
  disabled,
  accessibilityLabel,
}) => {
  const { start, modals } = useScanLauncher(onScan);

  return (
    <>
      <TouchableOpacity
        onPress={() => !disabled && start()}
        disabled={disabled}
        style={
          iconOnly
            ? { padding: 6, opacity: disabled ? 0.5 : 1 }
            : [
                styles.fab,
                {
                  backgroundColor: color,
                  shadowColor: color,
                  opacity: disabled ? 0.5 : 1,
                },
              ]
        }
        activeOpacity={0.8}
        accessibilityLabel={accessibilityLabel || 'Сканировать штрих-код'}
      >
        <Ionicons
          name="barcode-outline"
          size={iconOnly ? 22 : 24}
          color={iconOnly ? color : 'white'}
        />
      </TouchableOpacity>
      {modals}
    </>
  );
};

const styles = StyleSheet.create({
  fab: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
});
