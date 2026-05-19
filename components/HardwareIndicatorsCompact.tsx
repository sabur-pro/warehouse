// components/HardwareIndicatorsCompact.tsx
//
// Компактные индикаторы оборудования (сканер + принтер) для встраивания в
// SyncStatusBar рядом с кнопкой «Синхр.». Каждая иконка имеет цвет статуса:
//   зелёный  — активен/подключён
//   янтарный — настроен, но онлайна нет
//   серый    — не настроен / выключен
// Тап по иконке открывает соответствующий экран настроек.
//
// Логика статусов скопирована из HardwareStatusBar — мы НЕ переиспользуем сам
// HardwareStatusBar, потому что у него крупная вёрстка под полноширинную
// полосу. Здесь нужен иной форм-фактор: только иконка + точка статуса.

import React, { useCallback, useEffect, useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useScannerSettings } from '../src/contexts/ScannerContext';
import HardwareScannerService from '../src/services/HardwareScannerService';
import { PrinterService, PrinterRecord } from '../src/services/PrinterService';

const SCANNER_ACTIVE_WINDOW_MS = 10 * 60 * 1000;

export const HardwareIndicatorsCompact: React.FC = () => {
  const navigation = useNavigation<any>();
  const { settings } = useScannerSettings();

  const [printer, setPrinter] = useState<PrinterRecord | null>(null);
  const [printerConnectedId, setPrinterConnectedId] = useState<string | null>(null);
  const [, setTick] = useState(0);

  const refreshPrinter = useCallback(async () => {
    try {
      const saved = await PrinterService.getSavedPrinter();
      setPrinter(saved);
      setPrinterConnectedId(PrinterService.getConnectedId());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    refreshPrinter();
    const t = setInterval(refreshPrinter, 2000);
    return () => clearInterval(t);
  }, [refreshPrinter]);

  useEffect(() => {
    const off = HardwareScannerService.onActivity(() => setTick(v => v + 1));
    const t = setInterval(() => setTick(v => v + 1), 30000);
    return () => { off(); clearInterval(t); };
  }, []);

  // --- Статус сканера ---
  const lastAt = HardwareScannerService.getLastActivityAt();
  const recentActivity = lastAt !== null && Date.now() - lastAt < SCANNER_ACTIVE_WINDOW_MS;
  let scannerStatus: 'active' | 'listening' | 'off';
  if (!settings.enabled || settings.mode === 'camera') scannerStatus = 'off';
  else if (recentActivity || settings.selectedDevice) scannerStatus = 'active';
  else scannerStatus = 'listening';

  const scannerColor =
    scannerStatus === 'active' ? '#10b981'
      : scannerStatus === 'listening' ? '#f59e0b'
        : '#9ca3af';

  // --- Статус принтера ---
  const printerBound = !!printer;
  const printerConnected = printer && printerConnectedId === printer.id;
  const printerColor = !printerBound ? '#9ca3af' : printerConnected ? '#10b981' : '#f59e0b';

  const goScanner = () => navigation.navigate('Profile', { screen: 'ScannerSettings' });
  const goPrinter = () => navigation.navigate('Profile', { screen: 'PrinterSettings' });

  return (
    <View style={styles.row}>
      <TouchableOpacity onPress={goScanner} activeOpacity={0.7} style={styles.iconBtn} hitSlop={6}>
        <MaterialIcons name="qr-code-scanner" size={16} color={scannerColor} />
        <View style={[styles.dot, { backgroundColor: scannerColor }]} />
      </TouchableOpacity>
      <TouchableOpacity onPress={goPrinter} activeOpacity={0.7} style={styles.iconBtn} hitSlop={6}>
        <MaterialIcons name="print" size={16} color={printerColor} />
        <View style={[styles.dot, { backgroundColor: printerColor }]} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
    gap: 8,
  },
  iconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: 4,
  },
});
