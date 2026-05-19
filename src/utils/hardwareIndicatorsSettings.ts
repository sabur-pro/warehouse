// src/utils/hardwareIndicatorsSettings.ts
//
// Маленький pub/sub для тогла «показывать индикаторы оборудования (сканер,
// принтер) в нижней панели рядом с кнопкой Синхр.».
//
// Зачем отдельный модуль, а не Context: значение нужно одинаково и в
// SettingsScreen (где тогл переключают), и в SyncStatusBar (где индикаторы
// рендерятся). Контекст потребовал бы провайдера выше обоих — модульный стейт
// + EventEmitter проще и не зависит от порядка провайдеров в App.tsx.

import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const STORAGE_KEY = '@show_hardware_indicators';
const DEFAULT_VALUE = true;

let cached: boolean = DEFAULT_VALUE;
let loaded = false;
const subscribers = new Set<(v: boolean) => void>();

const notify = (v: boolean) => {
  subscribers.forEach(cb => {
    try { cb(v); } catch { /* ignore */ }
  });
};

export const loadHardwareIndicators = async (): Promise<boolean> => {
  if (loaded) return cached;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw === '1' || raw === '0') {
      cached = raw === '1';
    }
  } catch {
    // оставляем дефолт
  }
  loaded = true;
  notify(cached);
  return cached;
};

export const getShowHardwareIndicators = (): boolean => cached;

export const setShowHardwareIndicators = async (next: boolean): Promise<void> => {
  cached = next;
  loaded = true;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, next ? '1' : '0');
  } catch {
    // ignore — в памяти уже обновили, потеряется только после рестарта
  }
  notify(cached);
};

export const subscribeHardwareIndicators = (cb: (v: boolean) => void): (() => void) => {
  subscribers.add(cb);
  return () => { subscribers.delete(cb); };
};

/** React-хук: даёт актуальное значение, подписан на изменения, инициирует загрузку. */
export const useShowHardwareIndicators = (): boolean => {
  const [v, setV] = useState<boolean>(cached);
  useEffect(() => {
    let cancelled = false;
    loadHardwareIndicators().then(loaded => {
      if (!cancelled) setV(loaded);
    });
    const unsub = subscribeHardwareIndicators(setV);
    return () => { cancelled = true; unsub(); };
  }, []);
  return v;
};
