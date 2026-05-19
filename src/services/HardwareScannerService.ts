// src/services/HardwareScannerService.ts
//
// Сервис внешнего HID-сканера штрихкодов.
//
// Поддерживаемое железо: XB-6208RB (1D настольный USB+2.4G), XB-D66 (2D BT+2.4G+USB),
// XB-M82 (mini 2D BT+2.4G+USB). Все три по умолчанию работают как
// Bluetooth-HID-клавиатура: после спаривания со смартфоном «печатают» содержимое
// штрихкода в сфокусированное поле и отправляют CR/LF (Enter) как терминатор.
//
// Здесь — настройки, шина событий, и список сопряжённых BT-устройств (Android).
// Перехват ввода живёт в components/HardwareScannerInput.tsx;
// React-обёртка — в src/contexts/ScannerContext.tsx.

import { PermissionsAndroid, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import EventEmitter from 'events';

// Лениво подгружаем react-native-bluetooth-classic — он не линкован на iOS
// (см. react-native.config.js), так же как у PrinterService.
type ClassicDeviceType = {
  address: string;
  name: string;
};

type ClassicModule = {
  default: {
    getBondedDevices: () => Promise<ClassicDeviceType[]>;
    isBluetoothEnabled: () => Promise<boolean>;
    requestBluetoothEnabled: () => Promise<boolean>;
  };
};

let classicMod: ClassicModule['default'] | null | undefined;

function getClassic(): ClassicModule['default'] | null {
  if (Platform.OS !== 'android') return null;
  if (classicMod !== undefined) return classicMod;
  try {
    classicMod = require('react-native-bluetooth-classic').default;
    return classicMod ?? null;
  } catch {
    classicMod = null;
    return null;
  }
}

// Режим работы сканера:
//   auto   — если выбран HID-сканер (или включён глобально) → HID, иначе камера
//   hid    — всегда внешний HID-сканер (кнопка «скан» в поле ждёт HID-ввод)
//   camera — всегда внутренняя камера (старое поведение)
export type ScannerMode = 'auto' | 'hid' | 'camera';

export type PairedScanner = {
  id: string;   // MAC-адрес
  name: string;
};

export type ScannerSettings = {
  // Глобальный перехват HID-ввода включён.
  enabled: boolean;
  // Какой источник использовать при нажатии кнопки «скан» в поле.
  mode: ScannerMode;
  // Выбранный пользователем BT-сканер (по MAC). Только информация: реальное
  // подключение по HID-протоколу делает ОС, а не приложение.
  selectedDevice: PairedScanner | null;
  // Минимальная длина «валидного» штрихкода. Защищает от случайного Enter.
  minLength: number;
  // Окно «быстрой печати». Если интервал между символами больше — это человек.
  // Сканер выдаёт ~5–15 мс между символами; человек — >80 мс.
  maxIntervalMs: number;
};

const STORAGE_KEY = 'hardware_scanner_settings_v2';
const STORAGE_KEY_LEGACY = 'hardware_scanner_settings_v1';

const DEFAULT_SETTINGS: ScannerSettings = {
  enabled: true,
  mode: 'auto',
  selectedDevice: null,
  minLength: 4,
  maxIntervalMs: 60,
};

class HardwareScannerService {
  private settings: ScannerSettings = { ...DEFAULT_SETTINGS };
  private loaded = false;
  private emitter = new EventEmitter();
  // Время последнего реального скана (ms). Используется HardwareStatusBar,
  // чтобы зажечь зелёный индикатор «сканер активен», даже если пользователь
  // не указал конкретное BT-устройство в настройках. На Android системный
  // HID-сканер не отдаёт нам имя устройства — единственный способ доказать,
  // что он подключён, это факт прихода сканов.
  private lastActivityAt: number | null = null;

  async load(): Promise<ScannerSettings> {
    if (this.loaded) return this.settings;
    try {
      let raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) {
        // Миграция со старой структуры (v1 не имела mode/selectedDevice).
        const legacy = await AsyncStorage.getItem(STORAGE_KEY_LEGACY);
        if (legacy) {
          raw = legacy;
          await AsyncStorage.removeItem(STORAGE_KEY_LEGACY);
        }
      }
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<ScannerSettings>;
        this.settings = { ...DEFAULT_SETTINGS, ...parsed };
        // Сохраняем уже в новом формате.
        if (raw === (await AsyncStorage.getItem(STORAGE_KEY_LEGACY))) {
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
        }
      }
    } catch (e) {
      console.warn('HardwareScannerService.load: failed', e);
    }
    this.loaded = true;
    this.emitter.emit('settings', this.settings);
    return this.settings;
  }

  getSettings(): ScannerSettings {
    return this.settings;
  }

  async update(patch: Partial<ScannerSettings>): Promise<ScannerSettings> {
    this.settings = { ...this.settings, ...patch };
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch (e) {
      console.warn('HardwareScannerService.update: persist failed', e);
    }
    this.emitter.emit('settings', this.settings);
    return this.settings;
  }

  onSettingsChange(cb: (s: ScannerSettings) => void): () => void {
    this.emitter.on('settings', cb);
    return () => this.emitter.off('settings', cb);
  }

  // Глобальная шина: HardwareScannerInput кладёт распознанные коды, а подписчики
  // (тестовое поле в настройках, поля с кнопкой «скан») их получают. Гло́бально
  // в Warehouse/Cart мы больше НЕ подписываемся — сканер срабатывает только в
  // явно обозначенных местах (поле штрихкода в форме, поле поиска).
  emitScan(code: string) {
    if (!code) return;
    this.lastActivityAt = Date.now();
    this.emitter.emit('activity', this.lastActivityAt);
    this.emitter.emit('scan', code);
  }

  onScan(cb: (code: string) => void): () => void {
    this.emitter.on('scan', cb);
    return () => this.emitter.off('scan', cb);
  }

  getLastActivityAt(): number | null {
    return this.lastActivityAt;
  }

  onActivity(cb: (at: number) => void): () => void {
    this.emitter.on('activity', cb);
    return () => this.emitter.off('activity', cb);
  }

  // -------------------------------------------------------------------------
  // Bluetooth-устройства (HID-сканер пара́рится через ОС, мы только показываем)
  // -------------------------------------------------------------------------

  /** Запрос разрешений на работу с Bluetooth. */
  async requestPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    const apiLevel = Platform.Version as number;
    const perms: string[] = [];
    if (apiLevel >= 31) {
      perms.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
    } else {
      perms.push(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    }
    const result = await PermissionsAndroid.requestMultiple(perms as any);
    return Object.values(result).every(v => v === PermissionsAndroid.RESULTS.GRANTED);
  }

  /** Список сопряжённых BT-устройств. iOS не отдаёт системный список — там всегда пусто. */
  async listPairedDevices(): Promise<PairedScanner[]> {
    const classic = getClassic();
    if (!classic) return [];
    try {
      const granted = await this.requestPermissions();
      if (!granted) return [];
      const devices = await classic.getBondedDevices();
      return devices.map(d => ({ id: d.address, name: d.name || 'Без имени' }));
    } catch (e) {
      console.warn('HardwareScannerService.listPairedDevices: failed', e);
      return [];
    }
  }

  async isBluetoothEnabled(): Promise<boolean> {
    const classic = getClassic();
    if (!classic) return true; // на iOS принять «true», т.к. список не используем
    try {
      return await classic.isBluetoothEnabled();
    } catch {
      return false;
    }
  }

  async requestBluetoothEnabled(): Promise<boolean> {
    const classic = getClassic();
    if (!classic) return true;
    try {
      return await classic.requestBluetoothEnabled();
    } catch {
      return false;
    }
  }

  /** Диагностика: что не так со сканером по мнению ОС. */
  async diagnose(): Promise<{
    platformSupported: boolean;
    permissionsGranted: boolean;
    bluetoothEnabled: boolean;
    pairedCount: number;
  }> {
    const platformSupported = Platform.OS === 'android';
    if (!platformSupported) {
      return { platformSupported: false, permissionsGranted: true, bluetoothEnabled: true, pairedCount: 0 };
    }
    const permissionsGranted = await this.requestPermissions();
    const bluetoothEnabled = await this.isBluetoothEnabled();
    const devices = permissionsGranted && bluetoothEnabled ? await this.listPairedDevices() : [];
    return { platformSupported, permissionsGranted, bluetoothEnabled, pairedCount: devices.length };
  }
}

export default new HardwareScannerService();
