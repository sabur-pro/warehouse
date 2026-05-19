// utils/priceInput.ts
// Хелперы для текстовых полей с дробными суммами / весом.
// Решают две проблемы старого кода (`parseFloat(text) || 0` в стейте-числе):
//   1. промежуточные состояния "11.", "0." стирались при ре-рендере;
//   2. на Android запятая с системной клавиатуры не парсилась.

import type { PriceUnit } from '../database/types';

const ALLOWED_CHARS = /[^0-9.,]/g;

/**
 * Нормализует введённый текст: оставляет цифры + одну точку/запятую
 * и не больше 2 знаков после точки.
 * Не пытается "починить" число — пользователь имеет право ввести "11."
 * и в этот момент ничего не должно скакнуть.
 *
 * Опции:
 *   maxDecimals — максимум знаков после точки (по умолчанию 2 — цена в сомонӣ).
 */
export const sanitizePriceText = (raw: string, maxDecimals: number = 2): string => {
  let cleaned = (raw ?? '').replace(ALLOWED_CHARS, '');
  // Нормализуем запятую → точка
  cleaned = cleaned.replace(',', '.');
  // Допускаем только одну точку
  const dotIdx = cleaned.indexOf('.');
  if (dotIdx !== -1) {
    const intPart = cleaned.slice(0, dotIdx);
    // оставшиеся точки в дробной части убираем
    const fracPart = cleaned.slice(dotIdx + 1).replace(/\./g, '');
    // ограничиваем дробную часть
    const trimmedFrac = maxDecimals >= 0 ? fracPart.slice(0, maxDecimals) : fracPart;
    cleaned = intPart + '.' + trimmedFrac;
  }
  return cleaned;
};

/**
 * Текст → число для сохранения. Пустая строка / неполный ввод ("11.") → 0.
 */
export const parsePriceText = (raw: string | number | null | undefined): number => {
  if (typeof raw === 'number') return isFinite(raw) ? raw : 0;
  if (!raw) return 0;
  const normalized = String(raw).replace(',', '.');
  const n = parseFloat(normalized);
  return isFinite(n) ? n : 0;
};

/**
 * Число → текст для подстановки в инпут на маунте/при загрузке существующего товара.
 * 0 показываем как пустую строку чтобы плейсхолдер мог сработать.
 */
export const formatPriceForInput = (value: number | null | undefined): string => {
  if (value === null || value === undefined || !isFinite(value)) return '';
  if (value === 0) return '';
  // Срезаем хвостовые нули у дробной части, чтобы 11.20 → 11.2, но 11 остаётся 11.
  const str = value.toString();
  return str;
};

/**
 * Короткая подпись единицы для UI.
 */
export const priceUnitLabel = (unit: PriceUnit | undefined): string => {
  switch (unit) {
    case 'kg': return 'кг';
    case '100g': return '100 г';
    case 'piece': return 'шт';
    case 'box': return 'коробку';
    case 'pair':
    default:
      return 'единицу';
  }
};

/**
 * Сколько граммов содержится в одной "единице цены" (priceUnit).
 *   kg   → 1000
 *   100g → 100
 * Для штучных режимов возвращает 0 (никогда не используется через эту ветку).
 */
export const gramsPerPriceUnit = (unit: PriceUnit | undefined): number => {
  if (unit === 'kg') return 1000;
  if (unit === '100g') return 100;
  return 0;
};

/**
 * Конвертирует граммы в "доли priceUnit" — это значение, которое затем
 * умножается на сохранённую price (которая хранится как цена за priceUnit)
 * и даёт сумму к оплате.
 *
 * Пример: priceUnit='kg', price=100 (сом/кг), пользователь ввёл 878 г →
 *   gramsToPriceUnits(878, 'kg') = 0.878
 *   итого = 0.878 * 100 = 87.80 сомонӣ
 *
 * Пример: priceUnit='100g', price=10 (сом/100г), 878 г →
 *   gramsToPriceUnits(878, '100g') = 8.78
 *   итого = 8.78 * 10 = 87.80 сомонӣ
 */
export const gramsToPriceUnits = (grams: number, unit: PriceUnit | undefined): number => {
  const per = gramsPerPriceUnit(unit);
  if (per <= 0) return 0;
  return grams / per;
};

/**
 * Форматирует вес для UI. Если вес кратен 1000 г — показываем в кг,
 * иначе в граммах (целым числом, чтобы не было "878.0 г").
 */
export const formatWeight = (grams: number): string => {
  if (!isFinite(grams) || grams <= 0) return '0 г';
  if (grams >= 1000) {
    const kg = grams / 1000;
    return `${kg.toFixed(kg % 1 === 0 ? 0 : 3).replace(/\.?0+$/, '')} кг`;
  }
  return `${Math.round(grams)} г`;
};
