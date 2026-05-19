// src/contexts/CurrencyContext.tsx
//
// Глобальный источник валюты приложения. Стратегия хранения:
//   1) AsyncStorage — мгновенный доступ при старте (offline-first).
//   2) Сервер (Admin.currency) — источник истины при онлайне. При логине и
//      по сигналу loadFromServer() подтягиваем серверное значение и
//      синхронизируем локальное.
//   3) При смене валюты в UI — оптимистично пишем локально и пушим на сервер.
//      Если запрос упал — оставляем локальное значение; следующая успешная
//      синхронизация дотолкает изменение.
//
// Подписка SubscriptionScreen всегда отображается в TJS — она НЕ использует
// этот контекст для своей цены (см. SubscriptionScreen.tsx).

import React, { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback, useMemo } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Currency,
  CURRENCIES,
  DEFAULT_CURRENCY_CODE,
  getCurrency,
  isValidCurrencyCode,
} from '../config/currencies';
import {
  formatCurrency as formatCurrencyRaw,
  currencyLabel as currencyLabelRaw,
  currencyAsciiLabel as currencyAsciiLabelRaw,
  formatAmount as formatAmountRaw,
} from '../utils/formatters';
import AuthService from '../services/AuthService';
import { useAuth } from './AuthContext';
import { setActiveCurrencyCode } from '../utils/currencyState';
import { useSyncRefresh } from '../components/sync/SyncStatusBar';

const STORAGE_KEY = '@app_currency_code';

interface CurrencyContextType {
  currencyCode: string;
  currency: Currency;
  currencies: Currency[];
  /** Сменить валюту локально + попытаться запушить на сервер. */
  setCurrency: (code: string) => Promise<void>;
  /** Подтянуть валюту с сервера (вызывается после логина). */
  loadFromServer: () => Promise<void>;
  /** Отформатировать сумму в активной валюте. */
  formatCurrency: (amount: number) => string;
  /** Только подпись активной валюты. */
  label: string;
  /** ASCII-подпись активной валюты (для термопринтера). */
  asciiLabel: string;
  /** Сумма без подписи (для случаев, где подпись рендерится отдельно). */
  formatAmount: (amount: number) => string;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export const CurrencyProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currencyCode, setCurrencyCode] = useState<string>(DEFAULT_CURRENCY_CODE);
  const { isAuthenticated } = useAuth();

  // Зеркалим текущий код в module-level snapshot — для слоёв вне React
  // (например, database.ts, который проставляет currency в INSERT-ы транзакций).
  useEffect(() => {
    setActiveCurrencyCode(currencyCode);
  }, [currencyCode]);

  // Загрузка локально сохранённой валюты при старте.
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (isValidCurrencyCode(saved)) {
          setCurrencyCode(saved as string);
        }
      } catch (e) {
        console.warn('CurrencyContext: failed to load local currency:', e);
      }
    })();
  }, []);

  const persistLocal = useCallback(async (code: string) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, code);
    } catch (e) {
      console.warn('CurrencyContext: failed to persist currency:', e);
    }
  }, []);

  const pushToServer = useCallback(async (code: string) => {
    try {
      const api = AuthService.getApiInstance();
      await api.patch('/auth/me/currency', { currency: code });
    } catch (e) {
      // Сетевую ошибку игнорируем — локальное значение применено, при
      // следующем успешном loadFromServer() данные согласуются.
      console.warn('CurrencyContext: failed to push currency to server:', e);
    }
  }, []);

  const setCurrency = useCallback(async (code: string) => {
    const safe = isValidCurrencyCode(code) ? code : DEFAULT_CURRENCY_CODE;
    setCurrencyCode(safe);
    await persistLocal(safe);
    pushToServer(safe); // fire-and-forget
  }, [persistLocal, pushToServer]);

  const loadFromServer = useCallback(async () => {
    try {
      const api = AuthService.getApiInstance();
      const res = await api.get('/auth/me/currency');
      const serverCode = (res?.data?.currency || res?.data?.data?.currency) as string | undefined;
      if (isValidCurrencyCode(serverCode)) {
        console.log(`💱 CurrencyContext: server returned ${serverCode}, applying`);
        setCurrencyCode(serverCode as string);
        await persistLocal(serverCode as string);
      } else {
        console.log('💱 CurrencyContext: server returned invalid/empty currency, keeping local');
      }
    } catch (e) {
      // Не блокируем приложение: оффлайн/новый аккаунт/старый бэк — оставляем локальное.
      console.warn('CurrencyContext: loadFromServer failed:', e);
    }
  }, [persistLocal]);

  // Когда пользователь авторизован — подтягиваем серверное значение валюты.
  // Если сервер вернул другую валюту, она перезапишет локальную; если эндпойнт
  // ещё не задеплоен или офлайн — просто остаёмся с локальной.
  useEffect(() => {
    if (isAuthenticated) {
      loadFromServer();
    }
  }, [isAuthenticated, loadFromServer]);

  // Держим актуальные значения в ref, чтобы зарегистрированный sync-callback
  // не зависел от стейл-замыканий и не пере-регистрировался каждый рендер.
  const isAuthenticatedRef = useRef(isAuthenticated);
  const loadFromServerRef = useRef(loadFromServer);
  useEffect(() => {
    isAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated]);
  useEffect(() => {
    loadFromServerRef.current = loadFromServer;
  }, [loadFromServer]);

  // Стабильный коллбэк для useSyncRefresh — читает актуальные значения
  // из ref'ов. На бэке /auth/me/currency для ассистента возвращает валюту
  // его админа (берётся из adminId в JWT), так что после нажатия "Синхр."
  // ассистент подхватывает свежую валюту, выставленную админом.
  const onSyncRefreshCallback = useCallback(() => {
    if (!isAuthenticatedRef.current) return;
    // Небольшая задержка: при синхронизации могут параллельно идти запросы,
    // и access-токен мог истечь. Дать interceptor'у время на refresh
    // токена в одном из соседних запросов — тогда наш GET сразу попадёт
    // с валидным заголовком без лишнего 401-цикла.
    setTimeout(() => {
      loadFromServerRef.current();
    }, 600);
  }, []);
  useSyncRefresh('currency', onSyncRefreshCallback);

  // Дополнительный канал: когда приложение возвращается из бэкграунда,
  // подтягиваем валюту с сервера. Покрывает кейс, когда ассистент не жмёт
  // "Синхр.", но переключается между приложениями.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active' && isAuthenticatedRef.current) {
        loadFromServerRef.current();
      }
    });
    return () => sub.remove();
  }, []);

  const value = useMemo<CurrencyContextType>(() => {
    const currency = getCurrency(currencyCode);
    return {
      currencyCode,
      currency,
      currencies: CURRENCIES,
      setCurrency,
      loadFromServer,
      formatCurrency: (amount: number) => formatCurrencyRaw(amount, currencyCode),
      label: currencyLabelRaw(currencyCode),
      asciiLabel: currencyAsciiLabelRaw(currencyCode),
      formatAmount: (amount: number) => formatAmountRaw(amount, currencyCode),
    };
  }, [currencyCode, setCurrency, loadFromServer]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
};

export const useCurrency = (): CurrencyContextType => {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error('useCurrency must be used within CurrencyProvider');
  return ctx;
};
