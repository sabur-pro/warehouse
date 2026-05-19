// components/HardwareStatusBar.tsx
//
// Тонкая полоска сверху экрана с индикаторами подключённого оборудования.
// Показывает:
//   - сканер: «активен» (зелёный) если был хотя бы один скан в этой сессии
//     ИЛИ выбрано конкретное BT-устройство; «слушает» (янтарный) если
//     перехват включён, но активности ещё не было; серый — выключен.
//   - принтер: «подключён» (зелёный), «привязан, но не онлайн» (янтарный),
//     «не выбран» (серый).
// Тап по чипу — переход в соответствующий экран настроек. В навигацию
// передаётся `returnToTab` — экран настроек по «назад» вернёт юзера сюда,
// а не в ProfileMain.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../src/contexts/ThemeContext';
import { getThemeColors } from '../constants/theme';
import { useScannerSettings } from '../src/contexts/ScannerContext';
import HardwareScannerService from '../src/services/HardwareScannerService';
import { PrinterService, PrinterRecord } from '../src/services/PrinterService';

// «Свежесть» последнего скана: если последний скан в пределах этого окна,
// считаем сканер «активным». 10 минут — типичный продолжительный сеанс работы.
const SCANNER_ACTIVE_WINDOW_MS = 10 * 60 * 1000;

export const HardwareStatusBar: React.FC = () => {
  const navigation = useNavigation<any>();
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);
  const { settings } = useScannerSettings();

  const [printer, setPrinter] = useState<PrinterRecord | null>(null);
  const [printerConnectedId, setPrinterConnectedId] = useState<string | null>(null);
  // Тик для перерисовки статуса сканера. Обновляется по событию `activity` из
  // сервиса (новый скан) и раз в 30 секунд (чтобы зелёный → жёлтый по таймауту).
  const [, setActivityTick] = useState(0);

  const refreshPrinter = useCallback(async () => {
    try {
      const saved = await PrinterService.getSavedPrinter();
      setPrinter(saved);
      setPrinterConnectedId(PrinterService.getConnectedId());
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    refreshPrinter();
    const t = setInterval(refreshPrinter, 2000);
    return () => clearInterval(t);
  }, [refreshPrinter]);

  useEffect(() => {
    const off = HardwareScannerService.onActivity(() => setActivityTick(v => v + 1));
    const t = setInterval(() => setActivityTick(v => v + 1), 30000);
    return () => {
      off();
      clearInterval(t);
    };
  }, []);

  // --- Сканер ---
  // Зелёный: был скан в последние 10 минут (значит железо реально работает)
  //          или явно выбрано BT-устройство в настройках.
  // Янтарный: перехват включён, но активности не было (возможно, не подключено).
  // Серый: перехват выключен или режим «только камера».
  const lastAt = HardwareScannerService.getLastActivityAt();
  const recentActivity = lastAt !== null && Date.now() - lastAt < SCANNER_ACTIVE_WINDOW_MS;
  let scannerStatus: 'active' | 'listening' | 'off';
  if (!settings.enabled || settings.mode === 'camera') scannerStatus = 'off';
  else if (recentActivity || settings.selectedDevice) scannerStatus = 'active';
  else scannerStatus = 'listening';

  const scannerName =
    scannerStatus === 'off'
      ? settings.mode === 'camera'
        ? 'Только камера'
        : 'Выключен'
      : settings.selectedDevice?.name ||
        (scannerStatus === 'active' ? 'Внешний сканер' : 'Жду скан…');

  const scannerColor =
    scannerStatus === 'active' ? '#10b981' : scannerStatus === 'listening' ? '#f59e0b' : '#9ca3af';

  // --- Принтер ---
  const printerBound = !!printer;
  const printerConnected = printer && printerConnectedId === printer.id;
  const printerColor = !printerBound ? '#9ca3af' : printerConnected ? '#10b981' : '#f59e0b';

  // «Назад» из настроек всегда возвращает в Settings (см. handleBack в
  // ScannerSettingsScreen / PrinterSettingsScreen), поэтому returnToTab
  // нам больше не нужен — просто навигируемся к нужному экрану в Profile-стеке.
  const goScanner = () => navigation.navigate('Profile', { screen: 'ScannerSettings' });
  const goPrinter = () => navigation.navigate('Profile', { screen: 'PrinterSettings' });

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: isDark ? '#1f2937' : '#f8fafc',
          borderBottomColor: colors.border.normal,
        },
      ]}
    >
      <StatusChip
        icon="qr-code-scanner"
        label="Сканер"
        deviceName={scannerName}
        statusColor={scannerColor}
        onPress={goScanner}
        textColor={colors.text.normal}
        subTextColor={colors.text.muted}
      />
      <View style={[styles.separator, { backgroundColor: colors.border.normal }]} />
      <StatusChip
        icon="print"
        label="Принтер"
        deviceName={printerBound ? printer!.name : 'Не выбран'}
        statusColor={printerColor}
        onPress={goPrinter}
        textColor={colors.text.normal}
        subTextColor={colors.text.muted}
      />
    </View>
  );
};

const StatusChip: React.FC<{
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  deviceName: string;
  statusColor: string;
  onPress: () => void;
  textColor: string;
  subTextColor: string;
}> = ({ icon, label, deviceName, statusColor, onPress, textColor, subTextColor }) => {
  return (
    <TouchableOpacity style={styles.chip} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.iconWrap, { backgroundColor: `${statusColor}22` }]}>
        <MaterialIcons name={icon} size={16} color={statusColor} />
      </View>
      <View style={{ flex: 1, marginLeft: 8 }}>
        <Text style={[styles.label, { color: subTextColor }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.deviceName, { color: textColor }]} numberOfLines={1}>
          {deviceName}
        </Text>
      </View>
      <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  chip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  separator: { width: 1, alignSelf: 'stretch', marginVertical: 4 },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  deviceName: { fontSize: 13, fontWeight: '600', marginTop: 1 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginLeft: 6 },
});
