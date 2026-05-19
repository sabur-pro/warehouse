// components/HidWaitingOverlay.tsx
//
// Полупрозрачный оверлей «Ожидание сканера…». Показывается на время, пока
// useScanLauncher / ScanButton ждут следующий скан с внешнего HID-сканера.
//
// ВАЖНО: реализован как absolute-positioned View, а НЕ <Modal>.
// Причина: после скана onScan консьюмера (например, открытие карточки товара)
// часто открывает <Modal> (ItemDetailsModal). iOS не умеет открывать новую
// <Modal>, пока другая в процессе закрытия — она становится visible=true,
// но фактически не показывается. Абсолютный View не имеет этой проблемы и
// мгновенно убирается с экрана, когда visible=false.
//
// Автоматически закрывается через 30 секунд, чтобы не висел, если юзер
// забыл нажать триггер сканера.
import React, { useEffect } from 'react';
import {
  Pressable,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export const HidWaitingOverlay: React.FC<{ visible: boolean; onCancel: () => void }> = ({
  visible,
  onCancel,
}) => {
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(onCancel, 30000);
    return () => clearTimeout(t);
  }, [visible, onCancel]);

  if (!visible) return null;

  return (
    <Pressable
      style={styles.overlay}
      onPress={onCancel}
      // pointerEvents — гарантируем, что тапы по фону закрывают оверлей.
      pointerEvents="auto"
    >
      <View style={styles.card}>
        <Ionicons name="barcode-outline" size={48} color="#fff" />
        <ActivityIndicator color="#fff" style={{ marginTop: 12 }} />
        <Text style={styles.title}>Ожидание сканера…</Text>
        <Text style={styles.subtitle}>
          Просканируйте штрихкод внешним сканером — карточка откроется автоматически.
        </Text>
        <TouchableOpacity onPress={onCancel} style={styles.cancelBtn}>
          <Text style={styles.cancelText}>Отмена</Text>
        </TouchableOpacity>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  overlay: {
    // Покрываем весь экран, но через absolute, а не <Modal>.
    // zIndex/elevation поверх любого нативного контента в этом дереве.
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
    elevation: 9999,
  },
  card: {
    width: 280,
    backgroundColor: 'rgba(30,30,30,0.95)',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  title: { color: '#fff', fontWeight: '700', fontSize: 16, marginTop: 14 },
  subtitle: {
    color: '#d1d5db',
    textAlign: 'center',
    fontSize: 13,
    marginTop: 6,
    lineHeight: 18,
  },
  cancelBtn: {
    marginTop: 16,
    paddingVertical: 8,
    paddingHorizontal: 24,
    borderRadius: 8,
    backgroundColor: '#374151',
  },
  cancelText: { color: '#fff', fontWeight: '600' },
});
