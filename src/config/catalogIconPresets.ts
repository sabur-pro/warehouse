// src/config/catalogIconPresets.ts
// Каталог иконок для пресетов в редакторе каталогов.
// Формат значения: "<lib>:<name>" (см. CatalogIcon.tsx).

export interface CatalogIconPreset {
  value: string;
  label: string;
}

export interface CatalogIconCategory {
  id: string;
  label: string;
  icons: CatalogIconPreset[];
}

export const CATALOG_ICON_CATEGORIES: CatalogIconCategory[] = [
  {
    id: 'general',
    label: 'Общие',
    icons: [
      { value: 'mci:package-variant-closed', label: 'Коробка' },
      { value: 'mci:archive', label: 'Архив' },
      { value: 'mci:cart-outline', label: 'Корзина' },
      { value: 'mci:tag-outline', label: 'Бирка' },
      { value: 'mci:barcode', label: 'Штрих-код' },
      { value: 'mci:store-outline', label: 'Магазин' },
      { value: 'mci:warehouse', label: 'Склад' },
      { value: 'mci:shape-outline', label: 'Категория' },
    ],
  },
  {
    id: 'fashion',
    label: 'Одежда и обувь',
    icons: [
      { value: 'mci:shoe-sneaker', label: 'Кроссовки' },
      { value: 'mci:shoe-formal', label: 'Туфли' },
      { value: 'mci:shoe-heel', label: 'Каблук' },
      { value: 'mci:tshirt-crew-outline', label: 'Футболка' },
      { value: 'mci:tshirt-v-outline', label: 'Майка' },
      { value: 'mci:hanger', label: 'Вешалка' },
      { value: 'mci:hat-fedora', label: 'Шляпа' },
      { value: 'mci:bag-personal-outline', label: 'Сумка' },
      { value: 'mci:wallet-outline', label: 'Кошелёк' },
      { value: 'mci:watch', label: 'Часы' },
      { value: 'mci:glasses', label: 'Очки' },
      { value: 'mci:diamond-stone', label: 'Украшения' },
    ],
  },
  {
    id: 'food',
    label: 'Продукты',
    icons: [
      { value: 'mci:food-apple', label: 'Фрукты' },
      { value: 'mci:carrot', label: 'Овощи' },
      { value: 'mci:leaf', label: 'Зелень' },
      { value: 'mci:bread-slice-outline', label: 'Хлеб' },
      { value: 'mci:baguette', label: 'Багет' },
      { value: 'mci:cup-water', label: 'Напитки' },
      { value: 'mci:bottle-soda-classic-outline', label: 'Бутылка' },
      { value: 'mci:cheese', label: 'Сыр' },
      { value: 'mci:food-drumstick-outline', label: 'Мясо' },
      { value: 'mci:fish', label: 'Рыба' },
      { value: 'mci:rice', label: 'Крупы' },
      { value: 'mci:candy-outline', label: 'Сладости' },
      { value: 'mci:coffee-outline', label: 'Кофе' },
      { value: 'mci:tea-outline', label: 'Чай' },
    ],
  },
  {
    id: 'home',
    label: 'Дом и быт',
    icons: [
      { value: 'mci:sofa-outline', label: 'Мебель' },
      { value: 'mci:lamp', label: 'Свет' },
      { value: 'mci:silverware-fork-knife', label: 'Посуда' },
      { value: 'mci:pot-mix-outline', label: 'Кухня' },
      { value: 'mci:broom', label: 'Уборка' },
      { value: 'mci:bottle-tonic', label: 'Бытхимия' },
      { value: 'mci:flower-tulip-outline', label: 'Цветы' },
      { value: 'mci:tools', label: 'Инструменты' },
      { value: 'mci:hammer-screwdriver', label: 'Стройматериалы' },
    ],
  },
  {
    id: 'tech',
    label: 'Электроника',
    icons: [
      { value: 'mci:cellphone', label: 'Телефон' },
      { value: 'mci:laptop', label: 'Ноутбук' },
      { value: 'mci:headphones', label: 'Наушники' },
      { value: 'mci:camera-outline', label: 'Камера' },
      { value: 'mci:television', label: 'ТВ' },
      { value: 'mci:gamepad-variant-outline', label: 'Игры' },
      { value: 'mci:battery', label: 'Батарея' },
      { value: 'mci:cable-data', label: 'Кабели' },
    ],
  },
  {
    id: 'beauty',
    label: 'Красота и здоровье',
    icons: [
      { value: 'mci:lipstick', label: 'Помада' },
      { value: 'mci:spray', label: 'Парфюм' },
      { value: 'mci:lotion-outline', label: 'Крем' },
      { value: 'mci:medical-bag', label: 'Аптека' },
      { value: 'mci:pill', label: 'Таблетки' },
      { value: 'mci:bandage', label: 'Перевязка' },
      { value: 'mci:hair-dryer-outline', label: 'Уход' },
    ],
  },
  {
    id: 'kids',
    label: 'Дети и зоо',
    icons: [
      { value: 'mci:teddy-bear', label: 'Игрушки' },
      { value: 'mci:baby-carriage', label: 'Коляска' },
      { value: 'mci:baby-bottle-outline', label: 'Детское' },
      { value: 'mci:school', label: 'Канцтовары' },
      { value: 'mci:book-open-page-variant-outline', label: 'Книги' },
      { value: 'mci:dog', label: 'Собаки' },
      { value: 'mci:cat', label: 'Кошки' },
      { value: 'mci:fishbowl-outline', label: 'Аквариум' },
    ],
  },
  {
    id: 'auto-sport',
    label: 'Авто и спорт',
    icons: [
      { value: 'mci:car-outline', label: 'Авто' },
      { value: 'mci:car-cog', label: 'Запчасти' },
      { value: 'mci:tire', label: 'Шины' },
      { value: 'mci:motorbike', label: 'Мото' },
      { value: 'mci:bike', label: 'Велосипед' },
      { value: 'mci:soccer', label: 'Спорт' },
      { value: 'mci:dumbbell', label: 'Фитнес' },
      { value: 'mci:tennis', label: 'Теннис' },
    ],
  },
];

export const ALL_ICON_PRESETS: CatalogIconPreset[] = CATALOG_ICON_CATEGORIES.flatMap((c) => c.icons);

export const findIconPreset = (value?: string | null): CatalogIconPreset | undefined =>
  value ? ALL_ICON_PRESETS.find((p) => p.value === value) : undefined;
