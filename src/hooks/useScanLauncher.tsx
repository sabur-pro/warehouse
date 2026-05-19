// src/hooks/useScanLauncher.tsx
//
// Хук «запустить сканирование». Возвращает `start()`-функцию и `modals`-узел,
// который надо вмонтировать в JSX рядом с триггером.
//
// Источник (HID или камера) выбирается автоматически по настройкам сканера:
//   mode='hid'    — всегда HID-сканер (оверлей «Ждём сканер…»)
//   mode='camera' — всегда камера (модалка BarcodeScanner)
//   mode='auto'   — если в настройках есть выбранное HID-устройство → HID,
//                   иначе камера
//
// Используется в:
//   - components/ScanButton.tsx (универсальная иконка-кнопка)
//   - WarehouseScreen / CartScreen FAB «сканировать штрихкод товара»
import React, { useCallback, useState } from 'react';
import { useScannerSettings, useHardwareScanner } from '../contexts/ScannerContext';
import HardwareScannerService from '../services/HardwareScannerService';
import { BarcodeScanner } from '../../components/BarcodeScanner';
import { QRScanner } from '../../components/QRScanner';
import { HidWaitingOverlay } from '../../components/HidWaitingOverlay';

// «Свежесть» скана. Если был хотя бы один скан за последние 10 минут, мы
// считаем что физический сканер сейчас подключён — даже если пользователь не
// заходил в настройки и не выбирал устройство явно.
const RECENT_ACTIVITY_WINDOW_MS = 10 * 60 * 1000;

/**
 * options.cameraType:
 *   'barcode' (default) — открывает BarcodeScanner (1D штрихкоды + QR).
 *   'qr'                — открывает QRScanner (только QR с JSON warehouse_item).
 *
 * HID-ветка одинакова в обоих случаях: внешний 2D-сканер (XB-D66/XB-M82)
 * читает и штрихкоды, и QR — содержимое летит в onScan как есть.
 */
export function useScanLauncher(
  onScan: (code: string) => void,
  options?: { cameraType?: 'barcode' | 'qr' },
) {
  const cameraType = options?.cameraType ?? 'barcode';
  const { settings } = useScannerSettings();
  const [cameraVisible, setCameraVisible] = useState(false);
  const [hidWaiting, setHidWaiting] = useState(false);

  const pickSource = useCallback((): 'hid' | 'camera' => {
    if (settings.mode === 'camera') return 'camera';
    if (settings.mode === 'hid') return 'hid';
    // auto: HID если есть явно выбранное устройство ИЛИ был недавний скан.
    // Иначе — открываем камеру.
    if (settings.selectedDevice) return 'hid';
    const lastAt = HardwareScannerService.getLastActivityAt();
    if (lastAt && Date.now() - lastAt < RECENT_ACTIVITY_WINDOW_MS) return 'hid';
    return 'camera';
  }, [settings.mode, settings.selectedDevice]);

  const start = useCallback(() => {
    const src = pickSource();
    if (src === 'hid') {
      setHidWaiting(true);
    } else {
      setCameraVisible(true);
    }
  }, [pickSource]);

  // Пока оверлей HID открыт — слушаем шину сканов. Любой скан закрывает оверлей.
  // HidWaitingOverlay сделан как absolute View (не <Modal>), поэтому ItemDetailsModal
  // открывается сразу после онскана без проблем со стэком модалок.
  useHardwareScanner(
    useCallback(
      (code: string) => {
        if (!hidWaiting) return;
        setHidWaiting(false);
        onScan(code);
      },
      [hidWaiting, onScan],
    ),
    { enabled: hidWaiting },
  );

  const handleCameraScan = (code: string) => {
    setCameraVisible(false);
    onScan(code);
  };

  const modals = (
    <>
      {cameraType === 'qr' ? (
        <QRScanner
          visible={cameraVisible}
          onClose={() => setCameraVisible(false)}
          onScan={handleCameraScan}
        />
      ) : (
        <BarcodeScanner
          visible={cameraVisible}
          onClose={() => setCameraVisible(false)}
          onScan={handleCameraScan}
        />
      )}
      <HidWaitingOverlay visible={hidWaiting} onCancel={() => setHidWaiting(false)} />
    </>
  );

  return { start, modals };
}
