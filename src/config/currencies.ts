// src/config/currencies.ts
// Каталог валют ISO 4217. Используется селектором в настройках и форматтером
// formatCurrency. Поля:
//   code        — ISO 4217 (3 буквы)
//   name        — отображаемое имя на русском
//   symbol      — короткий знак для UI (₽, $, €, ...). Для большинства валют —
//                 нативный символ; если нативного нет — короткий код (напр. TJS)
//   shortLabel  — короткий тег, который ставим ПОСЛЕ числа в основном UI
//                 (например 1500 ₽, 1500 $, 1500 сом, 1500 KZT). Должен
//                 читаться кратко и не зависеть от падежа.
//   decimals    — число знаков после запятой (ISO 4217). 0 для JPY, KRW и т.п.,
//                 3 для BHD/KWD/OMR и т.п., 2 для большинства.
//   asciiLabel  — гарантированно ASCII (для термопринтера, который не печатает
//                 кириллицу/нестандартные символы). По умолчанию — это сам код.
//   symbolPosition — где ставить symbol в "форматированном" виде. В русскоязычном
//                 UI почти всегда after (1500 ₽), но для USD/EUR традиционно before.

export interface Currency {
  code: string;
  name: string;
  symbol: string;
  shortLabel: string;
  decimals: number;
  asciiLabel: string;
  symbolPosition: 'before' | 'after';
}

export const DEFAULT_CURRENCY_CODE = 'TJS';

