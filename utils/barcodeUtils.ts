// utils/barcodeUtils.ts
//
// Генерация валидных EAN-13 штрих-кодов целиком офлайн (без сети).
// EAN-13 = 12 случайных цифр + 1 контрольная (вычисленная по стандарту).

/**
 * Считает контрольную цифру EAN-13 по алгоритму:
 *   sum = Σ(digit × weight), где weight = 1 для нечётных позиций (1,3,...,11) и 3 для чётных (2,4,...,12)
 *   check = (10 − sum mod 10) mod 10
 */
export function calcEan13Checksum(digits12: string): number {
  if (digits12.length !== 12 || !/^\d{12}$/.test(digits12)) {
    throw new Error('calcEan13Checksum: expected exactly 12 digits');
  }
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = digits12.charCodeAt(i) - 48; // быстрее чем parseInt
    sum += i % 2 === 0 ? d : d * 3;
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * Генерирует валидный EAN-13.
 * Префикс по умолчанию `200` — диапазон in-store (зарезервирован для внутреннего использования
 * магазинов, не пересекается с брендовыми кодами производителей).
 */
export function generateEan13(prefix: string = '200'): string {
  if (!/^\d{1,12}$/.test(prefix)) {
    throw new Error('generateEan13: prefix must be 1–12 digits');
  }
  let body = prefix;
  while (body.length < 12) {
    body += Math.floor(Math.random() * 10).toString();
  }
  const check = calcEan13Checksum(body);
  return body + check.toString();
}

/**
 * Проверка что строка — валидный EAN-13.
 */
export function isValidEan13(value: string): boolean {
  if (!/^\d{13}$/.test(value)) return false;
  const provided = value.charCodeAt(12) - 48;
  return calcEan13Checksum(value.slice(0, 12)) === provided;
}
