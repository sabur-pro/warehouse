// components/BarcodeScanner.tsx
//
// Сканер штрих-кодов на базе expo-camera (нативный API, работает 100% офлайн).
// Распознаёт распространённые форматы: EAN-13/8, UPC-A/E, Code128, Code39, ITF14, Codabar, PDF417.
// Не парсит JSON — просто отдаёт строку штрих-кода как есть в onScan(code).
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';

interface BarcodeScannerProps {
  visible: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
}

// Все используемые форматы. EAN8/UPC_E включены, но защищены логикой "prefer long" ниже.
const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'itf14', 'codabar', 'pdf417'] as any;

// Окно ожидания "prefer long": после первого распознанного кода держим окно DEBOUNCE_MS,
// собираем все приходящие коды и в конце берём САМЫЙ ДЛИННЫЙ.
// Защищает от ложного матча EAN8 на середине EAN13 (Android ML Kit любит так делать):
//   первый кадр  → ean8  '11147015'
//   второй кадр  → ean13 '4927707670113'
//   результат    → ean13 (длиннее)
const DEBOUNCE_MS = 450;

export const BarcodeScanner: React.FC<BarcodeScannerProps> = ({ visible, onClose, onScan }) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  // Окно сбора кандидатов: запускается после первого распознанного кода,
  // через DEBOUNCE_MS отдаём САМЫЙ ДЛИННЫЙ (см. комментарий к DEBOUNCE_MS).
  const candidatesRef = useRef<{ data: string; type: string }[]>([]);
  const finalizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      setScanned(false);
      candidatesRef.current = [];
      if (finalizeTimerRef.current) {
        clearTimeout(finalizeTimerRef.current);
        finalizeTimerRef.current = null;
      }
      if (!permission?.granted) {
        requestPermission();
      }
    }
    return () => {
      if (finalizeTimerRef.current) {
        clearTimeout(finalizeTimerRef.current);
        finalizeTimerRef.current = null;
      }
    };
  }, [visible]);

  const finalize = () => {
    finalizeTimerRef.current = null;
    const candidates = candidatesRef.current;
    candidatesRef.current = [];
    if (candidates.length === 0) return;

    // Берём самый длинный код (предпочтение EAN13 > EAN8). Если несколько одинаковой длины —
    // первый по времени.
    const winner = candidates.reduce((best, cur) => (cur.data.length > best.data.length ? cur : best));
    const dropped = candidates.filter(c => c !== winner);
    if (dropped.length > 0) {
      console.log(
        '📦 BarcodeScanner: prefer-long picked',
        `${winner.type}/${winner.data}`,
        '— dropped',
        dropped.map(d => `${d.type}/${d.data}`).join(', ')
      );
    } else {
      console.log('📦 BarcodeScanner: confirmed', `${winner.type}/${winner.data}`);
    }

    onScan(winner.data.trim());
    onClose();
  };

  const handleBarCodeScanned = ({ data, type }: { data: string; type: string }) => {
    if (scanned) return; // окно уже закрыто
    const cleaned = (data || '').trim();
    if (!cleaned) return;

    // Дубликаты в одном окне не копим
    if (candidatesRef.current.some(c => c.data === cleaned && c.type === type)) return;

    candidatesRef.current.push({ data: cleaned, type });
    console.log('📦 BarcodeScanner: candidate', `${type}/${cleaned}`, '(window collecting)');

    // Запустить таймер только при первом кандидате
    if (!finalizeTimerRef.current) {
      finalizeTimerRef.current = setTimeout(() => {
        setScanned(true); // блокируем дальнейшие коллбэки от камеры
        finalize();
      }, DEBOUNCE_MS);
    }
  };

  if (!permission) {
    return (
      <Modal visible={visible} animationType="slide">
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionText}>Запрос доступа к камере...</Text>
        </View>
      </Modal>
    );
  }

  if (!permission.granted) {
    return (
      <Modal visible={visible} animationType="slide">
        <View style={styles.permissionContainer}>
          <Ionicons name="camera" size={64} color="white" />
          <Text style={styles.permissionText}>
            Нет доступа к камере. Разрешите доступ в настройках.
          </Text>
          <TouchableOpacity onPress={requestPermission} style={styles.permissionButton}>
            <Text style={styles.permissionButtonText}>Запросить разрешение</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} style={[styles.permissionButton, { backgroundColor: '#6B7280' }]}>
            <Text style={styles.permissionButtonText}>Закрыть</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide">
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Сканирование штрих-кода</Text>
            <Text style={styles.subtitle}>Наведите камеру на штрих-код товара</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="white" />
          </TouchableOpacity>
        </View>

        <CameraView
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          style={StyleSheet.absoluteFillObject}
          barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
        />

        {/* Прямоугольная рамка под штрих-код (горизонтальная) */}
        <View style={styles.frameWrapper}>
          <View style={styles.frame}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
        </View>

        <View style={styles.footer}>
          <View style={styles.statusRow}>
            <Ionicons name="barcode-outline" size={24} color="#22C55E" />
            <Text style={styles.statusText}>
              {scanned ? 'Штрих-код распознан!' : 'Поместите штрих-код внутри рамки'}
            </Text>
          </View>
          {scanned && (
            <TouchableOpacity onPress={() => setScanned(false)} style={styles.scanAgainButton}>
              <Text style={styles.scanAgainText}>Сканировать снова</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
  header: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.7)', paddingTop: 48, paddingBottom: 16, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  title: { color: 'white', fontSize: 20, fontWeight: 'bold' },
  subtitle: { color: '#D1D5DB', fontSize: 13, marginTop: 4 },
  closeButton: { backgroundColor: '#EF4444', padding: 12, borderRadius: 999 },
  frameWrapper: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  frame: { width: 280, height: 140, borderWidth: 2, borderColor: '#22C55E', borderRadius: 16 },
  corner: { position: 'absolute', width: 36, height: 36, borderColor: 'white' },
  cornerTL: { top: -2, left: -2, borderLeftWidth: 4, borderTopWidth: 4, borderTopLeftRadius: 16 },
  cornerTR: { top: -2, right: -2, borderRightWidth: 4, borderTopWidth: 4, borderTopRightRadius: 16 },
  cornerBL: { bottom: -2, left: -2, borderLeftWidth: 4, borderBottomWidth: 4, borderBottomLeftRadius: 16 },
  cornerBR: { bottom: -2, right: -2, borderRightWidth: 4, borderBottomWidth: 4, borderBottomRightRadius: 16 },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.7)', padding: 24,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  statusText: { color: 'white', marginLeft: 8 },
  scanAgainButton: { backgroundColor: '#22C55E', paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  scanAgainText: { color: 'white', fontWeight: '600' },
  permissionContainer: { flex: 1, backgroundColor: 'black', justifyContent: 'center', alignItems: 'center', padding: 24 },
  permissionText: { color: 'white', fontSize: 16, textAlign: 'center', marginVertical: 24 },
  permissionButton: { backgroundColor: '#22C55E', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, marginVertical: 6 },
  permissionButtonText: { color: 'white', fontWeight: '600' },
});
