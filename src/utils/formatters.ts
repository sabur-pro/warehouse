// src/utils/formatters.ts
import { DEFAULT_CURRENCY_CODE, getCurrency } from '../config/currencies';

/**
 * Универсальный форматтер денег. Если код валюты не передан — берём
 * DEFAULT_CURRENCY_CODE (TJS, исторический дефолт проекта). UI слой должен
 * получать актуальный код через хук useCurrency() и передавать сюда.
 *
 * Поведение:
 *  - decimals берётся из ISO 4217 (TJS=2, JPY=0, BHD=3 и т.п.)
 *  - тысячный разделитель — пробел (нормально для ru-RU)
 *  - знак валюты ставится ПОСЛЕ суммы с пробелом ("1 500,00 ₽"),
 *    кроме валют с symbolPosition='before'
 *  - для подписки и иных мест, где нужен жёсткий TJS — передаём 'TJS' явно
 */
export const formatCurrency = (amount: number, currencyCode?: string | null): string => {
  const cur = getCurrency(currencyCode);
  const fixed = amount.toFixed(cur.decimals);
  // Тысячный разделитель — пробел; десятичный — запятая (ru-RU).
  // toFixed выдаёт точку, заменяем на запятую и группируем целую часть.
  const [intPart, fracPart] = fixed.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const formatted = fracPart ? `${grouped},${fracPart}` : grouped;
  return cur.symbolPosition === 'before'
    ? `${cur.shortLabel}${formatted}`
    : `${formatted} ${cur.shortLabel}`;
};

/**
 * Только подпись валюты, без числа. Удобно для лейблов вроде "сом" / "₽"
 * в кнопках, плейсхолдерах, переключателях типа "% / сом".
 */
export const currencyLabel = (currencyCode?: string | null): string => {
  return getCurrency(currencyCode).shortLabel;
};

/**
 * ASCII-подпись валюты (для термопринтера: всегда печатается).
 */
export const currencyAsciiLabel = (currencyCode?: string | null): string => {
  return getCurrency(currencyCode).asciiLabel;
};

/**
 * Просто округлённое число без подписи — для случаев, где нужно показать
 * сумму, а подпись будет рядом отдельным элементом.
 */
export const formatAmount = (amount: number, currencyCode?: string | null): string => {
  const cur = getCurrency(currencyCode);
  const fixed = amount.toFixed(cur.decimals);
  const [intPart, fracPart] = fixed.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return fracPart ? `${grouped},${fracPart}` : grouped;
};

export const formatPercentage = (percentage: number): string => {
  return `${percentage.toFixed(1)}%`;
};

export const formatQuantity = (quantity: number): string => {
  return `${quantity} шт.`;
};

export const formatDate = (timestamp: number): string => {
  return new Date(timestamp * 1000).toLocaleDateString('ru-RU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

export const formatTime = (timestamp: number): string => {
  return new Date(timestamp * 1000).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatDateTime = (timestamp: number): string => {
  return new Date(timestamp * 1000).toLocaleString('ru-RU');
};

export { DEFAULT_CURRENCY_CODE };
