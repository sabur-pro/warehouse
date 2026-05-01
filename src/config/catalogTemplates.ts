// src/config/catalogTemplates.ts
// Шаблоны под сферу бизнеса. Применяются из экрана настроек каталогов.

export interface CatalogTemplateSizeType {
  name: string;
  sizes: (string | number)[];
}

export interface CatalogTemplateCatalog {
  name: string;
  icon?: string;
  color?: string;
  sizeTypes: CatalogTemplateSizeType[];
}

export interface CatalogTemplate {
  id: string;
  name: string;
  description?: string;
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

export const CATALOG_TEMPLATES: CatalogTemplate[] = [
  {
    id: CLASSIC_TEMPLATE_ID,
    name: 'Обувь и одежда',
    description: 'Классические каталоги — то же что было по умолчанию',
    catalogs: [
      {
        name: 'обувь',
        icon: '👟',
        sizeTypes: [
          { name: 'детский', sizes: RANGE_30_36 },
          { name: 'подростковый', sizes: RANGE_36_41 },
          { name: 'мужской', sizes: RANGE_39_44 },
          { name: 'великан', sizes: RANGE_44_48 },
          { name: 'общий', sizes: RANGE_36_45 },
        ],
      },
      {
        name: 'одежда',
        icon: '👕',
        sizeTypes: [
          { name: 'международный', sizes: INTL_CLOTHING },
          { name: 'брюки', sizes: PANTS },
        ],
      },
    ],
  },
  {
    id: 'grocery',
    name: 'Продуктовый магазин',
    description: 'Молочка, хлеб, бакалея с типовыми фасовками',
    catalogs: [
      {
        name: 'Молочка',
        icon: '🥛',
        sizeTypes: [{ name: 'фасовка', sizes: ['1л', '0.5л', '200мл', 'шт'] }],
      },
      {
        name: 'Хлеб',
        icon: '🍞',
        sizeTypes: [{ name: 'штучно', sizes: ['булка', 'половинка', 'батон'] }],
      },
      {
        name: 'Бакалея',
        icon: '🌾',
        sizeTypes: [{ name: 'вес', sizes: ['1кг', '500г', '250г', '100г'] }],
      },
    ],
  },
  {
    id: 'vegetables',
    name: 'Овощной прилавок',
    description: 'Овощи и фрукты с фасовкой по весу',
    catalogs: [
      {
        name: 'Овощи',
        icon: '🥕',
        sizeTypes: [{ name: 'вес', sizes: ['1кг', '500г', '250г', 'штука'] }],
      },
      {
        name: 'Фрукты',
        icon: '🍎',
        sizeTypes: [{ name: 'вес', sizes: ['1кг', '500г', '250г', 'штука'] }],
      },
      {
        name: 'Зелень',
        icon: '🌿',
        sizeTypes: [{ name: 'упаковка', sizes: ['пучок', '100г', '250г'] }],
      },
    ],
  },
  {
    id: 'accessories',
    name: 'Аксессуары',
    description: 'Сумки, ремни, часы — с/без размеров',
    catalogs: [
      {
        name: 'Сумки',
        icon: '👜',
        sizeTypes: [{ name: 'без размера', sizes: ['—'] }],
      },
      {
        name: 'Ремни',
        icon: '🪢',
        sizeTypes: [{ name: 'длина', sizes: [80, 90, 100, 110, 120, 130] }],
      },
      {
        name: 'Часы',
        icon: '⌚',
        sizeTypes: [{ name: 'без размера', sizes: ['—'] }],
      },
      {
        name: 'Очки',
        icon: '🕶',
        sizeTypes: [{ name: 'без размера', sizes: ['—'] }],
      },
    ],
  },
];

export const getTemplateById = (id: string): CatalogTemplate | undefined =>
  CATALOG_TEMPLATES.find((t) => t.id === id);
