// database/types.ts
// ItemType — это имя пользовательского каталога (раньше было 'обувь' | 'одежда').
export type ItemType = string;

export type QRCodeType = 'none' | 'per_box' | 'per_item';

// Единица, к которой привязана цена товара.
//   pair    — за штуку/единицу (классический режим для одежды/обуви/штучных товаров)
//   box     — цена задана за коробку, делится на штуки внутри
//   kg      — цена за килограмм; quantity трактуется как вес в кг (дробный)
//   100g    — цена за 100 граммов; quantity трактуется как вес в кг (дробный)
//   piece   — за штуку для весовых каталогов (пучок, штука и т.п. наряду с весом)
export type PriceUnit = 'pair' | 'box' | 'kg' | '100g' | 'piece';
export const WEIGHT_PRICE_UNITS: PriceUnit[] = ['kg', '100g'];
export const isWeightPriceUnit = (u?: PriceUnit | string | null): u is 'kg' | '100g' =>
  u === 'kg' || u === '100g';

export interface CatalogSizeType {
  id: string;
  name: string;
  sizes: (number | string)[];
}

export interface Catalog {
  id: number;
  serverId?: number | null;
  uuid: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  sortOrder: number;
  isEnabled: boolean;
  sizeTypes: CatalogSizeType[];
  version?: number;
  isDeleted?: boolean;
  needsSync?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface QRCodeData {
  type: QRCodeType;
  codes: string;
}

export interface Item {
  id: number;
  serverId?: number | null; // ID на сервере для синхронизации
  name: string;
  code: string;
  warehouse: string;
  numberOfBoxes: number;
  boxSizeQuantities: string;
  sizeType: string;
  itemType: ItemType;
  row: string | null;
  position: string | null;
  side: string | null;
  imageUri: string | null;
  serverImageUrl?: string | null; // URL изображения на сервере
  createdAt: number;
  totalQuantity: number;
  totalValue: number;
  qrCodeType: QRCodeType;
  qrCodes: string | null;
  priceUnit?: PriceUnit; // единица цены; 'pair' по умолчанию (legacy)
  uuid?: string;
}

export interface Transaction {
  id: number;
  serverId?: number | null; // ID на сервере для синхронизации
  uuid?: string;
  action: 'create' | 'update' | 'delete' | 'sale' | 'wholesale' | 'receipt';
  itemId?: number;
  itemName: string;
  itemImageUri?: string | null; // картинка товара для офлайн отображения
  timestamp: number;
  details?: string | null;
  itemUuid?: string;
  // Валюта (ISO 4217) на момент совершения операции. Опционально для старых
  // записей: если null/undefined — UI трактует как «текущая валюта аккаунта».
  currency?: string | null;
}

export interface SizeRange {
  type: string;
  sizes: (number | string)[];
}

export interface SizeQuantity {
  size: number | string; // поддержка как численных, так и строковых размеров
  quantity: number;
  price: number;
  recommendedSellingPrice?: number; // рекомендуемая стоимость продажи за пару/единицу
}

export type AttributeType = 'text' | 'color' | 'select';

export interface ItemAttribute {
  id: number;
  serverId?: number | null;
  uuid: string;
  itemUuid: string;
  name: string;
  value: string;
  attrType: AttributeType;
  unit?: string | null;
  sortOrder: number;
  version?: number;
  isDeleted?: boolean;
  needsSync?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Client {
  id: number;
  serverId?: number | null;
  uuid?: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  birthday?: string | null;
  isDeleted?: number;
  needsSync?: number;
  createdAt?: number;
  updatedAt?: number;
}

// ============================================
// ПОСТАВЩИКИ И ПРИХОД
// ============================================

export interface Supplier {
  id: number;
  serverId?: number | null;
  uuid?: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  isDeleted?: number;
  needsSync?: number;
  createdAt?: number;
  updatedAt?: number;
}

// Одна позиция в накладной прихода. Хранится в Supply.lines как JSON.
export interface SupplyLine {
  itemUuid: string;       // привязка к товару
  itemName: string;       // снапшот имени для офлайн-отображения
  itemImageUri?: string | null;
  quantity: number;       // сколько единиц пришло (например, пар обуви)
  unitPrice: number;      // цена за единицу от поставщика
  // Опциональные поля — куда именно положить (если знаем):
  boxIndex?: number;      // индекс коробки в товаре
  size?: number | string; // размер
  sizeType?: string;      // имя размерного ряда
}

export interface Supply {
  id: number;
  serverId?: number | null;
  uuid?: string;
  supplierServerId?: number | null;
  supplierUuid?: string | null;
  lines: string;           // JSON SupplyLine[]
  totalAmount: number;
  paidAmount: number;
  note?: string | null;
  date: number;            // ms timestamp когда совершён приход
  isDeleted?: number;
  needsSync?: number;
  createdAt?: number;
  updatedAt?: number;
}

export interface PaymentAllocation {
  supplyUuid: string;
  amount: number;
}

export interface SupplierPayment {
  id: number;
  serverId?: number | null;
  uuid?: string;
  supplierServerId?: number | null;
  supplierUuid?: string | null;
  supplyUuid?: string | null;  // legacy: если оплата за конкретный приход
  // FIFO-разнос: JSON-массив [{supplyUuid, amount}].
  // Если total оплаты > общего долга — остаток не разносится (поставщик становится должен нам).
  allocations?: string;
  amount: number;
  note?: string | null;
  date: number;
  isDeleted?: number;
  needsSync?: number;
  createdAt?: number;
  updatedAt?: number;
}