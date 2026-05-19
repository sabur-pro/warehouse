// src/config/catalogTemplates.ts
// Шаблоны под сферу бизнеса. Применяются из экрана настроек каталогов.
// Иконки задаются в формате "<lib>:<name>" (см. CatalogIcon.tsx).

export interface CatalogTemplateSizeType {
  name: string;
  sizes: (string | number)[];
}

export interface CatalogTemplateAttribute {
  name: string;
  type?: 'text' | 'color' | 'select';
  options?: string[]; // для select
  unit?: string; // для text (например, "г", "мл")
  required?: boolean;
}

export interface CatalogTemplateCatalog {
  name: string;
  icon?: string;
  color?: string;
  sizeTypes: CatalogTemplateSizeType[];
  /** Рекомендованный набор атрибутов для товаров этого каталога */
  suggestedAttributes?: CatalogTemplateAttribute[];
  /**
   * Каталог продаёт товары на вес. В форме добавления товара по умолчанию
   * включается режим цены "На вес" (priceUnit='kg'), а при продаже
   * пользователь вводит вес дробным числом (например 0.85 кг).
   */
  byWeight?: boolean;
}

export interface CatalogTemplate {
  id: string;
  name: string;
  description?: string;
  /** Категория шаблона — для группировки в UI */
  group?: 'fashion' | 'food' | 'tech' | 'home' | 'beauty' | 'kids' | 'auto-sport' | 'service';
  catalogs: CatalogTemplateCatalog[];
}

const RANGE_30_36 = [30, 31, 32, 33, 34, 35, 36];
const RANGE_36_41 = [36, 37, 38, 39, 40, 41];
const RANGE_39_44 = [39, 40, 41, 42, 43, 44];
const RANGE_44_48 = [44, 45, 46, 47, 48];
const RANGE_36_45 = [36, 37, 38, 39, 40, 41, 42, 43, 44, 45];
const INTL_CLOTHING = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'];
const PANTS = ['44 (XS)', '46 (S)', '48 (M)', '50 (L)', '52 (XL)', '54 (2XL)', '56 (3XL)', '58 (4XL)', '60 (5XL)'];

export const CLASSIC_TEMPLATE_ID = 'classic';

const COLOR_PALETTE = [
  'чёрный', 'белый', 'серый', 'красный', 'синий', 'зелёный',
  'жёлтый', 'оранжевый', 'розовый', 'фиолетовый', 'коричневый', 'бежевый',
];

