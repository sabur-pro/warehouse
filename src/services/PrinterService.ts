// src/services/PrinterService.ts
//
// Сервис подключения к принтеру этикеток (XPrinter XP-366B и совместимые).
// Поддерживает ДВА транспорта:
//
//   1) Bluetooth Classic / SPP (RFCOMM)  — только Android.
//      iOS блокирует Classic для не-MFi устройств, XPrinter не MFi.
//
//   2) Bluetooth Low Energy (GATT)        — Android + iOS.
//      iOS BLE НЕ требует MFi, поэтому печать с iPhone тоже работает.
//      Современные XP-366B поддерживают dual-mode (Classic + BLE одновременно).
//
// Команды принтеру — TSPL/TSPL2 (формат этикеток XPrinter, не ESC/POS):
//   SIZE / GAP / DENSITY / DIRECTION / CLS / TEXT / BARCODE / PRINT
//
// На iOS список «спаренных» устройств получить нельзя (BLE GATT не пара́рится
// через системный диалог) — вместо этого делаем BLE-скан и показываем найденное.
// На Android доступны оба варианта: показываем системно-сопряжённые Classic
// + результат BLE-сканирования.

import { PermissionsAndroid, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  BleManager,
  Device as BleDevice,
  Characteristic,
  State as BleState,
} from 'react-native-ble-plx';

// react-native-bluetooth-classic на iOS не залинкован (см. react-native.config.js),
// поэтому импортируем модуль ЛЕНИВО, только на Android. Иначе JS-bundle содержит
// require, и на iOS NativeModules ругается «модуль не найден» при первом обращении.
type ClassicDeviceType = {
  address: string;
  name: string;
  isConnected: () => Promise<boolean>;
  disconnect: () => Promise<void>;
  // v1.73+ принимает второй параметр encoding ('ascii' | 'base64' | 'utf-8' | ...).
  // Используем 'base64', чтобы передавать сырые байты (для CP1251-кириллицы).
  write: (data: string, encoding?: string) => Promise<void>;
};

type ClassicModule = {
  default: {
    isBluetoothEnabled: () => Promise<boolean>;
    requestBluetoothEnabled: () => Promise<boolean>;
    getBondedDevices: () => Promise<ClassicDeviceType[]>;
    connectToDevice: (
      address: string,
      options: { delimiter: string; charset: string },
    ) => Promise<ClassicDeviceType>;
  };
};

let classicMod: ClassicModule['default'] | null | undefined; // undefined = ещё не пробовали

function getClassic(): ClassicModule['default'] | null {
  if (Platform.OS !== 'android') return null;
  if (classicMod !== undefined) return classicMod;
  try {
    // require, а не import — чтобы Metro/iOS-бандл не пытался подключить native side.
    classicMod = require('react-native-bluetooth-classic').default;
    return classicMod ?? null;
  } catch {
    classicMod = null;
    return null;
  }
}

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------
const KEY_DEVICE_V2 = 'printer_device_v2';
const KEY_DEVICE_LEGACY = 'printer_device_address';
const KEY_LABEL_SIZE = 'printer_label_size';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------
export type TransportMode = 'classic' | 'ble';

export interface PrinterRecord {
  id: string;          // MAC (Android Classic / Android BLE) или UUID (iOS BLE)
  name: string;
  mode: TransportMode;
  // Только для BLE — UUIDы заполняются при первом успешном подключении.
  serviceUUID?: string;
  writeCharUUID?: string;
  writeWithResponse?: boolean;
}

export interface DiscoveredDevice {
  id: string;
  name: string;
  mode: TransportMode;
  rssi?: number | null;
}

export interface LabelSize {
  widthMm: number;
  heightMm: number;
  gapMm: number;
}

export const LABEL_SIZES: { id: string; label: string; size: LabelSize }[] = [
  { id: '40x30', label: '40 × 30 мм', size: { widthMm: 40, heightMm: 30, gapMm: 2 } },
  { id: '50x30', label: '50 × 30 мм', size: { widthMm: 50, heightMm: 30, gapMm: 2 } },
  { id: '58x40', label: '58 × 40 мм', size: { widthMm: 58, heightMm: 40, gapMm: 2 } },
  { id: '60x40', label: '60 × 40 мм', size: { widthMm: 60, heightMm: 40, gapMm: 2 } },
  { id: '100x60', label: '100 × 60 мм', size: { widthMm: 100, heightMm: 60, gapMm: 3 } },
];

export const DEFAULT_LABEL_SIZE_ID = '40x30';