// Полный список ISO 4217 (живые валюты). Для подавляющего большинства валют,
// у которых нет уникального символа, символ совпадает с кодом — это нормально.
export const CURRENCIES: Currency[] = [
  { code: 'AED', name: 'Дирхам ОАЭ', symbol: 'د.إ', shortLabel: 'AED', decimals: 2, asciiLabel: 'AED', symbolPosition: 'after' },
  { code: 'AFN', name: 'Афгани', symbol: '؋', shortLabel: 'AFN', decimals: 2, asciiLabel: 'AFN', symbolPosition: 'after' },
  { code: 'ALL', name: 'Албанский лек', symbol: 'L', shortLabel: 'ALL', decimals: 2, asciiLabel: 'ALL', symbolPosition: 'after' },
  { code: 'AMD', name: 'Армянский драм', symbol: '֏', shortLabel: 'AMD', decimals: 2, asciiLabel: 'AMD', symbolPosition: 'after' },
  { code: 'ANG', name: 'Нидерландский антильский гульден', symbol: 'ƒ', shortLabel: 'ANG', decimals: 2, asciiLabel: 'ANG', symbolPosition: 'after' },
  { code: 'AOA', name: 'Ангольская кванза', symbol: 'Kz', shortLabel: 'AOA', decimals: 2, asciiLabel: 'AOA', symbolPosition: 'after' },
  { code: 'ARS', name: 'Аргентинское песо', symbol: '$', shortLabel: 'ARS', decimals: 2, asciiLabel: 'ARS', symbolPosition: 'after' },
  { code: 'AUD', name: 'Австралийский доллар', symbol: 'A$', shortLabel: 'AUD', decimals: 2, asciiLabel: 'AUD', symbolPosition: 'after' },
  { code: 'AWG', name: 'Арубанский флорин', symbol: 'ƒ', shortLabel: 'AWG', decimals: 2, asciiLabel: 'AWG', symbolPosition: 'after' },
  { code: 'AZN', name: 'Азербайджанский манат', symbol: '₼', shortLabel: 'AZN', decimals: 2, asciiLabel: 'AZN', symbolPosition: 'after' },
  { code: 'BAM', name: 'Конвертируемая марка', symbol: 'KM', shortLabel: 'BAM', decimals: 2, asciiLabel: 'BAM', symbolPosition: 'after' },
  { code: 'BBD', name: 'Барбадосский доллар', symbol: 'Bds$', shortLabel: 'BBD', decimals: 2, asciiLabel: 'BBD', symbolPosition: 'after' },
  { code: 'BDT', name: 'Бангладешская така', symbol: '৳', shortLabel: 'BDT', decimals: 2, asciiLabel: 'BDT', symbolPosition: 'after' },
  { code: 'BGN', name: 'Болгарский лев', symbol: 'лв.', shortLabel: 'BGN', decimals: 2, asciiLabel: 'BGN', symbolPosition: 'after' },
  { code: 'BHD', name: 'Бахрейнский динар', symbol: 'BD', shortLabel: 'BHD', decimals: 3, asciiLabel: 'BHD', symbolPosition: 'after' },
  { code: 'BIF', name: 'Бурундийский франк', symbol: 'FBu', shortLabel: 'BIF', decimals: 0, asciiLabel: 'BIF', symbolPosition: 'after' },
  { code: 'BMD', name: 'Бермудский доллар', symbol: 'BD$', shortLabel: 'BMD', decimals: 2, asciiLabel: 'BMD', symbolPosition: 'after' },
  { code: 'BND', name: 'Брунейский доллар', symbol: 'B$', shortLabel: 'BND', decimals: 2, asciiLabel: 'BND', symbolPosition: 'after' },
  { code: 'BOB', name: 'Боливиано', symbol: 'Bs.', shortLabel: 'BOB', decimals: 2, asciiLabel: 'BOB', symbolPosition: 'after' },
  { code: 'BRL', name: 'Бразильский реал', symbol: 'R$', shortLabel: 'BRL', decimals: 2, asciiLabel: 'BRL', symbolPosition: 'after' },
  { code: 'BSD', name: 'Багамский доллар', symbol: 'B$', shortLabel: 'BSD', decimals: 2, asciiLabel: 'BSD', symbolPosition: 'after' },
  { code: 'BTN', name: 'Бутанский нгултрум', symbol: 'Nu.', shortLabel: 'BTN', decimals: 2, asciiLabel: 'BTN', symbolPosition: 'after' },
  { code: 'BWP', name: 'Ботсванская пула', symbol: 'P', shortLabel: 'BWP', decimals: 2, asciiLabel: 'BWP', symbolPosition: 'after' },
  { code: 'BYN', name: 'Белорусский рубль', symbol: 'Br', shortLabel: 'BYN', decimals: 2, asciiLabel: 'BYN', symbolPosition: 'after' },
  { code: 'BZD', name: 'Белизский доллар', symbol: 'BZ$', shortLabel: 'BZD', decimals: 2, asciiLabel: 'BZD', symbolPosition: 'after' },
  { code: 'CAD', name: 'Канадский доллар', symbol: 'CA$', shortLabel: 'CAD', decimals: 2, asciiLabel: 'CAD', symbolPosition: 'after' },
  { code: 'CDF', name: 'Конголезский франк', symbol: 'FC', shortLabel: 'CDF', decimals: 2, asciiLabel: 'CDF', symbolPosition: 'after' },
  { code: 'CHF', name: 'Швейцарский франк', symbol: 'CHF', shortLabel: 'CHF', decimals: 2, asciiLabel: 'CHF', symbolPosition: 'after' },
  { code: 'CLP', name: 'Чилийское песо', symbol: 'CLP$', shortLabel: 'CLP', decimals: 0, asciiLabel: 'CLP', symbolPosition: 'after' },
  { code: 'CNY', name: 'Китайский юань', symbol: '¥', shortLabel: 'CNY', decimals: 2, asciiLabel: 'CNY', symbolPosition: 'after' },
  { code: 'COP', name: 'Колумбийское песо', symbol: 'COL$', shortLabel: 'COP', decimals: 2, asciiLabel: 'COP', symbolPosition: 'after' },
  { code: 'CRC', name: 'Костариканский колон', symbol: '₡', shortLabel: 'CRC', decimals: 2, asciiLabel: 'CRC', symbolPosition: 'after' },
  { code: 'CUP', name: 'Кубинское песо', symbol: '₱', shortLabel: 'CUP', decimals: 2, asciiLabel: 'CUP', symbolPosition: 'after' },
  { code: 'CVE', name: 'Эскудо Кабо-Верде', symbol: '$', shortLabel: 'CVE', decimals: 2, asciiLabel: 'CVE', symbolPosition: 'after' },
  { code: 'CZK', name: 'Чешская крона', symbol: 'Kč', shortLabel: 'CZK', decimals: 2, asciiLabel: 'CZK', symbolPosition: 'after' },
  { code: 'DJF', name: 'Франк Джибути', symbol: 'Fdj', shortLabel: 'DJF', decimals: 0, asciiLabel: 'DJF', symbolPosition: 'after' },
  { code: 'DKK', name: 'Датская крона', symbol: 'kr', shortLabel: 'DKK', decimals: 2, asciiLabel: 'DKK', symbolPosition: 'after' },
  { code: 'DOP', name: 'Доминиканское песо', symbol: 'RD$', shortLabel: 'DOP', decimals: 2, asciiLabel: 'DOP', symbolPosition: 'after' },
  { code: 'DZD', name: 'Алжирский динар', symbol: 'DA', shortLabel: 'DZD', decimals: 2, asciiLabel: 'DZD', symbolPosition: 'after' },
  { code: 'EGP', name: 'Египетский фунт', symbol: 'E£', shortLabel: 'EGP', decimals: 2, asciiLabel: 'EGP', symbolPosition: 'after' },
  { code: 'ERN', name: 'Эритрейская накфа', symbol: 'Nfk', shortLabel: 'ERN', decimals: 2, asciiLabel: 'ERN', symbolPosition: 'after' },
  { code: 'ETB', name: 'Эфиопский быр', symbol: 'Br', shortLabel: 'ETB', decimals: 2, asciiLabel: 'ETB', symbolPosition: 'after' },
  { code: 'EUR', name: 'Евро', symbol: '€', shortLabel: '€', decimals: 2, asciiLabel: 'EUR', symbolPosition: 'after' },
  { code: 'FJD', name: 'Доллар Фиджи', symbol: 'FJ$', shortLabel: 'FJD', decimals: 2, asciiLabel: 'FJD', symbolPosition: 'after' },
  { code: 'FKP', name: 'Фунт Фолклендских островов', symbol: '£', shortLabel: 'FKP', decimals: 2, asciiLabel: 'FKP', symbolPosition: 'after' },
  { code: 'GBP', name: 'Фунт стерлингов', symbol: '£', shortLabel: '£', decimals: 2, asciiLabel: 'GBP', symbolPosition: 'after' },
  { code: 'GEL', name: 'Грузинский лари', symbol: '₾', shortLabel: 'GEL', decimals: 2, asciiLabel: 'GEL', symbolPosition: 'after' },
  { code: 'GHS', name: 'Ганский седи', symbol: '₵', shortLabel: 'GHS', decimals: 2, asciiLabel: 'GHS', symbolPosition: 'after' },
  { code: 'GIP', name: 'Гибралтарский фунт', symbol: '£', shortLabel: 'GIP', decimals: 2, asciiLabel: 'GIP', symbolPosition: 'after' },
  { code: 'GMD', name: 'Гамбийский даласи', symbol: 'D', shortLabel: 'GMD', decimals: 2, asciiLabel: 'GMD', symbolPosition: 'after' },
  { code: 'GNF', name: 'Гвинейский франк', symbol: 'FG', shortLabel: 'GNF', decimals: 0, asciiLabel: 'GNF', symbolPosition: 'after' },
  { code: 'GTQ', name: 'Гватемальский кетсаль', symbol: 'Q', shortLabel: 'GTQ', decimals: 2, asciiLabel: 'GTQ', symbolPosition: 'after' },
  { code: 'GYD', name: 'Гайанский доллар', symbol: 'G$', shortLabel: 'GYD', decimals: 2, asciiLabel: 'GYD', symbolPosition: 'after' },
  { code: 'HKD', name: 'Гонконгский доллар', symbol: 'HK$', shortLabel: 'HKD', decimals: 2, asciiLabel: 'HKD', symbolPosition: 'after' },
  { code: 'HNL', name: 'Гондурасская лемпира', symbol: 'L', shortLabel: 'HNL', decimals: 2, asciiLabel: 'HNL', symbolPosition: 'after' },
  { code: 'HRK', name: 'Хорватская куна', symbol: 'kn', shortLabel: 'HRK', decimals: 2, asciiLabel: 'HRK', symbolPosition: 'after' },
  { code: 'HTG', name: 'Гаитянский гурд', symbol: 'G', shortLabel: 'HTG', decimals: 2, asciiLabel: 'HTG', symbolPosition: 'after' },
  { code: 'HUF', name: 'Венгерский форинт', symbol: 'Ft', shortLabel: 'HUF', decimals: 2, asciiLabel: 'HUF', symbolPosition: 'after' },
  { code: 'IDR', name: 'Индонезийская рупия', symbol: 'Rp', shortLabel: 'IDR', decimals: 2, asciiLabel: 'IDR', symbolPosition: 'after' },
  { code: 'ILS', name: 'Израильский шекель', symbol: '₪', shortLabel: 'ILS', decimals: 2, asciiLabel: 'ILS', symbolPosition: 'after' },
  { code: 'INR', name: 'Индийская рупия', symbol: '₹', shortLabel: 'INR', decimals: 2, asciiLabel: 'INR', symbolPosition: 'after' },
  { code: 'IQD', name: 'Иракский динар', symbol: 'ID', shortLabel: 'IQD', decimals: 3, asciiLabel: 'IQD', symbolPosition: 'after' },
  { code: 'IRR', name: 'Иранский риал', symbol: '﷼', shortLabel: 'IRR', decimals: 2, asciiLabel: 'IRR', symbolPosition: 'after' },
  { code: 'ISK', name: 'Исландская крона', symbol: 'kr', shortLabel: 'ISK', decimals: 0, asciiLabel: 'ISK', symbolPosition: 'after' },
  { code: 'JMD', name: 'Ямайский доллар', symbol: 'J$', shortLabel: 'JMD', decimals: 2, asciiLabel: 'JMD', symbolPosition: 'after' },
  { code: 'JOD', name: 'Иорданский динар', symbol: 'JD', shortLabel: 'JOD', decimals: 3, asciiLabel: 'JOD', symbolPosition: 'after' },
  { code: 'JPY', name: 'Японская иена', symbol: '¥', shortLabel: '¥', decimals: 0, asciiLabel: 'JPY', symbolPosition: 'after' },
  { code: 'KES', name: 'Кенийский шиллинг', symbol: 'KSh', shortLabel: 'KES', decimals: 2, asciiLabel: 'KES', symbolPosition: 'after' },
  { code: 'KGS', name: 'Киргизский сом', symbol: 'с', shortLabel: 'KGS', decimals: 2, asciiLabel: 'KGS', symbolPosition: 'after' },
  { code: 'KHR', name: 'Камбоджийский риель', symbol: '៛', shortLabel: 'KHR', decimals: 2, asciiLabel: 'KHR', symbolPosition: 'after' },
  { code: 'KMF', name: 'Коморский франк', symbol: 'CF', shortLabel: 'KMF', decimals: 0, asciiLabel: 'KMF', symbolPosition: 'after' },
  { code: 'KPW', name: 'Северокорейская вона', symbol: '₩', shortLabel: 'KPW', decimals: 2, asciiLabel: 'KPW', symbolPosition: 'after' },
  { code: 'KRW', name: 'Южнокорейская вона', symbol: '₩', shortLabel: 'KRW', decimals: 0, asciiLabel: 'KRW', symbolPosition: 'after' },
  { code: 'KWD', name: 'Кувейтский динар', symbol: 'KD', shortLabel: 'KWD', decimals: 3, asciiLabel: 'KWD', symbolPosition: 'after' },
  { code: 'KYD', name: 'Доллар Островов Кайман', symbol: 'CI$', shortLabel: 'KYD', decimals: 2, asciiLabel: 'KYD', symbolPosition: 'after' },
  { code: 'KZT', name: 'Казахстанский тенге', symbol: '₸', shortLabel: 'KZT', decimals: 2, asciiLabel: 'KZT', symbolPosition: 'after' },
  { code: 'LAK', name: 'Лаосский кип', symbol: '₭', shortLabel: 'LAK', decimals: 2, asciiLabel: 'LAK', symbolPosition: 'after' },
  { code: 'LBP', name: 'Ливанский фунт', symbol: 'LL', shortLabel: 'LBP', decimals: 2, asciiLabel: 'LBP', symbolPosition: 'after' },
  { code: 'LKR', name: 'Шри-ланкийская рупия', symbol: 'Rs', shortLabel: 'LKR', decimals: 2, asciiLabel: 'LKR', symbolPosition: 'after' },
  { code: 'LRD', name: 'Либерийский доллар', symbol: 'L$', shortLabel: 'LRD', decimals: 2, asciiLabel: 'LRD', symbolPosition: 'after' },
  { code: 'LSL', name: 'Лоти Лесото', symbol: 'L', shortLabel: 'LSL', decimals: 2, asciiLabel: 'LSL', symbolPosition: 'after' },
  { code: 'LYD', name: 'Ливийский динар', symbol: 'LD', shortLabel: 'LYD', decimals: 3, asciiLabel: 'LYD', symbolPosition: 'after' },
  { code: 'MAD', name: 'Марокканский дирхам', symbol: 'MAD', shortLabel: 'MAD', decimals: 2, asciiLabel: 'MAD', symbolPosition: 'after' },
  { code: 'MDL', name: 'Молдавский лей', symbol: 'L', shortLabel: 'MDL', decimals: 2, asciiLabel: 'MDL', symbolPosition: 'after' },
  { code: 'MGA', name: 'Малагасийский ариари', symbol: 'Ar', shortLabel: 'MGA', decimals: 2, asciiLabel: 'MGA', symbolPosition: 'after' },
  { code: 'MKD', name: 'Македонский денар', symbol: 'ден', shortLabel: 'MKD', decimals: 2, asciiLabel: 'MKD', symbolPosition: 'after' },
  { code: 'MMK', name: 'Мьянманский кьят', symbol: 'K', shortLabel: 'MMK', decimals: 2, asciiLabel: 'MMK', symbolPosition: 'after' },
  { code: 'MNT', name: 'Монгольский тугрик', symbol: '₮', shortLabel: 'MNT', decimals: 2, asciiLabel: 'MNT', symbolPosition: 'after' },
  { code: 'MOP', name: 'Патака Макао', symbol: 'MOP$', shortLabel: 'MOP', decimals: 2, asciiLabel: 'MOP', symbolPosition: 'after' },
  { code: 'MRU', name: 'Мавританская угия', symbol: 'UM', shortLabel: 'MRU', decimals: 2, asciiLabel: 'MRU', symbolPosition: 'after' },
  { code: 'MUR', name: 'Маврикийская рупия', symbol: '₨', shortLabel: 'MUR', decimals: 2, asciiLabel: 'MUR', symbolPosition: 'after' },
  { code: 'MVR', name: 'Мальдивская руфия', symbol: 'Rf', shortLabel: 'MVR', decimals: 2, asciiLabel: 'MVR', symbolPosition: 'after' },
  { code: 'MWK', name: 'Малавийская квача', symbol: 'MK', shortLabel: 'MWK', decimals: 2, asciiLabel: 'MWK', symbolPosition: 'after' },
  { code: 'MXN', name: 'Мексиканское песо', symbol: 'Mex$', shortLabel: 'MXN', decimals: 2, asciiLabel: 'MXN', symbolPosition: 'after' },
  { code: 'MYR', name: 'Малайзийский ринггит', symbol: 'RM', shortLabel: 'MYR', decimals: 2, asciiLabel: 'MYR', symbolPosition: 'after' },
  { code: 'MZN', name: 'Мозамбикский метикал', symbol: 'MT', shortLabel: 'MZN', decimals: 2, asciiLabel: 'MZN', symbolPosition: 'after' },
  { code: 'NAD', name: 'Доллар Намибии', symbol: 'N$', shortLabel: 'NAD', decimals: 2, asciiLabel: 'NAD', symbolPosition: 'after' },
  { code: 'NGN', name: 'Нигерийская найра', symbol: '₦', shortLabel: 'NGN', decimals: 2, asciiLabel: 'NGN', symbolPosition: 'after' },
  { code: 'NIO', name: 'Никарагуанская кордоба', symbol: 'C$', shortLabel: 'NIO', decimals: 2, asciiLabel: 'NIO', symbolPosition: 'after' },
  { code: 'NOK', name: 'Норвежская крона', symbol: 'kr', shortLabel: 'NOK', decimals: 2, asciiLabel: 'NOK', symbolPosition: 'after' },
  { code: 'NPR', name: 'Непальская рупия', symbol: 'NRs', shortLabel: 'NPR', decimals: 2, asciiLabel: 'NPR', symbolPosition: 'after' },
  { code: 'NZD', name: 'Новозеландский доллар', symbol: 'NZ$', shortLabel: 'NZD', decimals: 2, asciiLabel: 'NZD', symbolPosition: 'after' },
  { code: 'OMR', name: 'Оманский риал', symbol: 'OR', shortLabel: 'OMR', decimals: 3, asciiLabel: 'OMR', symbolPosition: 'after' },
  { code: 'PAB', name: 'Панамское бальбоа', symbol: 'B/.', shortLabel: 'PAB', decimals: 2, asciiLabel: 'PAB', symbolPosition: 'after' },
  { code: 'PEN', name: 'Перуанский соль', symbol: 'S/', shortLabel: 'PEN', decimals: 2, asciiLabel: 'PEN', symbolPosition: 'after' },
  { code: 'PGK', name: 'Кина Папуа — Новой Гвинеи', symbol: 'K', shortLabel: 'PGK', decimals: 2, asciiLabel: 'PGK', symbolPosition: 'after' },
  { code: 'PHP', name: 'Филиппинское песо', symbol: '₱', shortLabel: 'PHP', decimals: 2, asciiLabel: 'PHP', symbolPosition: 'after' },
  { code: 'PKR', name: 'Пакистанская рупия', symbol: '₨', shortLabel: 'PKR', decimals: 2, asciiLabel: 'PKR', symbolPosition: 'after' },
  { code: 'PLN', name: 'Польский злотый', symbol: 'zł', shortLabel: 'PLN', decimals: 2, asciiLabel: 'PLN', symbolPosition: 'after' },
  { code: 'PYG', name: 'Парагвайский гуарани', symbol: '₲', shortLabel: 'PYG', decimals: 0, asciiLabel: 'PYG', symbolPosition: 'after' },
  { code: 'QAR', name: 'Катарский риал', symbol: 'QR', shortLabel: 'QAR', decimals: 2, asciiLabel: 'QAR', symbolPosition: 'after' },
  { code: 'RON', name: 'Румынский лей', symbol: 'lei', shortLabel: 'RON', decimals: 2, asciiLabel: 'RON', symbolPosition: 'after' },
  { code: 'RSD', name: 'Сербский динар', symbol: 'дин', shortLabel: 'RSD', decimals: 2, asciiLabel: 'RSD', symbolPosition: 'after' },
  { code: 'RUB', name: 'Российский рубль', symbol: '₽', shortLabel: '₽', decimals: 2, asciiLabel: 'RUB', symbolPosition: 'after' },
  { code: 'RWF', name: 'Руандийский франк', symbol: 'RF', shortLabel: 'RWF', decimals: 0, asciiLabel: 'RWF', symbolPosition: 'after' },
  { code: 'SAR', name: 'Саудовский риял', symbol: 'SR', shortLabel: 'SAR', decimals: 2, asciiLabel: 'SAR', symbolPosition: 'after' },
  { code: 'SBD', name: 'Доллар Соломоновых Островов', symbol: 'SI$', shortLabel: 'SBD', decimals: 2, asciiLabel: 'SBD', symbolPosition: 'after' },
  { code: 'SCR', name: 'Сейшельская рупия', symbol: 'SR', shortLabel: 'SCR', decimals: 2, asciiLabel: 'SCR', symbolPosition: 'after' },
  { code: 'SDG', name: 'Суданский фунт', symbol: 'SDG', shortLabel: 'SDG', decimals: 2, asciiLabel: 'SDG', symbolPosition: 'after' },
  { code: 'SEK', name: 'Шведская крона', symbol: 'kr', shortLabel: 'SEK', decimals: 2, asciiLabel: 'SEK', symbolPosition: 'after' },
  { code: 'SGD', name: 'Сингапурский доллар', symbol: 'S$', shortLabel: 'SGD', decimals: 2, asciiLabel: 'SGD', symbolPosition: 'after' },
  { code: 'SHP', name: 'Фунт Святой Елены', symbol: '£', shortLabel: 'SHP', decimals: 2, asciiLabel: 'SHP', symbolPosition: 'after' },
  { code: 'SLE', name: 'Леоне Сьерра-Леоне', symbol: 'Le', shortLabel: 'SLE', decimals: 2, asciiLabel: 'SLE', symbolPosition: 'after' },
  { code: 'SOS', name: 'Сомалийский шиллинг', symbol: 'Sh.So.', shortLabel: 'SOS', decimals: 2, asciiLabel: 'SOS', symbolPosition: 'after' },
  { code: 'SRD', name: 'Суринамский доллар', symbol: 'Sr$', shortLabel: 'SRD', decimals: 2, asciiLabel: 'SRD', symbolPosition: 'after' },
  { code: 'SSP', name: 'Южносуданский фунт', symbol: 'SSP', shortLabel: 'SSP', decimals: 2, asciiLabel: 'SSP', symbolPosition: 'after' },
  { code: 'STN', name: 'Добра Сан-Томе и Принсипи', symbol: 'Db', shortLabel: 'STN', decimals: 2, asciiLabel: 'STN', symbolPosition: 'after' },
  { code: 'SYP', name: 'Сирийский фунт', symbol: 'LS', shortLabel: 'SYP', decimals: 2, asciiLabel: 'SYP', symbolPosition: 'after' },
  { code: 'SZL', name: 'Свазилендский лилангени', symbol: 'L', shortLabel: 'SZL', decimals: 2, asciiLabel: 'SZL', symbolPosition: 'after' },
  { code: 'THB', name: 'Таиландский бат', symbol: '฿', shortLabel: 'THB', decimals: 2, asciiLabel: 'THB', symbolPosition: 'after' },
  { code: 'TJS', name: 'Таджикский сомони', symbol: 'сомонӣ', shortLabel: 'сомонӣ', decimals: 2, asciiLabel: 'TJS', symbolPosition: 'after' },
  { code: 'TMT', name: 'Туркменский манат', symbol: 'm', shortLabel: 'TMT', decimals: 2, asciiLabel: 'TMT', symbolPosition: 'after' },
  { code: 'TND', name: 'Тунисский динар', symbol: 'DT', shortLabel: 'TND', decimals: 3, asciiLabel: 'TND', symbolPosition: 'after' },
  { code: 'TOP', name: 'Тонганская паанга', symbol: 'T$', shortLabel: 'TOP', decimals: 2, asciiLabel: 'TOP', symbolPosition: 'after' },
  { code: 'TRY', name: 'Турецкая лира', symbol: '₺', shortLabel: 'TRY', decimals: 2, asciiLabel: 'TRY', symbolPosition: 'after' },
  { code: 'TTD', name: 'Доллар Тринидада и Тобаго', symbol: 'TT$', shortLabel: 'TTD', decimals: 2, asciiLabel: 'TTD', symbolPosition: 'after' },
  { code: 'TWD', name: 'Тайваньский доллар', symbol: 'NT$', shortLabel: 'TWD', decimals: 2, asciiLabel: 'TWD', symbolPosition: 'after' },
  { code: 'TZS', name: 'Танзанийский шиллинг', symbol: 'TSh', shortLabel: 'TZS', decimals: 2, asciiLabel: 'TZS', symbolPosition: 'after' },
  { code: 'UAH', name: 'Украинская гривна', symbol: '₴', shortLabel: 'UAH', decimals: 2, asciiLabel: 'UAH', symbolPosition: 'after' },
  { code: 'UGX', name: 'Угандийский шиллинг', symbol: 'USh', shortLabel: 'UGX', decimals: 0, asciiLabel: 'UGX', symbolPosition: 'after' },
  { code: 'USD', name: 'Доллар США', symbol: '$', shortLabel: '$', decimals: 2, asciiLabel: 'USD', symbolPosition: 'after' },
  { code: 'UYU', name: 'Уругвайское песо', symbol: '$U', shortLabel: 'UYU', decimals: 2, asciiLabel: 'UYU', symbolPosition: 'after' },
  { code: 'UZS', name: 'Узбекский сум', symbol: 'сўм', shortLabel: 'UZS', decimals: 2, asciiLabel: 'UZS', symbolPosition: 'after' },
  { code: 'VES', name: 'Венесуэльский боливар', symbol: 'Bs.S', shortLabel: 'VES', decimals: 2, asciiLabel: 'VES', symbolPosition: 'after' },
  { code: 'VND', name: 'Вьетнамский донг', symbol: '₫', shortLabel: 'VND', decimals: 0, asciiLabel: 'VND', symbolPosition: 'after' },
  { code: 'VUV', name: 'Вату Вануату', symbol: 'VT', shortLabel: 'VUV', decimals: 0, asciiLabel: 'VUV', symbolPosition: 'after' },
  { code: 'WST', name: 'Самоанская тала', symbol: 'WS$', shortLabel: 'WST', decimals: 2, asciiLabel: 'WST', symbolPosition: 'after' },
  { code: 'XAF', name: 'Франк КФА BEAC', symbol: 'FCFA', shortLabel: 'XAF', decimals: 0, asciiLabel: 'XAF', symbolPosition: 'after' },
  { code: 'XCD', name: 'Восточно-карибский доллар', symbol: 'EC$', shortLabel: 'XCD', decimals: 2, asciiLabel: 'XCD', symbolPosition: 'after' },
  { code: 'XOF', name: 'Франк КФА BCEAO', symbol: 'CFA', shortLabel: 'XOF', decimals: 0, asciiLabel: 'XOF', symbolPosition: 'after' },
  { code: 'XPF', name: 'Французский тихоокеанский франк', symbol: '₣', shortLabel: 'XPF', decimals: 0, asciiLabel: 'XPF', symbolPosition: 'after' },
  { code: 'YER', name: 'Йеменский риал', symbol: 'YR', shortLabel: 'YER', decimals: 2, asciiLabel: 'YER', symbolPosition: 'after' },
  { code: 'ZAR', name: 'Южноафриканский ранд', symbol: 'R', shortLabel: 'ZAR', decimals: 2, asciiLabel: 'ZAR', symbolPosition: 'after' },
  { code: 'ZMW', name: 'Замбийская квача', symbol: 'ZK', shortLabel: 'ZMW', decimals: 2, asciiLabel: 'ZMW', symbolPosition: 'after' },
  { code: 'ZWG', name: 'Зимбабвийский золотой', symbol: 'ZiG', shortLabel: 'ZWG', decimals: 2, asciiLabel: 'ZWG', symbolPosition: 'after' },
];

const CURRENCIES_BY_CODE: Record<string, Currency> = (() => {
  const map: Record<string, Currency> = {};
  for (const c of CURRENCIES) map[c.code] = c;
  return map;
})();

export const getCurrency = (code: string | null | undefined): Currency => {
  if (code && CURRENCIES_BY_CODE[code]) return CURRENCIES_BY_CODE[code];
  return CURRENCIES_BY_CODE[DEFAULT_CURRENCY_CODE];
};

export const isValidCurrencyCode = (code: string | null | undefined): boolean => {
  return !!(code && CURRENCIES_BY_CODE[code]);
};
