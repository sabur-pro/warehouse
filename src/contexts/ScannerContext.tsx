// src/contexts/ScannerContext.tsx
//
// Контекст вокруг HardwareScannerService:
//   - грузит настройки при старте
//   - даёт хуки useHardwareScanner() для подписки на сканы и
//     useScannerSettings() для чтения/правки настроек
//   - монтирует <HardwareScannerInput /> один раз в дереве (см. App.tsx)
//
// Источники событий:
//   1. HID-сканер (Bluetooth-клавиатура) — через невидимый TextInput
//      в HardwareScannerInput. Это основной путь.
//   2. Тестовое поле в ScannerSettingsScreen — вызывает HardwareScannerService.emitScan()
//      напрямую, чтобы можно было проверить пайплайн без реального устройства.

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import HardwareScannerService, { ScannerSettings } from '../services/HardwareScannerService';

type ScannerContextValue = {
  settings: ScannerSettings;
  updateSettings: (patch: Partial<ScannerSettings>) => Promise<void>;
};

const ScannerContext = createContext<ScannerContextValue | null>(null);

export const ScannerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<ScannerSettings>(HardwareScannerService.getSettings());

  useEffect(() => {
    let mounted = true;
    HardwareScannerService.load().then(s => {
      if (mounted) setSettings(s);
    });
    const off = HardwareScannerService.onSettingsChange(s => {
      if (mounted) setSettings(s);
    });
    return () => {
      mounted = false;
      off();
    };
  }, []);

  const updateSettings = useCallback(async (patch: Partial<ScannerSettings>) => {
    await HardwareScannerService.update(patch);
  }, []);

  return (
    <ScannerContext.Provider value={{ settings, updateSettings }}>
      {children}
    </ScannerContext.Provider>
  );
};

export function useScannerSettings(): ScannerContextValue {
  const ctx = useContext(ScannerContext);
  if (!ctx) {
    throw new Error('useScannerSettings must be used within ScannerProvider');
  }
  return ctx;
}

// Хук подписки на сканы. Можно вызывать на любом экране — будет получать
// коды, пока компонент смонтирован. Сам не управляет фокусом/железом.
export function useHardwareScanner(
  onScan: (code: string) => void,
  options?: { enabled?: boolean }
) {
  const enabled = options?.enabled ?? true;

  useEffect(() => {
    if (!enabled) return;
    const off = HardwareScannerService.onScan(onScan);
    return off;
  }, [enabled, onScan]);
}