export interface PrintBarcodeOptions {
  code: string;
  name?: string;
  copies?: number;
  format?: 'EAN13' | 'EAN8' | '128';
  // Дополнительная инфа на этикетке (опционально). Если поле пустое — оно
  // просто не отрисовывается, кода под штрихкодом остаётся.
  price?: string;
  // Дизайн этикетки — определяет, какие строки рисовать сверху штрихкода.
  // 'minimal' — только штрихкод
  // 'with-name' — название + штрихкод
  // 'with-price' — цена + штрихкод
  // 'price-tag' — название + крупная цена + штрихкод (ценник)
  design?: 'minimal' | 'with-name' | 'with-price' | 'price-tag';
  // Размер этикетки. Если не указан — берётся из настроек принтера.
  size?: LabelSize;
}

export interface PrintQRCodeOptions {
  data: string;          // содержимое QR (JSON товара)
  name?: string;         // подпись над QR
  label?: string;        // дополнительная подпись (например, «Коробка 1»)
  price?: string;        // цена крупно над QR (если указана)
  copies?: number;
  size?: LabelSize;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------
class PrinterServiceImpl {
  // BleManager создаётся лениво — на iOS Simulator/без BT-чипа конструктор может
  // ругаться, но реальное устройство всегда отрабатывает.
  private bleManager: BleManager | null = null;

  // Текущее активное соединение. Только одно из двух поднято.
  private classicConnected: ClassicDeviceType | null = null;
  private bleConnected: BleDevice | null = null;
  private bleWriteService: string | null = null;
  private bleWriteChar: string | null = null;
  private bleWriteWithResponse = true;

  // Сканирование BLE — управляется флагом, чтобы можно было корректно остановить.
  private bleScanActive = false;

  private getBle(): BleManager {
    if (!this.bleManager) this.bleManager = new BleManager();
    return this.bleManager;
  }

  // -------------------------------------------------------------------------
  // Permissions / Bluetooth state
  // -------------------------------------------------------------------------

  /** Печать поддерживается на обоих платформах через BLE; Classic — Android-only. */
  isPlatformSupported(): boolean {
    return true;
  }

  isClassicSupported(): boolean {
    return getClassic() !== null;
  }

  isBleSupported(): boolean {
    return Platform.OS === 'android' || Platform.OS === 'ios';
  }

  /** Запрос рантайм-разрешений. Android 12+ → SCAN+CONNECT; младше — LOCATION. */
  async requestPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;

    const apiLevel = Platform.Version as number;
    const perms: string[] = [];

    if (apiLevel >= 31) {
      perms.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN);
      perms.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
    } else {
      perms.push(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    }

    const result = await PermissionsAndroid.requestMultiple(perms as any);
    return Object.values(result).every(v => v === PermissionsAndroid.RESULTS.GRANTED);
  }

  async isBluetoothEnabled(): Promise<boolean> {
    const classic = getClassic();
    if (classic) {
      try {
        return await classic.isBluetoothEnabled();
      } catch {
        // упадёт обратно на проверку BLE-стейта
      }
    }
    try {
      const state = await this.getBle().state();
      return state === BleState.PoweredOn;
    } catch {
      return false;
    }
  }

  async requestBluetoothEnabled(): Promise<boolean> {
    const classic = getClassic();
    if (classic) {
      try {
        return await classic.requestBluetoothEnabled();
      } catch {
        return false;
      }
    }
    // iOS не даёт включить BT программно — пользователь делает это в Настройках.
    return this.isBluetoothEnabled();
  }

  // -------------------------------------------------------------------------
  // Discovery
  // -------------------------------------------------------------------------

  /** Список системно-сопряжённых Bluetooth-Classic устройств (только Android). */
  async listPairedClassic(): Promise<DiscoveredDevice[]> {
    const classic = getClassic();
    if (!classic) return [];
    const devices = await classic.getBondedDevices();
    return devices.map(d => ({
      id: d.address,
      name: d.name || 'Без имени',
      mode: 'classic' as const,
    }));
  }

  /**
   * Сканирование BLE. Вызывает `onUpdate` каждый раз, когда находится новое
   * устройство (или его RSSI обновился). Останавливается через `timeoutMs`
   * или вручную через `stopBleScan()`.
   */
  async scanBle(
    onUpdate: (devices: DiscoveredDevice[]) => void,
    timeoutMs = 12000,
  ): Promise<void> {
    if (!this.isBleSupported()) return;

    const ble = this.getBle();
    const found = new Map<string, DiscoveredDevice>();

    // Дождаться, что Bluetooth-стек включён (важно на iOS — BleManager стартует
    // асинхронно, и ранний скан возвращает ошибку).
    await this.waitForBlePoweredOn();

    this.bleScanActive = true;
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => this.stopBleScan().finally(resolve), timeoutMs);

