// src/screens/PrinterSettingsScreen.tsx
//
// Подключение принтера этикеток. На обеих платформах работает BLE-скан.
// На Android дополнительно показываем список системно-сопряжённых Classic.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  BackHandler,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../../constants/theme';
import {
  PrinterService,
  LABEL_SIZES,
  PrinterRecord,
  DiscoveredDevice,
} from '../services/PrinterService';

const PrinterSettingsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);

  // «Назад»: всегда возвращаемся в основной экран Настроек — единое поведение
  // и для захода Settings → PrinterSettings, и для входа через быстрый доступ
  // (HardwareStatusBar). navigate в RN-v7 либо попнет до Settings в стеке, либо
  // запушит, если его там нет.
  const handleBack = useCallback(() => {
    navigation.navigate('Settings' as never);
    return true;
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', handleBack);
      return () => sub.remove();
    }, [handleBack]),
  );

  const [savedPrinter, setSavedPrinter] = useState<PrinterRecord | null>(null);
  const [connectedId, setConnectedId] = useState<string | null>(null);
  const [classicDevices, setClassicDevices] = useState<DiscoveredDevice[]>([]);
  const [bleDevices, setBleDevices] = useState<DiscoveredDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [labelSizeId, setLabelSizeId] = useState<string>(LABEL_SIZES[0].id);
  const [btEnabled, setBtEnabled] = useState<boolean>(true);
  const [loading, setLoading] = useState(false);

  const scanCancelled = useRef(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const granted = await PrinterService.requestPermissions();
      if (!granted) {
        Alert.alert(
          'Нет разрешений',
          'Для работы с Bluetooth нужно разрешить доступ в настройках приложения.',
        );
        return;
      }

      const enabled = await PrinterService.isBluetoothEnabled();
      setBtEnabled(enabled);
      if (!enabled) await PrinterService.requestBluetoothEnabled();

      const [paired, saved, sizeId] = await Promise.all([
        PrinterService.listPairedClassic(),
        PrinterService.getSavedPrinter(),
        PrinterService.getLabelSizeId(),
      ]);
      setClassicDevices(paired);
      setSavedPrinter(saved);
      setLabelSizeId(sizeId);
      setConnectedId(PrinterService.getConnectedId());
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message || 'Не удалось загрузить состояние Bluetooth');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    return () => {
      // При уходе с экрана остановим сканирование, чтобы не разряжать батарею.
      PrinterService.stopBleScan().catch(() => {});
    };
  }, [refresh]);

  // Авто-запуск BLE-скана. Триггерим:
  //   - при первом открытии экрана,
  //   - при включении Bluetooth (если был выключен и стал включён),
  //   - при сбросе принтера.
  // Через 12 секунд скан сам остановится; повторный — через кнопку «Сканировать».
  const prevBtEnabledRef = useRef(btEnabled);
  useEffect(() => {
    if (loading) return;
    if (!btEnabled) {
      prevBtEnabledRef.current = btEnabled;
      return;
    }
    // Если уже подключены к сохранённому принтеру — не мешаем активному соединению.
    if (savedPrinter && connectedId === savedPrinter.id) {
      prevBtEnabledRef.current = btEnabled;
      return;
    }
    const btJustEnabled = !prevBtEnabledRef.current && btEnabled;
    prevBtEnabledRef.current = btEnabled;
    // микро-задержка, чтобы дать UI прорендериться
    const t = setTimeout(() => {
      if (!scanning) handleScanBle();
    }, btJustEnabled ? 600 : 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, btEnabled, savedPrinter, connectedId]);

  const handleScanBle = async () => {
    if (scanning) {
      scanCancelled.current = true;
      await PrinterService.stopBleScan();
      setScanning(false);
      return;
    }
    try {
      setBleDevices([]);
      setScanning(true);
      scanCancelled.current = false;
      await PrinterService.scanBle(devices => {
        if (!scanCancelled.current) setBleDevices(devices);
      }, 12000);
    } catch (e: any) {
      if (!scanCancelled.current) {
        Alert.alert('Ошибка сканирования', e?.message || String(e));
      }
    } finally {
      setScanning(false);
    }
  };

  const handleSelect = async (dev: DiscoveredDevice) => {
    try {
      setBusyId(dev.id);
      await PrinterService.stopBleScan();
      setScanning(false);

      const initial: PrinterRecord = { id: dev.id, name: dev.name, mode: dev.mode };
      const updated = await PrinterService.connect(initial);
      await PrinterService.savePrinter(updated);
      setSavedPrinter(updated);
      setConnectedId(updated.id);
      Alert.alert('Готово', `Принтер «${dev.name}» подключён.`);
    } catch (e: any) {
      Alert.alert(
        'Не удалось подключиться',
        (e?.message || String(e)) +
          (dev.mode === 'classic'
            ? '\n\nПроверьте, что принтер включён, заряжен и сопряжён в системных настройках Bluetooth.'
            : '\n\nПроверьте, что принтер включён и находится рядом.'),
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleDisconnect = async () => {
    try {
      await PrinterService.disconnect();
      setConnectedId(null);
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message || 'Не удалось отключиться');
    }
  };

  const handleReconnect = async () => {
    if (!savedPrinter) return;
    try {
      setBusyId(savedPrinter.id);
      const updated = await PrinterService.connect(savedPrinter);
      setSavedPrinter(updated);
      setConnectedId(updated.id);
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message || 'Не удалось подключиться');
    } finally {
      setBusyId(null);
    }
  };

  const handleClear = async () => {
    Alert.alert(
      'Сбросить выбранный принтер?',
      'После сброса нужно будет выбрать принтер заново перед печатью.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Сбросить',
          style: 'destructive',
          onPress: async () => {
            await PrinterService.disconnect();
            await PrinterService.clearSavedPrinter();
            setSavedPrinter(null);
            setConnectedId(null);
          },
        },
      ],
    );
  };

  const handleTestPrint = async () => {
    try {
      setPrinting(true);
      await PrinterService.printTest();
      Alert.alert('Отправлено', 'Команда печати отправлена. Проверьте принтер.');
    } catch (e: any) {
      Alert.alert('Ошибка печати', e?.message || String(e));
    } finally {
      setPrinting(false);
    }
  };

  const handleCalibrate = async () => {
    Alert.alert(
      'Калибровка датчика зазора',
      'Сейчас принтер прогонит 1–2 этикетки и научится определять промежутки между ними. ' +
        'Это нужно если этикетки печатаются друг на друге или со смещением.\n\n' +
        'Перед запуском убедитесь, что лента вставлена ровно и крышка закрыта.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Калибровать',
          onPress: async () => {
            try {
              setCalibrating(true);
              await PrinterService.calibrate();
              Alert.alert(
                'Готово',
                'Калибровка отправлена. Если этикетки всё ещё смещаются — повторите процедуру или зажмите кнопку FEED на принтере на 5 секунд для аппаратной калибровки.',
              );
            } catch (e: any) {
              Alert.alert('Ошибка калибровки', e?.message || String(e));
            } finally {
              setCalibrating(false);
            }
          },
        },
      ],
    );
  };

  const handleSelectSize = async (id: string) => {
    setLabelSizeId(id);
    await PrinterService.setLabelSizeId(id);
  };

  const renderDeviceRow = (dev: DiscoveredDevice) => {
    const isSelected = savedPrinter?.id === dev.id;
    const isConn = connectedId === dev.id;
    return (
      <TouchableOpacity
        key={`${dev.mode}-${dev.id}`}
        style={[
          styles.deviceItem,
          {
            backgroundColor: colors.background.card,
            borderColor: isSelected ? colors.primary.blue : colors.border.light,
            borderWidth: isSelected ? 2 : 1,
          },
        ]}
        onPress={() => handleSelect(dev)}
        disabled={busyId !== null}
        activeOpacity={0.7}
      >
        <MaterialIcons
          name={isConn ? 'bluetooth-connected' : dev.mode === 'ble' ? 'bluetooth-searching' : 'bluetooth'}
          size={24}
          color={isConn ? '#10b981' : colors.text.muted}
        />
        <View style={styles.deviceInfo}>
          <Text style={[styles.deviceItemName, { color: colors.text.normal }]}>{dev.name}</Text>
          <Text style={[styles.deviceItemAddr, { color: colors.text.muted }]}>
            {dev.mode === 'ble' ? 'BLE' : 'Classic'} · {dev.id}
            {dev.rssi != null ? ` · ${dev.rssi} dBm` : ''}
          </Text>
        </View>
        {busyId === dev.id ? (
          <ActivityIndicator color={colors.primary.blue} />
        ) : isSelected ? (
          <MaterialIcons name="check-circle" size={22} color={colors.primary.blue} />
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.screen }]}>
      <View
        style={[
          styles.header,
          { backgroundColor: colors.background.card, borderBottomColor: colors.border.light },
        ]}
      >
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text.normal} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text.normal }]}>Принтер этикеток</Text>
        <MaterialIcons
          name="print"
          size={24}
          color={isDark ? colors.primary.gold : colors.primary.purple}
        />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        {/* Bluetooth-секция: статус + on/off + системные настройки */}
        <Text style={[styles.sectionHeader, { color: colors.text.normal, marginTop: 0 }]}>
          Bluetooth
        </Text>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.background.card, borderColor: colors.border.light },
          ]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <MaterialIcons
              name={btEnabled ? 'bluetooth' : 'bluetooth-disabled'}
              size={22}
              color={btEnabled ? '#10b981' : '#ef4444'}
            />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text.normal }}>
                {btEnabled ? 'Bluetooth включён' : 'Bluetooth выключен'}
              </Text>
              <Text style={{ fontSize: 13, marginTop: 2, color: colors.text.muted }}>
                {Platform.OS === 'ios'
                  ? 'На iOS поддерживается только BLE. Управление BT — в Пункте управления.'
                  : btEnabled
                    ? 'Сопряжённые принтеры видны ниже. BLE-скан запустится автоматически.'
                    : 'Включите Bluetooth, чтобы увидеть принтер.'}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', marginTop: 12 }}>
            {!btEnabled && (
              <TouchableOpacity
                onPress={async () => {
                  const ok = await PrinterService.requestBluetoothEnabled();
                  if (ok) {
                    setBtEnabled(true);
                    refresh();
                  } else if (Platform.OS === 'ios') {
                    Linking.openURL('App-Prefs:Bluetooth').catch(() => Linking.openSettings());
                  } else {
                    Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS').catch(() =>
                      Linking.openSettings(),
                    );
                  }
                }}
                style={[
                  styles.actionBtn,
                  { backgroundColor: '#10b981', marginTop: 0, flex: 1 },
                ]}
              >
                <MaterialIcons name="bluetooth" size={16} color="#fff" />
                <Text style={styles.actionBtnText}>Включить</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => {
                if (Platform.OS === 'ios') {
                  Linking.openURL('App-Prefs:Bluetooth').catch(() => Linking.openSettings());
                } else {
                  Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS').catch(() =>
                    Linking.openSettings(),
                  );
                }
              }}
              style={[
                styles.actionBtn,
                {
                  backgroundColor: isDark ? colors.primary.gold : colors.primary.purple,
                  marginTop: 0,
                  flex: 1,
                  marginLeft: !btEnabled ? 8 : 0,
                },
              ]}
            >
              <MaterialIcons name="settings-bluetooth" size={16} color="#fff" />
              <Text style={styles.actionBtnText}>Настройки BT</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Текущий принтер */}
        <Text style={[styles.sectionHeader, { color: colors.text.normal }]}>Текущий принтер</Text>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.background.card, borderColor: colors.border.light },
          ]}
        >
          {savedPrinter ? (
            <>
              <View style={styles.statusRow}>
                <View
                  style={[
                    styles.dot,
                    {
                      backgroundColor:
                        connectedId === savedPrinter.id ? '#10b981' : '#9ca3af',
                    },
                  ]}
                />
                <Text style={[styles.statusText, { color: colors.text.normal }]}>
                  {connectedId === savedPrinter.id ? 'Подключён' : 'Не подключён'}
                </Text>
                <Text
                  style={[
                    styles.modeChip,
                    { backgroundColor: savedPrinter.mode === 'ble' ? '#dbeafe' : '#dcfce7' },
                  ]}
                >
                  {savedPrinter.mode === 'ble' ? 'BLE' : 'Classic'}
                </Text>
              </View>
              <Text style={[styles.deviceName, { color: colors.text.normal }]}>
                {savedPrinter.name}
              </Text>
              <Text style={[styles.deviceAddress, { color: colors.text.muted }]}>
                {savedPrinter.id}
              </Text>

              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: colors.primary.blue }]}
                  onPress={handleTestPrint}
                  disabled={printing || calibrating}
                >
                  {printing ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <MaterialIcons name="print" size={18} color="#fff" />
                      <Text style={styles.actionBtnText}>Тест печати</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#f59e0b' }]}
                  onPress={handleCalibrate}
                  disabled={printing || calibrating || connectedId !== savedPrinter.id}
                >
                  {calibrating ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <MaterialIcons name="tune" size={18} color="#fff" />
                      <Text style={styles.actionBtnText}>Калибровать</Text>
                    </>
                  )}
                </TouchableOpacity>

                {connectedId === savedPrinter.id ? (
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#6b7280' }]}
                    onPress={handleDisconnect}
                  >
                    <MaterialIcons name="bluetooth-disabled" size={18} color="#fff" />
                    <Text style={styles.actionBtnText}>Отключить</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#10b981' }]}
                    onPress={handleReconnect}
                    disabled={busyId === savedPrinter.id}
                  >
                    {busyId === savedPrinter.id ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <MaterialIcons name="bluetooth-connected" size={18} color="#fff" />
                        <Text style={styles.actionBtnText}>Подключить</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity onPress={handleClear} style={styles.clearLink}>
                <Text style={[styles.clearLinkText, { color: '#ef4444' }]}>Сбросить выбор</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={[styles.empty, { color: colors.text.muted }]}>
              Принтер ещё не выбран. Включите его и выберите ниже.
            </Text>
          )}
        </View>

        {/* BLE-скан */}
        <View style={styles.scanHeaderRow}>
          <Text style={[styles.sectionHeader, { color: colors.text.normal, marginTop: 0 }]}>
            Поиск через BLE
          </Text>
          <TouchableOpacity
            onPress={handleScanBle}
            style={[
              styles.scanBtn,
              { backgroundColor: scanning ? '#ef4444' : colors.primary.blue },
            ]}
          >
            {scanning ? (
              <>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={styles.scanBtnText}>Стоп</Text>
              </>
            ) : (
              <>
                <MaterialIcons name="bluetooth-searching" size={16} color="#fff" />
                <Text style={styles.scanBtnText}>Сканировать</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {bleDevices.length === 0 ? (
          <View
            style={[
              styles.card,
              { backgroundColor: colors.background.card, borderColor: colors.border.light },
            ]}
          >
            <Text style={[styles.empty, { color: colors.text.muted }]}>
              {scanning
                ? 'Идёт поиск... Подождите 10–15 секунд.'
                : 'Нажмите «Сканировать» и подождите. Принтер должен быть включён.'}
            </Text>
          </View>
        ) : (
          bleDevices.map(renderDeviceRow)
        )}

        {/* Classic — только Android */}
        {Platform.OS === 'android' && (
          <>
            <Text style={[styles.sectionHeader, { color: colors.text.normal }]}>
              Сопряжённые (Bluetooth Classic)
            </Text>
            {classicDevices.length === 0 ? (
              <View
                style={[
                  styles.card,
                  { backgroundColor: colors.background.card, borderColor: colors.border.light },
                ]}
              >
                <Text style={[styles.empty, { color: colors.text.muted }]}>
                  Нет сопряжённых устройств. Сопрягите принтер в системных настройках Bluetooth
                  (PIN 0000 или 1234), затем вернитесь сюда.
                </Text>
              </View>
            ) : (
              classicDevices.map(renderDeviceRow)
            )}
          </>
        )}

        {/* Размер этикетки */}
        <Text style={[styles.sectionHeader, { color: colors.text.normal }]}>Размер этикетки</Text>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.background.card, borderColor: colors.border.light },
          ]}
        >
          {LABEL_SIZES.map(opt => {
            const selected = opt.id === labelSizeId;
            return (
              <TouchableOpacity
                key={opt.id}
                style={[
                  styles.sizeRow,
                  { borderBottomColor: colors.border.light },
                  selected && {
                    backgroundColor: isDark
                      ? 'rgba(212, 175, 55, 0.12)'
                      : 'rgba(59, 130, 246, 0.08)',
                  },
                ]}
                onPress={() => handleSelectSize(opt.id)}
              >
                <Text
                  style={[
                    styles.sizeText,
                    { color: colors.text.normal },
                    selected && { fontWeight: '700', color: isDark ? '#d4af37' : '#3b82f6' },
                  ]}
                >
                  {opt.label}
                </Text>
                {selected && (
                  <MaterialIcons name="check" size={20} color={isDark ? '#d4af37' : '#3b82f6'} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.hint, { color: colors.text.muted }]}>
          Принтер нужно держать включённым во время печати. После переподключения может потребоваться
          повторное «Подключить».
        </Text>

        {loading && <ActivityIndicator style={{ marginTop: 12 }} color={colors.primary.blue} />}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  backButton: { padding: 4, marginRight: 8 },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
    marginRight: 32,
  },
  content: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 10,
    marginLeft: 4,
  },
  card: { borderRadius: 12, padding: 16, borderWidth: 1, marginBottom: 4 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  bannerText: { flex: 1, color: '#92400e', fontSize: 14 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { fontSize: 14, fontWeight: '600' },
  modeChip: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1e3a8a',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },
  deviceName: { fontSize: 17, fontWeight: '700' },
  deviceAddress: { fontSize: 12, marginTop: 2, marginBottom: 14 },
  buttonRow: { flexDirection: 'row', gap: 10 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
  },
  actionBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  clearLink: { marginTop: 14, alignSelf: 'flex-end' },
  clearLinkText: { fontSize: 14, fontWeight: '600' },
  empty: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  scanHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 10,
    paddingLeft: 4,
  },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  scanBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  deviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
  },
  deviceInfo: { flex: 1 },
  deviceItemName: { fontSize: 16, fontWeight: '600' },
  deviceItemAddr: { fontSize: 12, marginTop: 2 },
  sizeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
  },
  sizeText: { fontSize: 16 },
  hint: { fontSize: 12, marginTop: 16, lineHeight: 18, textAlign: 'center' },
});

export default PrinterSettingsScreen;
