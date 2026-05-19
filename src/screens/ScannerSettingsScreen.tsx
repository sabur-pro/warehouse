// src/screens/ScannerSettingsScreen.tsx
//
// Экран настроек внешнего HID-сканера штрихкодов.
//
// Поддерживаемое железо: XB-6208RB (1D настольный USB+2.4G), XB-D66 (2D BT+2.4G+USB),
// XB-M82 (mini 2D BT+2.4G+USB). Все три работают в HID-режиме — спариваются со
// смартфоном как BT-клавиатура и «печатают» содержимое штрихкода + Enter.
//
// Что делает этот экран:
//   1) Тумблер включения глобального HID-перехвата.
//   2) Выбор режима сканирования (Авто / HID / Камера) — это решает, что
//      делать при нажатии «скан» в полях ввода.
//   3) Список сопряжённых Bluetooth-устройств (Android) для выбора скан-устройства.
//      На iOS показываем только подсказку, т.к. системный список недоступен.
//   4) Тестовое поле + журнал последних сканов.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  TextInput,
  ActivityIndicator,
  Platform,
  Linking,
  Alert,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../../constants/theme';
import { useScannerSettings, useHardwareScanner } from '../contexts/ScannerContext';
import HardwareScannerService, {
  ScannerMode,
  PairedScanner,
} from '../services/HardwareScannerService';

type ScanLogEntry = { code: string; at: number };

const MODE_OPTIONS: { value: ScannerMode; label: string; desc: string }[] = [
  {
    value: 'auto',
    label: 'Авто',
    desc: 'Если выбран HID-сканер — он, иначе камера телефона.',
  },
  { value: 'hid', label: 'Только сканер', desc: 'Кнопка «скан» в полях ждёт HID-ввод.' },
  { value: 'camera', label: 'Только камера', desc: 'Привычное поведение через камеру.' },
];

const ScannerSettingsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);
  const { settings, updateSettings } = useScannerSettings();

  const [log, setLog] = useState<ScanLogEntry[]>([]);
  const [testInput, setTestInput] = useState('');
  const testInputRef = useRef<TextInput>(null);

  const [pairedDevices, setPairedDevices] = useState<PairedScanner[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [btEnabled, setBtEnabled] = useState<boolean>(true);
  const [permsDenied, setPermsDenied] = useState(false);

  // «Назад»: всегда возвращаемся в основной экран Настроек. Так пользователь
  // получает предсказуемое место возврата вне зависимости от того, как он
  // попал сюда (Settings → ScannerSettings или быстрый доступ из шапки).
  // navigate('Settings') в react-navigation v7 — это merge: если Settings уже
  // в стеке, popнется до него; иначе пушится новый экран Settings.
  const handleBack = useCallback(() => {
    navigation.navigate('Settings' as never);
    return true;
  }, [navigation]);

  // Android-аппаратная кнопка «назад» — тот же путь.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', handleBack);
      return () => sub.remove();
    }, [handleBack]),
  );

  useHardwareScanner(
    useCallback((code: string) => {
      setLog(prev => [{ code, at: Date.now() }, ...prev].slice(0, 10));
    }, []),
  );

  const refreshDevices = useCallback(async () => {
    if (Platform.OS !== 'android') return;
    setLoadingDevices(true);
    try {
      const granted = await HardwareScannerService.requestPermissions();
      setPermsDenied(!granted);
      if (!granted) {
        setPairedDevices([]);
        return;
      }
      const enabled = await HardwareScannerService.isBluetoothEnabled();
      setBtEnabled(enabled);
      if (!enabled) {
        await HardwareScannerService.requestBluetoothEnabled().catch(() => {});
      }
      const devices = await HardwareScannerService.listPairedDevices();
      setPairedDevices(devices);
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message || 'Не удалось получить список устройств');
    } finally {
      setLoadingDevices(false);
    }
  }, []);

  useEffect(() => {
    refreshDevices();
  }, [refreshDevices]);

  const handleToggleEnabled = async (value: boolean) => {
    await updateSettings({ enabled: value });
  };

  const handleSelectMode = async (mode: ScannerMode) => {
    await updateSettings({ mode });
  };

  const handleSelectDevice = async (dev: PairedScanner) => {
    const sameDevice = settings.selectedDevice?.id === dev.id;
    await updateSettings({ selectedDevice: sameDevice ? null : dev });
  };

  const handleSimulateScan = () => {
    const code = testInput.trim();
    if (!code) return;
    HardwareScannerService.emitScan(code);
    setTestInput('');
    testInputRef.current?.blur();
  };

  const openPairing = () => {
    if (Platform.OS === 'ios') {
      Linking.openURL('App-Prefs:Bluetooth').catch(() => Linking.openSettings());
    } else {
      Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS').catch(() => Linking.openSettings());
    }
  };

  const handleEnableBt = async () => {
    const ok = await HardwareScannerService.requestBluetoothEnabled();
    if (ok) {
      setBtEnabled(true);
      // Сразу подтянуть список устройств после включения BT.
      refreshDevices();
    } else {
      Alert.alert(
        'Не удалось включить Bluetooth',
        Platform.OS === 'ios'
          ? 'iOS не позволяет включать Bluetooth программно. Откройте Пункт управления или системные настройки.'
          : 'Откройте системные настройки Bluetooth и включите его вручную.',
        [
          { text: 'Отмена', style: 'cancel' },
          { text: 'Открыть настройки', onPress: openPairing },
        ],
      );
    }
  };

  const handleOpenAppSettings = () => {
    Linking.openSettings().catch(() =>
      Alert.alert('Ошибка', 'Не удалось открыть настройки приложения'),
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
        <Text style={[styles.headerTitle, { color: colors.text.normal }]}>Сканер штрихкодов</Text>
        <MaterialIcons
          name="qr-code-scanner"
          size={24}
          color={isDark ? colors.primary.gold : colors.primary.purple}
        />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Bluetooth-секция: статус + кнопки on/off/системные настройки */}
        <Text style={[styles.sectionHeader, { color: colors.text.normal, marginTop: 0 }]}>
          Bluetooth
        </Text>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.background.card, borderColor: colors.border.light },
          ]}
        >
          <View style={styles.row}>
            <MaterialIcons
              name={btEnabled ? 'bluetooth' : 'bluetooth-disabled'}
              size={22}
              color={btEnabled ? '#10b981' : '#ef4444'}
            />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={[styles.rowTitle, { color: colors.text.normal }]}>
                {btEnabled ? 'Bluetooth включён' : 'Bluetooth выключен'}
              </Text>
              <Text style={[styles.rowSubtitle, { color: colors.text.muted }]}>
                {Platform.OS === 'android'
                  ? btEnabled
                    ? 'Сопряжённые устройства видны ниже.'
                    : 'Включите Bluetooth, чтобы увидеть список устройств.'
                  : 'На iOS управление Bluetooth — только в Пункте управления / системных настройках.'}
              </Text>
            </View>
          </View>
          <View style={styles.btBtnRow}>
            {!btEnabled && (
              <TouchableOpacity
                onPress={handleEnableBt}
                style={[styles.actionBtn, { backgroundColor: '#10b981', marginTop: 0, flex: 1 }]}
              >
                <MaterialIcons name="bluetooth" size={16} color="#fff" />
                <Text style={styles.actionBtnText}>Включить</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={openPairing}
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

        {/* Включён ли перехват вообще */}
        <Text style={[styles.sectionHeader, { color: colors.text.normal }]}>Перехват сканов</Text>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.background.card, borderColor: colors.border.light },
          ]}
        >
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: colors.text.normal }]}>Включён</Text>
              <Text style={[styles.rowSubtitle, { color: colors.text.muted }]}>
                Если включено — приложение принимает штрихкоды с внешнего HID-сканера на любом
                экране.
              </Text>
            </View>
            <Switch
              value={settings.enabled}
              onValueChange={handleToggleEnabled}
              trackColor={{
                false: '#9ca3af',
                true: isDark ? colors.primary.gold : colors.primary.purple,
              }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* Режим */}
        <Text style={[styles.sectionHeader, { color: colors.text.normal }]}>Режим</Text>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.background.card, borderColor: colors.border.light },
          ]}
        >
          {MODE_OPTIONS.map((opt, idx) => {
            const active = settings.mode === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                onPress={() => handleSelectMode(opt.value)}
                style={[
                  styles.modeRow,
                  idx < MODE_OPTIONS.length - 1 && {
                    borderBottomColor: colors.border.light,
                    borderBottomWidth: 1,
                  },
                  active && {
                    backgroundColor: isDark ? 'rgba(212, 175, 55, 0.10)' : 'rgba(99, 102, 241, 0.06)',
                  },
                ]}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.radio,
                    {
                      borderColor: active
                        ? isDark
                          ? colors.primary.gold
                          : colors.primary.purple
                        : colors.text.muted,
                    },
                  ]}
                >
                  {active && (
                    <View
                      style={[
                        styles.radioDot,
                        { backgroundColor: isDark ? colors.primary.gold : colors.primary.purple },
                      ]}
                    />
                  )}
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[styles.rowTitle, { color: colors.text.normal }]}>{opt.label}</Text>
                  <Text style={[styles.rowSubtitle, { color: colors.text.muted }]}>{opt.desc}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Список сопряжённых устройств (Android) */}
        {Platform.OS === 'android' && (
          <>
            <View style={styles.scanHeaderRow}>
              <Text style={[styles.sectionHeader, { color: colors.text.normal, marginTop: 0 }]}>
                Сопряжённые устройства
              </Text>
              <TouchableOpacity
                onPress={refreshDevices}
                disabled={loadingDevices}
                style={[
                  styles.refreshBtn,
                  { backgroundColor: isDark ? colors.primary.gold : colors.primary.purple },
                ]}
                activeOpacity={0.7}
              >
                {loadingDevices ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <MaterialIcons name="refresh" size={16} color="#fff" />
                    <Text style={styles.refreshBtnText}>Обновить</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {permsDenied && (
              <View style={[styles.banner, { backgroundColor: '#fef3c7', borderColor: '#fbbf24' }]}>
                <MaterialIcons name="info-outline" size={20} color="#b45309" />
                <Text style={styles.bannerText}>
                  Нет разрешений на Bluetooth. Разрешите доступ в настройках приложения и нажмите
                  «Обновить».
                </Text>
              </View>
            )}

            {/* Выбранное устройство — отдельной плашкой с кнопкой «Отвязать» */}
            {settings.selectedDevice && (
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.background.card,
                    borderColor: '#10b981',
                    borderWidth: 2,
                    marginBottom: 8,
                  },
                ]}
              >
                <View style={styles.deviceRow}>
                  <MaterialIcons name="bluetooth-connected" size={22} color="#10b981" />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.rowTitle, { color: colors.text.normal }]}>
                      {settings.selectedDevice.name}
                    </Text>
                    <Text
                      style={[styles.rowSubtitle, { color: colors.text.muted }]}
                      numberOfLines={1}
                    >
                      Выбран · {settings.selectedDevice.id}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => updateSettings({ selectedDevice: null })}
                    style={[styles.unbindBtn, { backgroundColor: '#ef4444' }]}
                  >
                    <MaterialIcons name="link-off" size={16} color="#fff" />
                    <Text style={styles.unbindBtnText}>Отвязать</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <View
              style={[
                styles.card,
                { backgroundColor: colors.background.card, borderColor: colors.border.light },
              ]}
            >
              {pairedDevices.length === 0 ? (
                <Text style={[styles.note, { color: colors.text.muted, paddingVertical: 8 }]}>
                  {loadingDevices
                    ? 'Загружаем список…'
                    : permsDenied
                      ? 'Нет доступа к списку сопряжённых устройств.'
                      : 'Сопряжённых устройств не найдено. Спарьте сканер в системных настройках Bluetooth, затем нажмите «Обновить».'}
                </Text>
              ) : (
                pairedDevices.map((dev, idx) => {
                  const isSelected = settings.selectedDevice?.id === dev.id;
                  return (
                    <TouchableOpacity
                      key={dev.id}
                      onPress={() => handleSelectDevice(dev)}
                      style={[
                        styles.deviceRow,
                        idx < pairedDevices.length - 1 && {
                          borderBottomColor: colors.border.light,
                          borderBottomWidth: 1,
                        },
                      ]}
                      activeOpacity={0.7}
                    >
                      <MaterialIcons
                        name={isSelected ? 'bluetooth-connected' : 'bluetooth'}
                        size={22}
                        color={isSelected ? '#10b981' : colors.text.muted}
                      />
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={[styles.rowTitle, { color: colors.text.normal }]}>
                          {dev.name}
                        </Text>
                        <Text
                          style={[styles.rowSubtitle, { color: colors.text.muted }]}
                          numberOfLines={1}
                        >
                          {dev.id}
                        </Text>
                      </View>
                      {isSelected ? (
                        <MaterialIcons name="check-circle" size={22} color="#10b981" />
                      ) : (
                        <Text style={[styles.tapHint, { color: colors.text.muted }]}>
                          Тап — выбрать
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          </>
        )}

        {/* Если разрешения не выданы — даём ссылку в системные настройки приложения */}
        {permsDenied && Platform.OS === 'android' && (
          <TouchableOpacity
            onPress={handleOpenAppSettings}
            style={[
              styles.actionBtn,
              {
                backgroundColor: '#f59e0b',
                alignSelf: 'flex-start',
              },
            ]}
          >
            <MaterialIcons name="settings" size={18} color="#fff" />
            <Text style={styles.actionBtnText}>Настройки приложения</Text>
          </TouchableOpacity>
        )}

        {/* Поддерживаемые модели */}
        <Text style={[styles.sectionHeader, { color: colors.text.normal }]}>Поддерживаемые модели</Text>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.background.card, borderColor: colors.border.light },
          ]}
        >
          <ModelRow title="XB-6208RB" desc="1D настольный с подставкой, USB-провод + 2.4G донгл" />
          <ModelRow title="XB-D66" desc="2D ручной, Bluetooth + 2.4G + USB-провод" />
          <ModelRow title="XB-M82" desc="2D mini-карманный, Bluetooth + 2.4G + USB-провод" />
          <Text style={[styles.note, { color: colors.text.muted }]}>
            Все три модели работают в режиме HID-клавиатуры — никаких драйверов не требуется.
          </Text>
        </View>

        {/* Тестовое поле */}
        <Text style={[styles.sectionHeader, { color: colors.text.normal }]}>Проверка</Text>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.background.card, borderColor: colors.border.light },
          ]}
        >
          <Text style={[styles.rowSubtitle, { color: colors.text.muted, marginBottom: 8 }]}>
            Просканируйте любой штрихкод — он появится в журнале ниже. Если сканера сейчас нет,
            введите код вручную и нажмите «Эмулировать».
          </Text>
          <View style={styles.testInputRow}>
            <TextInput
              ref={testInputRef}
              style={[
                styles.testInput,
                {
                  color: colors.text.normal,
                  backgroundColor: colors.background.screen,
                  borderColor: colors.border.light,
                },
              ]}
              value={testInput}
              onChangeText={setTestInput}
              placeholder="например, 4607034730994"
              placeholderTextColor={colors.text.muted}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              onPress={handleSimulateScan}
              disabled={!testInput.trim()}
              style={[
                styles.actionBtn,
                {
                  backgroundColor: testInput.trim()
                    ? isDark
                      ? colors.primary.gold
                      : colors.primary.purple
                    : '#9ca3af',
                  marginTop: 0,
                  marginLeft: 8,
                  paddingHorizontal: 16,
                },
              ]}
            >
              <Text style={styles.actionBtnText}>Эмулировать</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Журнал сканов */}
        <Text style={[styles.sectionHeader, { color: colors.text.normal }]}>Последние сканы</Text>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.background.card, borderColor: colors.border.light },
          ]}
        >
          {log.length === 0 ? (
            <Text style={[styles.note, { color: colors.text.muted, paddingVertical: 8 }]}>
              Пока пусто. Просканируйте что-нибудь.
            </Text>
          ) : (
            log.map((e, idx) => (
              <View
                key={`${e.at}-${idx}`}
                style={[
                  styles.logRow,
                  idx < log.length - 1 && {
                    borderBottomColor: colors.border.light,
                    borderBottomWidth: 1,
                  },
                ]}
              >
                <MaterialIcons
                  name="qr-code-2"
                  size={18}
                  color={isDark ? colors.primary.gold : colors.primary.purple}
                />
                <Text style={[styles.logCode, { color: colors.text.normal }]} numberOfLines={1}>
                  {e.code}
                </Text>
                <Text style={[styles.logTime, { color: colors.text.muted }]}>
                  {formatTime(e.at)}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const ModelRow: React.FC<{ title: string; desc: string }> = ({ title, desc }) => {
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);
  return (
    <View style={styles.modelRow}>
      <View style={styles.modelBadge}>
        <Text style={styles.modelBadgeText}>{title}</Text>
      </View>
      <Text style={[styles.modelDesc, { color: colors.text.muted }]}>{desc}</Text>
    </View>
  );
};

function formatTime(at: number): string {
  const d = new Date(at);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

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
  scrollContent: { padding: 20, paddingBottom: 60 },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 12,
    marginLeft: 4,
  },
  card: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    marginBottom: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 16,
  },
  bannerText: { color: '#92400e', marginLeft: 8, flex: 1, fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowTitle: { fontSize: 16, fontWeight: '600' },
  rowSubtitle: { fontSize: 13, marginTop: 4 },
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  scanHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 12,
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  refreshBtnText: { color: '#fff', fontWeight: '600', marginLeft: 4, fontSize: 13 },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  unbindBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  unbindBtnText: { color: '#fff', fontWeight: '600', marginLeft: 4, fontSize: 12 },
  tapHint: { fontSize: 11, fontStyle: 'italic' },
  btBtnRow: { flexDirection: 'row', marginTop: 12 },
  modelRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  modelBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderRadius: 6,
    marginRight: 10,
  },
  modelBadgeText: { fontSize: 12, fontWeight: '700', color: '#6366f1', fontFamily: 'monospace' },
  modelDesc: { fontSize: 13, flex: 1 },
  note: { fontSize: 12, marginTop: 10, fontStyle: 'italic' },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    marginTop: 12,
  },
  actionBtnText: { color: '#fff', fontWeight: '600', marginLeft: 6 },
  testInputRow: { flexDirection: 'row', alignItems: 'center' },
  testInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: 'monospace',
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  logCode: {
    flex: 1,
    marginHorizontal: 10,
    fontSize: 14,
    fontFamily: 'monospace',
  },
  logTime: { fontSize: 12, fontFamily: 'monospace' },
});

export default ScannerSettingsScreen;