export const CATALOG_TEMPLATES: CatalogTemplate[] = [
  // ──────────────────────────────── FASHION ────────────────────────────────
  {
    id: CLASSIC_TEMPLATE_ID,
    name: 'Обувь и одежда',
    description: 'Классические каталоги — то же что было по умолчанию',
    group: 'fashion',
    catalogs: [
      {
        name: 'обувь',
        icon: 'mci:shoe-sneaker',
        sizeTypes: [
          { name: 'детский', sizes: RANGE_30_36 },
          { name: 'подростковый', sizes: RANGE_36_41 },
          { name: 'мужской', sizes: RANGE_39_44 },
          { name: 'великан', sizes: RANGE_44_48 },
          { name: 'общий', sizes: RANGE_36_45 },
        ],
        suggestedAttributes: [
          { name: 'Цвет', type: 'color', options: COLOR_PALETTE },
          { name: 'Материал', type: 'select', options: ['кожа', 'эко-кожа', 'замша', 'текстиль', 'резина'] },
          { name: 'Сезон', type: 'select', options: ['зима', 'демисезон', 'лето'] },
          { name: 'Пол', type: 'select', options: ['мужской', 'женский', 'унисекс', 'детский'] },
          { name: 'Бренд', type: 'text' },
        ],
      },
      {
        name: 'одежда',
        icon: 'mci:tshirt-crew-outline',
        sizeTypes: [
          { name: 'международный', sizes: INTL_CLOTHING },
          { name: 'брюки', sizes: PANTS },
        ],
        suggestedAttributes: [
          { name: 'Цвет', type: 'color', options: COLOR_PALETTE },
          { name: 'Материал', type: 'select', options: ['хлопок', 'лён', 'шерсть', 'синтетика', 'кашемир', 'шёлк'] },
          { name: 'Сезон', type: 'select', options: ['зима', 'демисезон', 'лето'] },
          { name: 'Пол', type: 'select', options: ['мужской', 'женский', 'унисекс', 'детский'] },
          { name: 'Бренд', type: 'text' },
        ],
      },
    ],
  },
  {
    id: 'kids-clothing',
    name: 'Детская одежда',
    description: 'Боди, ползунки, пижамы по росту/возрасту',
    group: 'fashion',
    catalogs: [
      {
        name: 'Детская одежда',
        icon: 'mci:human-baby-changing-table',
        sizeTypes: [
          { name: 'возраст', sizes: ['0-3 мес', '3-6 мес', '6-9 мес', '9-12 мес', '1-2 года', '2-3 года', '3-4 года', '4-5 лет', '5-6 лет'] },
          { name: 'рост', sizes: [56, 62, 68, 74, 80, 86, 92, 98, 104, 110, 116, 122, 128] },
        ],
        suggestedAttributes: [
          { name: 'Цвет', type: 'color', options: COLOR_PALETTE },
          { name: 'Пол', type: 'select', options: ['мальчик', 'девочка', 'унисекс'] },
          { name: 'Материал', type: 'select', options: ['хлопок', 'байка', 'фланель', 'трикотаж'] },
          { name: 'Бренд', type: 'text' },
        ],
      },
    ],
  },
  // ──────────────────────────────── FOOD ────────────────────────────────
  {
    id: 'grocery',
    name: 'Продуктовый магазин',
    description: 'Молочка, хлеб, бакалея с типовыми фасовками',
    group: 'food',
    catalogs: [
      {
        name: 'Молочка',
        icon: 'mci:cup-water',
        sizeTypes: [{ name: 'фасовка', sizes: ['1л', '0.5л', '200мл', 'шт'] }],
        suggestedAttributes: [
          { name: 'Жирность', type: 'select', options: ['обезж.', '1.5%', '2.5%', '3.2%', '5%', '15%', '20%'] },
          { name: 'Бренд', type: 'text' },
          { name: 'Срок годности', type: 'text' },
        ],
      },
      {
        name: 'Хлеб',
        icon: 'mci:bread-slice-outline',
        sizeTypes: [{ name: 'штучно', sizes: ['булка', 'половинка', 'батон'] }],
        suggestedAttributes: [
          { name: 'Тип', type: 'select', options: ['белый', 'ржаной', 'отрубной', 'бездрожжевой'] },
          { name: 'Производитель', type: 'text' },
        ],
      },
      {
        name: 'Бакалея',
        icon: 'mci:rice',
        sizeTypes: [{ name: 'вес', sizes: ['1кг', '500г', '250г', '100г'] }],
        byWeight: true,
        suggestedAttributes: [
          { name: 'Бренд', type: 'text' },
          { name: 'Страна', type: 'text' },
        ],
      },
    ],
  },
  {
    id: 'by-weight',
    name: 'На вес',
    description: 'Универсальные весовые товары (крупа, специи, орехи и т.п.)',
    group: 'food',
    catalogs: [
      {
        name: 'На вес',
        icon: 'mci:scale',
        sizeTypes: [{ name: 'единица', sizes: ['—'] }],
        byWeight: true,
        suggestedAttributes: [
          { name: 'Бренд', type: 'text' },
          { name: 'Страна', type: 'text' },
        ],
      },
    ],
  },
  {
    id: 'vegetables',
    name: 'Овощной прилавок',
    description: 'Овощи и фрукты с фасовкой по весу',
    group: 'food',
    catalogs: [
      {
        name: 'Овощи',
        icon: 'mci:carrot',
        sizeTypes: [{ name: 'вес', sizes: ['1кг', '500г', '250г', 'штука'] }],
        byWeight: true,
        suggestedAttributes: [
          { name: 'Сорт', type: 'text' },
          { name: 'Страна', type: 'text' },
          { name: 'Категория', type: 'select', options: ['1 сорт', '2 сорт', 'элитный'] },
        ],
      },
      {
        name: 'Фрукты',
        icon: 'mci:food-apple',
        sizeTypes: [{ name: 'вес', sizes: ['1кг', '500г', '250г', 'штука'] }],
        byWeight: true,
        suggestedAttributes: [
          { name: 'Сорт', type: 'text' },
          { name: 'Страна', type: 'text' },
        ],
      },
      {
        name: 'Зелень',
        icon: 'mci:leaf',
        sizeTypes: [{ name: 'упаковка', sizes: ['пучок', '100г', '250г'] }],
        byWeight: true,
        suggestedAttributes: [{ name: 'Сорт', type: 'text' }],
      },
    ],
  },
  {
    id: 'cafe',
    name: 'Кафе / закусочная',
    description: 'Меню с напитками, выпечкой, готовыми блюдами',
    group: 'food',
    catalogs: [
      {
        name: 'Напитки',
        icon: 'mci:coffee-outline',
        sizeTypes: [{ name: 'объём', sizes: ['200мл', '300мл', '400мл', '500мл'] }],
        suggestedAttributes: [
          { name: 'Тип', type: 'select', options: ['кофе', 'чай', 'сок', 'газировка', 'коктейль'] },
          { name: 'Тёплый/холодный', type: 'select', options: ['тёплый', 'холодный'] },
        ],
      },
      {
        name: 'Выпечка',
        icon: 'mci:baguette',
        sizeTypes: [{ name: 'штучно', sizes: ['—'] }],
        suggestedAttributes: [
          { name: 'Начинка', type: 'text' },
          { name: 'Грамовка', type: 'text', unit: 'г' },
        ],
      },
      {
        name: 'Готовые блюда',
        icon: 'mci:silverware-fork-knife',
        sizeTypes: [{ name: 'порция', sizes: ['маленькая', 'средняя', 'большая'] }],
        suggestedAttributes: [
          { name: 'Категория', type: 'select', options: ['первое', 'второе', 'салат', 'десерт'] },
        ],
      },
    ],
  },
  // ──────────────────────────────── ACCESSORIES / FASHION ─────────────────
  {
    id: 'accessories',
    name: 'Аксессуары',
    description: 'Сумки, ремни, часы — с/без размеров',
    group: 'fashion',
    catalogs: [
      {
        name: 'Сумки',
        icon: 'mci:bag-personal-outline',
        sizeTypes: [{ name: 'без размера', sizes: ['—'] }],
        suggestedAttributes: [
          { name: 'Цвет', type: 'color', options: COLOR_PALETTE },
          { name: 'Материал', type: 'select', options: ['кожа', 'эко-кожа', 'текстиль', 'нейлон'] },
          { name: 'Бренд', type: 'text' },
        ],
      },
      {
        name: 'Ремни',
        icon: 'mci:belt',
        sizeTypes: [{ name: 'длина', sizes: [80, 90, 100, 110, 120, 130] }],
        suggestedAttributes: [
          { name: 'Цвет', type: 'color', options: COLOR_PALETTE },
          { name: 'Материал', type: 'select', options: ['кожа', 'текстиль'] },
        ],
      },
      {
        name: 'Часы',
        icon: 'mci:watch',
        sizeTypes: [{ name: 'без размера', sizes: ['—'] }],
        suggestedAttributes: [
          { name: 'Тип', type: 'select', options: ['наручные', 'умные', 'настенные'] },
          { name: 'Бренд', type: 'text' },
        ],
      },
      {
        name: 'Очки',
        icon: 'mci:glasses',
        sizeTypes: [{ name: 'без размера', sizes: ['—'] }],
        suggestedAttributes: [
          { name: 'Тип', type: 'select', options: ['солнцезащитные', 'оптика'] },
          { name: 'Бренд', type: 'text' },
        ],
      },
    ],
  },
  // ──────────────────────────────── TECH ────────────────────────────────
  {
    id: 'electronics',
    name: 'Электроника',
    description: 'Смартфоны, ноутбуки, аксессуары',
    group: 'tech',
    catalogs: [
      {
        name: 'Смартфоны',
        icon: 'mci:cellphone',
        sizeTypes: [{ name: 'память', sizes: ['64ГБ', '128ГБ', '256ГБ', '512ГБ', '1ТБ'] }],
        suggestedAttributes: [
          { name: 'Цвет', type: 'color', options: COLOR_PALETTE },
          { name: 'Бренд', type: 'text' },
          { name: 'RAM', type: 'select', options: ['4ГБ', '6ГБ', '8ГБ', '12ГБ', '16ГБ'] },
          { name: 'Состояние', type: 'select', options: ['новый', 'витрина', 'б/у'] },
          { name: 'IMEI', type: 'text' },
        ],
      },
      {
        name: 'Ноутбуки',
        icon: 'mci:laptop',
        sizeTypes: [{ name: 'диагональ', sizes: ['13"', '14"', '15.6"', '16"', '17"'] }],
        suggestedAttributes: [
          { name: 'Цвет', type: 'color', options: COLOR_PALETTE },
          { name: 'Бренд', type: 'text' },
          { name: 'Процессор', type: 'text' },
          { name: 'RAM', type: 'select', options: ['8ГБ', '16ГБ', '32ГБ', '64ГБ'] },
          { name: 'SSD', type: 'select', options: ['256ГБ', '512ГБ', '1ТБ', '2ТБ'] },
        ],
      },
      {
        name: 'Аксессуары',
        icon: 'mci:headphones',
        sizeTypes: [{ name: 'без размера', sizes: ['—'] }],
        suggestedAttributes: [
          { name: 'Тип', type: 'select', options: ['наушники', 'кабель', 'зарядка', 'чехол', 'плёнка'] },
          { name: 'Бренд', type: 'text' },
        ],
      },
    ],
  },
  // ──────────────────────────────── BEAUTY / PHARMACY ─────────────────────
  {
    id: 'pharmacy',
    name: 'Аптека',
    description: 'Лекарства, БАДы, перевязка',
    group: 'beauty',
    catalogs: [
      {
        name: 'Лекарства',
        icon: 'mci:pill',
        sizeTypes: [{ name: 'упаковка', sizes: ['10 шт', '20 шт', '30 шт', '50 шт', '100 шт'] }],
        suggestedAttributes: [
          { name: 'Производитель', type: 'text' },
          { name: 'Дозировка', type: 'text' },
          { name: 'Срок годности', type: 'text' },
          { name: 'Рецептурный', type: 'select', options: ['без рецепта', 'по рецепту'] },
        ],
      },
      {
        name: 'БАДы и витамины',
        icon: 'mci:medical-bag',
        sizeTypes: [{ name: 'упаковка', sizes: ['30 шт', '60 шт', '90 шт', '120 шт'] }],
        suggestedAttributes: [
          { name: 'Бренд', type: 'text' },
          { name: 'Страна', type: 'text' },
        ],
      },
      {
        name: 'Перевязочные',
        icon: 'mci:bandage',
        sizeTypes: [{ name: 'без размера', sizes: ['—'] }],
        suggestedAttributes: [{ name: 'Производитель', type: 'text' }],
      },
    ],
  },
  {
    id: 'beauty',
    name: 'Косметика и парфюмерия',
    description: 'Уход, декор, парфюм',
    group: 'beauty',
    catalogs: [
      {
        name: 'Парфюм',
        icon: 'mci:spray',
        sizeTypes: [{ name: 'объём', sizes: ['30мл', '50мл', '75мл', '100мл'] }],
        suggestedAttributes: [
          { name: 'Бренд', type: 'text' },
          { name: 'Пол', type: 'select', options: ['мужской', 'женский', 'унисекс'] },
          { name: 'Тип', type: 'select', options: ['EDP', 'EDT', 'парфюм'] },
        ],
      },
      {
        name: 'Декоративная косметика',
        icon: 'mci:lipstick',
        sizeTypes: [{ name: 'без размера', sizes: ['—'] }],
        suggestedAttributes: [
          { name: 'Цвет', type: 'color', options: COLOR_PALETTE },
          { name: 'Бренд', type: 'text' },
          { name: 'Тип', type: 'select', options: ['помада', 'тушь', 'тональный', 'тени', 'румяна'] },
        ],
      },
      {
        name: 'Уход',
        icon: 'mci:lotion-outline',
        sizeTypes: [{ name: 'объём', sizes: ['50мл', '100мл', '200мл', '250мл', '500мл'] }],
        suggestedAttributes: [
          { name: 'Бренд', type: 'text' },
          { name: 'Тип', type: 'select', options: ['крем', 'сыворотка', 'тоник', 'шампунь', 'бальзам'] },
          { name: 'Тип кожи', type: 'select', options: ['сухая', 'нормальная', 'жирная', 'комбинированная'] },
        ],
      },
    ],
  },
  // ──────────────────────────────── HOME ─────────────────────────────────
  {
    id: 'household',
    name: 'Бытовая химия',
    description: 'Чистящие, стиральные, средства гигиены',
    group: 'home',
    catalogs: [
      {
        name: 'Чистящие средства',
        icon: 'mci:bottle-tonic',
        sizeTypes: [{ name: 'объём', sizes: ['250мл', '500мл', '750мл', '1л', '5л'] }],
        suggestedAttributes: [
          { name: 'Бренд', type: 'text' },
          { name: 'Назначение', type: 'select', options: ['универсальное', 'для кухни', 'для сантехники', 'для пола', 'для стекла'] },
        ],
      },
      {
        name: 'Стиральные средства',
        icon: 'mci:washing-machine',
        sizeTypes: [{ name: 'фасовка', sizes: ['1кг', '3кг', '6кг', '9кг'] }],
        suggestedAttributes: [
          { name: 'Бренд', type: 'text' },
          { name: 'Тип', type: 'select', options: ['порошок', 'гель', 'капсулы'] },
        ],
      },
    ],
  },
  {
    id: 'building',
    name: 'Стройматериалы',
    description: 'Краски, метизы, инструменты',
    group: 'home',
    catalogs: [
      {
        name: 'Краски и эмали',
        icon: 'mci:format-color-fill',
        sizeTypes: [{ name: 'фасовка', sizes: ['1л', '2.5л', '5л', '10л'] }],
        suggestedAttributes: [
          { name: 'Цвет', type: 'color', options: COLOR_PALETTE },
          { name: 'Тип', type: 'select', options: ['акрил', 'масло', 'эмаль', 'грунт'] },
          { name: 'Бренд', type: 'text' },
        ],
      },
      {
        name: 'Метизы',
        icon: 'mci:screw-machine-flat-top',
        sizeTypes: [{ name: 'размер', sizes: ['М4', 'М5', 'М6', 'М8', 'М10', 'М12'] }],
        suggestedAttributes: [
          { name: 'Длина', type: 'text', unit: 'мм' },
          { name: 'Материал', type: 'select', options: ['оцинкованный', 'нержавеющий', 'чёрный'] },
        ],
      },
      {
        name: 'Инструменты',
        icon: 'mci:tools',
        sizeTypes: [{ name: 'без размера', sizes: ['—'] }],
        suggestedAttributes: [
          { name: 'Бренд', type: 'text' },
          { name: 'Тип', type: 'select', options: ['ручной', 'электрический', 'аккумуляторный'] },
        ],
      },
    ],
  },
  // ──────────────────────────────── KIDS / OFFICE / BOOKS ─────────────────
  {
    id: 'stationery',
    name: 'Канцтовары и книги',
    description: 'Тетради, ручки, учебники',
    group: 'kids',
    catalogs: [
      {
        name: 'Канцтовары',
        icon: 'mci:school',
        sizeTypes: [{ name: 'формат', sizes: ['А3', 'А4', 'А5', 'А6'] }],
        suggestedAttributes: [
          { name: 'Тип', type: 'select', options: ['тетрадь', 'блокнот', 'ручка', 'карандаш', 'маркер', 'папка'] },
          { name: 'Цвет', type: 'color', options: COLOR_PALETTE },
        ],
      },
      {
        name: 'Книги',
        icon: 'mci:book-open-page-variant-outline',
        sizeTypes: [{ name: 'без размера', sizes: ['—'] }],
        suggestedAttributes: [
          { name: 'Автор', type: 'text' },
          { name: 'Жанр', type: 'select', options: ['художественная', 'учебная', 'детская', 'нон-фикшн'] },
          { name: 'Язык', type: 'select', options: ['русский', 'английский', 'другой'] },
          { name: 'Издательство', type: 'text' },
        ],
      },
    ],
  },
  {
    id: 'toys',
    name: 'Детские игрушки',
    description: 'Игрушки по возрасту с категориями',
    group: 'kids',
    catalogs: [
      {
        name: 'Игрушки',
        icon: 'mci:teddy-bear',
        sizeTypes: [
          { name: 'возраст', sizes: ['0-1', '1-3', '3-5', '5-7', '7-12', '12+'] },
        ],
        suggestedAttributes: [
          { name: 'Тип', type: 'select', options: ['мягкая', 'конструктор', 'настольная', 'радиоуправляемая', 'развивающая'] },
          { name: 'Пол', type: 'select', options: ['мальчик', 'девочка', 'унисекс'] },
          { name: 'Бренд', type: 'text' },
        ],
      },
    ],
  },
  // ──────────────────────────────── PETS ─────────────────────────────────
  {
    id: 'pets',
    name: 'Зоотовары',
    description: 'Корма, аксессуары, наполнители',
    group: 'kids',
    catalogs: [
      {
        name: 'Корма',
        icon: 'mci:food-variant',
        sizeTypes: [{ name: 'фасовка', sizes: ['85г', '400г', '1кг', '2кг', '5кг', '10кг'] }],
        byWeight: true,
        suggestedAttributes: [
          { name: 'Животное', type: 'select', options: ['собака', 'кошка', 'птица', 'рыба', 'грызун'] },
          { name: 'Возраст', type: 'select', options: ['щенок/котёнок', 'взрослый', 'старше 7 лет'] },
          { name: 'Бренд', type: 'text' },
        ],
      },
      {
        name: 'Аксессуары для животных',
        icon: 'mci:dog',
        sizeTypes: [{ name: 'размер', sizes: ['XS', 'S', 'M', 'L', 'XL'] }],
        suggestedAttributes: [
          { name: 'Тип', type: 'select', options: ['ошейник', 'поводок', 'лежак', 'миска', 'игрушка'] },
          { name: 'Цвет', type: 'color', options: COLOR_PALETTE },
        ],
      },
    ],
  },
  // ──────────────────────────────── AUTO / SPORT ──────────────────────────
  {
    id: 'auto',
    name: 'Автозапчасти',
    description: 'Шины, масла, расходники',
    group: 'auto-sport',
    catalogs: [
      {
        name: 'Шины',
        icon: 'mci:tire',
        sizeTypes: [{ name: 'радиус', sizes: ['R13', 'R14', 'R15', 'R16', 'R17', 'R18', 'R19', 'R20'] }],
        suggestedAttributes: [
          { name: 'Сезон', type: 'select', options: ['летние', 'зимние', 'всесезонные'] },
          { name: 'Бренд', type: 'text' },
          { name: 'Размер', type: 'text' }, // 205/55
        ],
      },
      {
        name: 'Масла',
        icon: 'mci:oil',
        sizeTypes: [{ name: 'объём', sizes: ['1л', '4л', '5л', '20л', '60л'] }],
        suggestedAttributes: [
          { name: 'Тип', type: 'select', options: ['моторное', 'трансмиссионное', 'тормозное'] },
          { name: 'Вязкость', type: 'select', options: ['0W-20', '0W-30', '5W-30', '5W-40', '10W-40'] },
          { name: 'Бренд', type: 'text' },
        ],
      },
      {
        name: 'Расходники',
        icon: 'mci:car-cog',
        sizeTypes: [{ name: 'без размера', sizes: ['—'] }],
        suggestedAttributes: [
          { name: 'Тип', type: 'select', options: ['фильтр', 'свеча', 'тормозные колодки', 'ремень'] },
          { name: 'Бренд', type: 'text' },
          { name: 'Артикул', type: 'text' },
        ],
      },
    ],
  },
  {
    id: 'sport',
    name: 'Спортивные товары',
    description: 'Инвентарь, одежда, аксессуары',
    group: 'auto-sport',
    catalogs: [
      {
        name: 'Спортивная одежда',
        icon: 'mci:run',
        sizeTypes: [{ name: 'международный', sizes: INTL_CLOTHING }],
        suggestedAttributes: [
          { name: 'Цвет', type: 'color', options: COLOR_PALETTE },
          { name: 'Пол', type: 'select', options: ['мужской', 'женский', 'унисекс'] },
          { name: 'Вид спорта', type: 'select', options: ['фитнес', 'бег', 'футбол', 'единоборства', 'плавание'] },
          { name: 'Бренд', type: 'text' },
        ],
      },
      {
        name: 'Инвентарь',
        icon: 'mci:dumbbell',
        sizeTypes: [{ name: 'без размера', sizes: ['—'] }],
        suggestedAttributes: [
          { name: 'Вес', type: 'text', unit: 'кг' },
          { name: 'Бренд', type: 'text' },
        ],
      },
    ],
  },
  // ──────────────────────────────── SERVICES ─────────────────────────────
  {
    id: 'flowers',
    name: 'Цветы',
    description: 'Букеты, горшечные, аксессуары',
    group: 'service',
    catalogs: [
      {
        name: 'Букеты',
        icon: 'mci:flower-tulip-outline',
        sizeTypes: [{ name: 'размер', sizes: ['маленький', 'средний', 'большой', 'премиум'] }],
        suggestedAttributes: [
          { name: 'Основной цветок', type: 'text' },
          { name: 'Цвет', type: 'color', options: COLOR_PALETTE },
        ],
      },
      {
        name: 'Горшечные',
        icon: 'mci:flower',
        sizeTypes: [{ name: 'диаметр горшка', sizes: ['10см', '15см', '20см', '25см'] }],
        suggestedAttributes: [
          { name: 'Вид', type: 'text' },
          { name: 'Освещение', type: 'select', options: ['тень', 'полутень', 'солнце'] },
        ],
      },
    ],
  },
];

export const getTemplateById = (id: string): CatalogTemplate | undefined =>
  CATALOG_TEMPLATES.find((t) => t.id === id);

export const TEMPLATE_GROUPS: { id: NonNullable<CatalogTemplate['group']>; label: string }[] = [
  { id: 'fashion', label: 'Одежда и обувь' },
  { id: 'food', label: 'Еда и продукты' },
  { id: 'tech', label: 'Электроника' },
  { id: 'beauty', label: 'Красота и здоровье' },
  { id: 'home', label: 'Дом и стройка' },
  { id: 'kids', label: 'Дети, книги, зоо' },
  { id: 'auto-sport', label: 'Авто и спорт' },
  { id: 'service', label: 'Услуги' },
];