      ble.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
        if (error) {
          clearTimeout(timer);
          this.stopBleScan().finally(() => reject(error));
          return;
        }
        if (!device) return;
        const entry: DiscoveredDevice = {
          id: device.id,
          name: device.name || device.localName || 'Без имени',
          mode: 'ble',
          rssi: device.rssi ?? null,
        };
        found.set(device.id, entry);
        onUpdate(Array.from(found.values()));
      });
    });
  }

  async stopBleScan(): Promise<void> {
    if (!this.isBleSupported()) return;
    if (!this.bleScanActive) return;
    this.bleScanActive = false;
    try {
      this.getBle().stopDeviceScan();
    } catch {
      // ignore
    }
  }

  private async waitForBlePoweredOn(timeoutMs = 6000): Promise<void> {
    const ble = this.getBle();
    const current = await ble.state();
    if (current === BleState.PoweredOn) return;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        sub.remove();
        reject(new Error('Bluetooth не включён'));
      }, timeoutMs);
      const sub = ble.onStateChange(state => {
        if (state === BleState.PoweredOn) {
          clearTimeout(timer);
          sub.remove();
          resolve();
        }
      }, true);
    });
  }

  // -------------------------------------------------------------------------
  // Saved printer (persistence)
  // -------------------------------------------------------------------------

  async getSavedPrinter(): Promise<PrinterRecord | null> {
    const raw = await AsyncStorage.getItem(KEY_DEVICE_V2);
    if (raw) {
      try {
        return JSON.parse(raw) as PrinterRecord;
      } catch {
        await AsyncStorage.removeItem(KEY_DEVICE_V2);
      }
    }
    // Миграция со старого ключа (тогда был только Classic).
    const legacy = await AsyncStorage.getItem(KEY_DEVICE_LEGACY);
    if (legacy) {
      const rec: PrinterRecord = { id: legacy, name: legacy, mode: 'classic' };
      await AsyncStorage.setItem(KEY_DEVICE_V2, JSON.stringify(rec));
      await AsyncStorage.removeItem(KEY_DEVICE_LEGACY);
      return rec;
    }
    return null;
  }

  async savePrinter(rec: PrinterRecord): Promise<void> {
    await AsyncStorage.setItem(KEY_DEVICE_V2, JSON.stringify(rec));
  }

  async clearSavedPrinter(): Promise<void> {
    await AsyncStorage.removeItem(KEY_DEVICE_V2);
    await AsyncStorage.removeItem(KEY_DEVICE_LEGACY);
  }

  // -------------------------------------------------------------------------
  // Label size
  // -------------------------------------------------------------------------

  async getLabelSizeId(): Promise<string> {
    return (await AsyncStorage.getItem(KEY_LABEL_SIZE)) || DEFAULT_LABEL_SIZE_ID;
  }

  async setLabelSizeId(id: string): Promise<void> {
    await AsyncStorage.setItem(KEY_LABEL_SIZE, id);
  }

  async getLabelSize(): Promise<LabelSize> {
    const id = await this.getLabelSizeId();
    return (LABEL_SIZES.find(s => s.id === id) || LABEL_SIZES[0]).size;
  }

  // -------------------------------------------------------------------------
  // Connection
  // -------------------------------------------------------------------------

  isConnected(): boolean {
    return this.classicConnected !== null || this.bleConnected !== null;
  }

  getConnectedId(): string | null {
    return this.classicConnected?.address ?? this.bleConnected?.id ?? null;
  }

  /**
   * Подключиться к принтеру. Если в записи нет UUIDов BLE — открыть устройство
   * и автоматически найти первую характеристику с правом write.
   * Обновлённая запись сохраняется в storage (чтобы в следующий раз не искать).
   */
  async connect(rec: PrinterRecord): Promise<PrinterRecord> {
    await this.disconnect().catch(() => {});

    if (rec.mode === 'classic') {
      const classic = getClassic();
      if (!classic) {
        throw new Error('Bluetooth Classic недоступен на этой платформе');
      }
      const device = await classic.connectToDevice(rec.id, {
        delimiter: '\n',
        charset: 'ascii',
      });
      this.classicConnected = device;
      return rec;
    }

    // BLE
    await this.waitForBlePoweredOn();
    const ble = this.getBle();

    // Если в фоновом сканере осталось активное соединение/таск — отменим, чтобы
    // не получить «device already connected» при перезаходе.
    await this.stopBleScan();

    let device: BleDevice;
    try {
      device = await ble.connectToDevice(rec.id, { autoConnect: false, timeout: 15000 });
    } catch (e: any) {
      throw new Error(`Не удалось подключиться по BLE: ${e?.message || e}`);
    }

    // Поднять MTU на Android, чтобы за раз вмещалось больше байт (на iOS API нет —
    // система сама выбирает MTU). 247 — практический максимум для большинства
    // BLE-стекoв, после чего payload до ~244 байт.
    if (Platform.OS === 'android') {
      try {
        await device.requestMTU(247);
      } catch {
        // не критично
      }
    }

    await device.discoverAllServicesAndCharacteristics();

    let serviceUUID = rec.serviceUUID;
    let writeCharUUID = rec.writeCharUUID;
    let writeWithResponse = rec.writeWithResponse ?? true;

    if (!serviceUUID || !writeCharUUID) {
      const found = await this.findWritableCharacteristic(device);
      if (!found) {
        await device.cancelConnection().catch(() => {});
        throw new Error(
          'У устройства не найдено характеристики для записи. Это не похоже на принтер.',
        );
      }
      serviceUUID = found.serviceUUID;
      writeCharUUID = found.charUUID;
      writeWithResponse = found.writeWithResponse;
    }

    this.bleConnected = device;
    this.bleWriteService = serviceUUID;
    this.bleWriteChar = writeCharUUID;
    this.bleWriteWithResponse = writeWithResponse;

    const updated: PrinterRecord = {
      ...rec,
      serviceUUID,
      writeCharUUID,
      writeWithResponse,
    };
    await this.savePrinter(updated);
    return updated;
  }

  /** Найти первую характеристику с возможностью записи. */
  private async findWritableCharacteristic(device: BleDevice): Promise<
    { serviceUUID: string; charUUID: string; writeWithResponse: boolean } | null
  > {
    const services = await device.services();
    for (const svc of services) {
      const chars: Characteristic[] = await svc.characteristics();
      for (const c of chars) {
        if (c.isWritableWithResponse) {
          return { serviceUUID: svc.uuid, charUUID: c.uuid, writeWithResponse: true };
        }
      }
      // Если нет writeWithResponse, но есть writeWithoutResponse — тоже годится.
      for (const c of chars) {
        if (c.isWritableWithoutResponse) {
          return { serviceUUID: svc.uuid, charUUID: c.uuid, writeWithResponse: false };
        }
      }
    }
    return null;
  }

  async disconnect(): Promise<void> {
    if (this.classicConnected) {
      try {
        await this.classicConnected.disconnect();
      } catch {
        // ignore
      }
      this.classicConnected = null;
    }
    if (this.bleConnected) {
      try {
        await this.bleConnected.cancelConnection();
      } catch {
        // ignore
      }
      this.bleConnected = null;
      this.bleWriteService = null;
      this.bleWriteChar = null;
    }
  }

  // -------------------------------------------------------------------------
  // Print
  // -------------------------------------------------------------------------

  async printBarcode(opts: PrintBarcodeOptions): Promise<void> {
    const code = (opts.code || '').trim();
    if (!code) throw new Error('Пустой штрихкод');

    await this.ensureConnected();

    const size = opts.size ?? (await this.getLabelSize());
    const format = opts.format ?? this.pickFormat(code);
    const design = opts.design ?? (opts.name ? 'with-name' : 'minimal');
    const tspl = this.buildBarcodeLabel({
      code,
      name: opts.name?.trim() || '',
      price: opts.price?.trim() || '',
      design,
      size,
      format,
      copies: opts.copies ?? 1,
    });
    await this.writeRaw(tspl);
  }

  /** Печать QR-кода (для коробок/единиц товара). */
  async printQRCode(opts: PrintQRCodeOptions): Promise<void> {
    const data = (opts.data || '').trim();
    if (!data) throw new Error('Пустые данные QR');

    await this.ensureConnected();

    const size = opts.size ?? (await this.getLabelSize());
    const tspl = this.buildQRLabel({
      data,
      name: opts.name?.trim() || '',
      label: opts.label?.trim() || '',
      price: opts.price?.trim() || '',
      size,
      copies: opts.copies ?? 1,
    });
    await this.writeRaw(tspl);
  }

  /** Печать сразу нескольких QR одной командой (с перерывами). */
  async printQRBatch(items: PrintQRCodeOptions[]): Promise<void> {
    for (const it of items) {
      await this.printQRCode(it);
    }
  }

  private async ensureConnected(): Promise<void> {
    let rec = await this.getSavedPrinter();
    if (!rec) throw new Error('Принтер не выбран. Откройте Настройки → Принтер этикеток.');
    if (!this.isConnected()) {
      await this.connect(rec);
    }
  }

  async printTest(): Promise<void> {
    await this.printBarcode({ code: '1234567890128', name: 'TEST PRINT', copies: 1 });
  }

  /**
   * Калибровка датчика зазора (gap sensor) для текущего размера этикетки.
   * Решает проблему «две этикетки подряд печатаются на одной»: после калибровки
   * принтер понимает, где у ленты межэтикеточные промежутки, и автоматически
   * выравнивает каждое задание печати по верху этикетки.
   *
   * Команды TSPL2 (поддерживается XPrinter XP-366B и большинством TSPL-клонов):
   *   SIZE / GAP            — сообщаем ожидаемые размеры
   *   GAPDETECT 5,15        — запуск встроенной процедуры авто-калибровки
   *                           (5 = подача в 5 мм, 15 = порог разницы по датчику)
   *   HOME                  — после калибровки прокрутить ленту к началу новой
   *                           этикетки, чтобы следующая печать стартовала ровно
   *
   * Прогоняется 1-2 этикетки впустую — это нормально, иначе калибровка не
   * успевает «увидеть» гэп.
   */
  async calibrate(): Promise<void> {
    let rec = await this.getSavedPrinter();
    if (!rec) throw new Error('Принтер не выбран. Откройте Настройки → Принтер этикеток.');
    if (!this.isConnected()) {
      rec = await this.connect(rec);
    }
    const size = await this.getLabelSize();
    const lines = [
      `SIZE ${size.widthMm} mm,${size.heightMm} mm`,
      `GAP ${size.gapMm} mm,0 mm`,
      'SET PEEL OFF',
      'SET TEAR ON',
      'GAPDETECT 5,15',
      'HOME',
    ];
    await this.writeRaw(lines.join('\r\n') + '\r\n');
  }

  /** Низкоуровневая запись TSPL. На обоих транспортах шлём СЫРЫЕ БАЙТЫ через
   * base64: ASCII символы транслируются 1:1, кириллица — в CP1251 (нужно,
   * чтобы TSPL принтер с CODEPAGE 1251 печатал русский текст без mojibake).
   */
  private async writeRaw(payload: string): Promise<void> {
    const bytes = strToCP1251Bytes(payload);

    if (this.classicConnected) {
      // bluetooth-classic v1.73+: write(data, 'base64') расшифрует и пошлёт байты.
      const b64 = bytesToBase64(bytes);
      await this.classicConnected.write(b64, 'base64');
      return;
    }
    if (this.bleConnected && this.bleWriteService && this.bleWriteChar) {
      // 180 байт — безопасный чанк под MTU 200+. На Android после requestMTU(247)
      // можно было бы 200+, на iOS система выбирает MTU сама — 180 везде надёжно.
      const CHUNK = 180;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        const slice = bytes.slice(i, i + CHUNK);
        const b64 = bytesToBase64(slice);
        if (this.bleWriteWithResponse) {
          await this.bleConnected.writeCharacteristicWithResponseForService(
            this.bleWriteService,
            this.bleWriteChar,
            b64,
          );
        } else {
          await this.bleConnected.writeCharacteristicWithoutResponseForService(
            this.bleWriteService,
            this.bleWriteChar,
            b64,
          );
        }
      }
      return;
    }
    throw new Error('Нет активного подключения к принтеру');
  }

  // -------------------------------------------------------------------------
  // TSPL
  // -------------------------------------------------------------------------

  private pickFormat(value: string): 'EAN13' | 'EAN8' | '128' {
    const digitsOnly = /^\d+$/.test(value);
    if (digitsOnly && value.length === 13) return 'EAN13';
    if (digitsOnly && value.length === 8) return 'EAN8';
    return '128';
  }

  /**
   * Общая преамбула TSPL: размер + GAP + ориентация + CODEPAGE 1251 + CLS.
   * CODEPAGE 1251 — критично для русского текста: говорит принтеру, что
   * приходящие байты — это Windows-1251 (cp1251), а не Latin-1/UTF-8.
   * Иначе кириллица превращается в mojibake.
   */
  private buildPreamble(size: LabelSize): string[] {
    return [
      `SIZE ${size.widthMm} mm,${size.heightMm} mm`,
      `GAP ${size.gapMm} mm,0 mm`,
      'DIRECTION 1',
      'DENSITY 8',
      'REFERENCE 0,0',
      'OFFSET 0 mm',
      'SET TEAR ON',
      'SET PEEL OFF',
      'CODEPAGE 1251',
      'CLS',
    ];
  }

  /**
   * Приблизительная ширина штрихкода в дотах. Нужна для горизонтального
   * центрирования (TSPL не центрирует BARCODE автоматически).
   */
  private estimateBarcodeWidthDots(
    format: 'EAN13' | 'EAN8' | '128',
    content: string,
    moduleWidthDots: number,
  ): number {
    // Модули = "ширина в модулях" по стандарту штрихкода.
    let modules: number;
    if (format === 'EAN13') {
      // 3 (start) + 6*7 (left) + 5 (middle) + 6*7 (right) + 3 (end) = 95
      // + 14 модулей quiet zone (7 с каждой стороны) = 109
      modules = 109;
    } else if (format === 'EAN8') {
      modules = 81; // 67 модулей + quiet zone
    } else {
      // CODE128: каждый символ ~ 11 модулей + start(11) + checksum(11) + stop(13) + quiet(20)
      modules = content.length * 11 + 55;
    }
    return modules * moduleWidthDots;
  }

  /**
   * Приблизительное число модулей QR Version + ECC. Очень грубо: с ECC M
   * на ~150 байт нужна Version 7 (45 модулей), на 200+ — Version 10 (57).
   * Берём с запасом — 57 — для корректного расчёта cellWidth.
   */
  private estimateQRModules(dataLen: number): number {
    if (dataLen <= 32) return 25; // v2
    if (dataLen <= 78) return 33; // v4
    if (dataLen <= 122) return 41; // v6
    if (dataLen <= 178) return 45; // v7
    if (dataLen <= 262) return 53; // v9
    return 57; // v10+
  }

  private buildBarcodeLabel(opts: {
    code: string;
    name: string;
    price: string;
    design: NonNullable<PrintBarcodeOptions['design']>;
    size: LabelSize;
    format: 'EAN13' | 'EAN8' | '128';
    copies: number;
  }): string {
    const { code, name, price, design, size, format, copies } = opts;
    const dotsPerMm = 8; // 203 dpi у XP-366B
    const heightDots = Math.round(size.heightMm * dotsPerMm);
    const widthDots = Math.round(size.widthMm * dotsPerMm);

    const padX = 16;
    let cursorY = 12;

    const lines: string[] = this.buildPreamble(size);

    // ── Верхняя часть этикетки: зависит от дизайна ───────────────────────────
    if ((design === 'with-name' || design === 'price-tag') && name) {
      const safe = this.escapeText(name).slice(0, 32);
      lines.push(this.centeredText(safe, '3', 1, 1, cursorY, widthDots));
      cursorY += 32;
    }

    if (design === 'price-tag' && price) {
      const safe = this.escapeText(price).slice(0, 16);
      lines.push(this.centeredText(safe, '5', 2, 2, cursorY, widthDots));
      cursorY += 64;
    } else if (design === 'with-price' && price) {
      const safe = this.escapeText(price).slice(0, 24);
      lines.push(this.centeredText(safe, '4', 1, 1, cursorY, widthDots));
      cursorY += 40;
    }

    // ── Штрихкод занимает оставшуюся высоту, центрируется по горизонтали ────
    const reservedBottom = 32; // запас под HRI-цифры под штрихкодом
    const barcodeHeight = Math.max(40, heightDots - cursorY - reservedBottom);
    const moduleWidth = 2; // nw=2
    const barcodeWidth = this.estimateBarcodeWidthDots(format, code, moduleWidth);
    const barcodeX = Math.max(padX, Math.floor((widthDots - barcodeWidth) / 2));

    lines.push(
      `BARCODE ${barcodeX},${cursorY},"${format}",${barcodeHeight},1,0,${moduleWidth},${moduleWidth},"${this.escapeText(code)}"`,
    );

    lines.push(`PRINT ${Math.max(1, copies)},1`);

    return lines.join('\r\n') + '\r\n';
  }

  private buildQRLabel(opts: {
    data: string;
    name: string;
    label: string;
    price?: string;
    size: LabelSize;
    copies: number;
  }): string {
    const { data, name, label, price, size, copies } = opts;
    const dotsPerMm = 8;
    const heightDots = Math.round(size.heightMm * dotsPerMm);
    const widthDots = Math.round(size.widthMm * dotsPerMm);

    const padX = 16;
    let cursorY = 12;

    const lines: string[] = this.buildPreamble(size);

    // ── Подписи сверху (название / дополнительный label / цена) ─────────────
    if (name) {
      lines.push(this.centeredText(this.escapeText(name).slice(0, 32), '3', 1, 1, cursorY, widthDots));
      cursorY += 30;
    }
    if (price) {
      lines.push(this.centeredText(this.escapeText(price).slice(0, 24), '4', 1, 1, cursorY, widthDots));
      cursorY += 36;
    }
    if (label) {
      lines.push(this.centeredText(this.escapeText(label).slice(0, 32), '2', 1, 1, cursorY, widthDots));
      cursorY += 24;
    }

    // ── QR: подбираем cellWidth под фактическую длину данных ─────────────────
    // Cell = сторона одного «пикселя» QR в дотах. Итоговая сторона QR =
    // cell * число_модулей. Должна влезть и по ширине, и по высоте.
    const modules = this.estimateQRModules(data.length);
    const availableHeight = heightDots - cursorY - 8;
    const availableWidth = widthDots - padX * 2;
    const maxCell = Math.floor(Math.min(availableWidth, availableHeight) / modules);
    const cellWidth = Math.max(2, maxCell);

    // Центрируем QR по горизонтали.
    const qrSide = cellWidth * modules;
    const qrX = Math.max(padX, Math.floor((widthDots - qrSide) / 2));

    // QRCODE x,y,EccLevel,cellWidth,mode,rotation,"data"
    // ECC M даёт ~15% коррекции — обычно достаточно для термопечати.
    // mode A — авто (числа/буквы/байты определяет принтер сам).
    lines.push(
      `QRCODE ${qrX},${cursorY},M,${cellWidth},A,0,"${this.escapeQRData(data)}"`,
    );

    lines.push(`PRINT ${Math.max(1, copies)},1`);

    return lines.join('\r\n') + '\r\n';
  }

  /**
   * Аппроксимация центрирования TEXT по горизонтали. TSPL умеет TEXT с
   * x-координатой — высчитываем её исходя из ширины шрифта.
   */
  private centeredText(
    text: string,
    font: string,
    xMul: number,
    yMul: number,
    y: number,
    labelWidthDots: number,
  ): string {
    // Грубая прикидка ширины шрифта (font widths × xMul):
    // "2": 8 dots; "3": 12 dots; "4": 14 dots; "5": 24 dots (по даташиту XP-366B).
    const charWidthMap: Record<string, number> = { '2': 8, '3': 12, '4': 14, '5': 24 };
    const charW = (charWidthMap[font] ?? 12) * xMul;
    const textWidth = text.length * charW;
    const x = Math.max(0, Math.floor((labelWidthDots - textWidth) / 2));
    return `TEXT ${x},${y},"${font}",0,${xMul},${yMul},"${text}"`;
  }

  /**
   * Подготовка строки к TSPL TEXT-команде.
   *
   * Транслитерируем кириллицу в латиницу. Причина: даже с CODEPAGE 1251
   * встроенные шрифты XP-366B чаще всего НЕ содержат кириллических глифов —
   * на этикетке выходит mojibake (китайскоподобные символы). Транслитерация
   * даёт читаемый результат на любом термопринтере. Латиница, цифры и
   * знаки препинания проходят 1:1.
   *
   * Также: любой Unicode-знак валюты заменяем на ASCII-код активной валюты
   * (ISO 4217 — например RUB, USD, TJS). Это спасает термопринтер от
   * непечатающихся глифов (₽, €, ₸ и т.п. чаще всего отсутствуют в шрифте).
   */
  private escapeText(s: string): string {
    const transliterated = transliterateCyrillic(s);
    // Импортируем по требованию, чтобы избежать циклической зависимости.
    const { getActiveCurrencyCode } = require('../utils/currencyState');
    const { getCurrency } = require('../config/currencies');
    const asciiCode = getCurrency(getActiveCurrencyCode()).asciiLabel as string;
    return transliterated
      .replace(/"/g, "'")
      .replace(/[\r\n]+/g, ' ')
      // Подменяем популярные Unicode-знаки валют на ASCII-код активной валюты.
      .replace(/[₽€₸₴₺₿₪₹฿₫₱₩₦₵₲₪₡₭₮]/g, asciiCode)
      // А также «сомонӣ» / «сом» (кириллица) — если вдруг попали в текст после
      // транслитерации, она трогает только латинизируемые буквы, а суффикс
      // валюты может уйти в нечитаемое.
      .replace(/\bсомон[ӣи]\b/gi, asciiCode)
      .replace(/\s(сом|с\.)$/gi, ` ${asciiCode}`);
  }

  /**
   * Подготовка СОДЕРЖИМОГО QR-кода.
   *
   * Сюда приходит JSON (например {"itemName":"Найк",...}). Кириллицу здесь
   * транслитерировать нельзя — камера, которая отсканирует QR, ждёт JSON с
   * ОРИГИНАЛЬНЫМ именем для парсинга и поиска товара. Поэтому вместо
   * транслитерации экранируем не-ASCII как \uXXXX (валидный JSON-escape):
   * JSON.parse расшифрует их обратно в кириллицу при сканировании.
   *
   * Итог: QR содержит ТОЛЬКО ASCII-байты → не зависит от CODEPAGE/шрифтов
   * принтера и стабильно читается камерой.
   */
  private escapeQRData(s: string): string {
    let out = '';
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      const code = s.charCodeAt(i);
      if (ch === '"') {
        out += '\\"';
      } else if (code < 0x80) {
        out += ch;
      } else {
        out += '\\u' + ('0000' + code.toString(16)).slice(-4);
      }
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// Helpers: UTF-8 → CP1251 → base64
// ---------------------------------------------------------------------------
//
// XPrinter XP-366B (и большинство TSPL-принтеров) ожидают однобайтовую
// кодировку. Кириллица в TSPL работает через CODEPAGE 1251 — но это значит,
// что русские буквы надо слать как байты CP1251, а не UTF-8.
//
// Например, буква 'Р' (U+0420) в CP1251 = 0xD0; в UTF-8 — 2 байта 0xD0 0xA0.
// Если послать 0xD0 0xA0 принтеру с CODEPAGE 1251, он покажет 'Р' + ' ' и
// дальнейший текст будет смещён → mojibake типа "ç 39 - Г äû1 ( ū ç".

function strToCP1251Bytes(s: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    let byte: number;
    if (code < 128) {
      // ASCII 1:1 (\r, \n, цифры, латиница, знаки) — без изменений.
      byte = code;
    } else if (code === 0x0401) {
      byte = 0xA8; // Ё
    } else if (code === 0x0451) {
      byte = 0xB8; // ё
    } else if (code >= 0x0410 && code <= 0x044F) {
      // А-Я (0x0410-0x042F) → 0xC0-0xDF; а-я (0x0430-0x044F) → 0xE0-0xFF.
      byte = code - 0x0410 + 0xC0;
    } else if (code === 0x2116) {
      byte = 0xB9; // №
    } else if (code === 0x00AB) byte = 0xAB; // «
    else if (code === 0x00BB) byte = 0xBB; // »
    else if (code === 0x2014) byte = 0x97; // —
    else if (code === 0x2013) byte = 0x96; // –
    else {
      // Не поддерживается CP1251 (например, ₽ U+20BD): заменяем на '?'.
      byte = 0x3F;
    }
    bytes.push(byte);
  }
  return bytes;
}

function bytesToBase64(bytes: number[]): string {
  // btoa работает с «бинарной» строкой — каждый символ интерпретируется как
  // один байт (0-255). Это РАЗРЕШЁННЫЙ способ заворачивать байты для btoa.
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  if (typeof (globalThis as any).btoa === 'function') {
    return (globalThis as any).btoa(binary);
  }
  // Fallback (ручной base64) — на всякий случай для древних окружений.
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const t1 = a >> 2;
    const t2 = ((a & 3) << 4) | (b >> 4);
    const t3 = ((b & 15) << 2) | (c >> 6);
    const t4 = c & 63;
    out += chars[t1] + chars[t2];
    out += i + 1 < bytes.length ? chars[t3] : '=';
    out += i + 2 < bytes.length ? chars[t4] : '=';
  }
  return out;
}

// ---------------------------------------------------------------------------
// Кириллица → латиница для печати (термопринтер не имеет cyrillic-шрифтов).
// Стандартная транслитерация по упрощённым правилам BGN/PCGN.
// ---------------------------------------------------------------------------
const CYR_TO_LAT: Record<string, string> = {
  'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'Yo',
  'Ж': 'Zh', 'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M',
  'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U',
  'Ф': 'F', 'Х': 'Kh', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Sch',
  'Ъ': '', 'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya',
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
  'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
  'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
  'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
  'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
  // Точки/тире/кавычки → ASCII-эквиваленты.
  '—': '-', '–': '-', '«': '"', '»': '"', '№': 'No',
};

function transliterateCyrillic(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    out += CYR_TO_LAT[ch] !== undefined ? CYR_TO_LAT[ch] : ch;
  }
  return out;
}

export const PrinterService = new PrinterServiceImpl();
export default PrinterService;
