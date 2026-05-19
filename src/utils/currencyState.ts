// src/utils/currencyState.ts
//
// Глобальный «снимок» текущей валюты аккаунта. Источник истины — React-контекст
// CurrencyContext, который при каждом изменении вызывает setActiveCurrencyCode().
// Функции уровня БД (database.ts) не имеют доступа к контексту, поэтому читают
// активную валюту отсюда при записи новой транзакции.
//
// Поведение по умолчанию — TJS, чтобы поведение до первой инициализации
// контекста совпадало с историческим.

import { DEFAULT_CURRENCY_CODE, isValidCurrencyCode } from '../config/currencies';

let activeCurrencyCode: string = DEFAULT_CURRENCY_CODE;

export const setActiveCurrencyCode = (code: string | null | undefined): void => {
  if (isValidCurrencyCode(code)) {
    activeCurrencyCode = code as string;
  }
};

export const getActiveCurrencyCode = (): string => activeCurrencyCode;
