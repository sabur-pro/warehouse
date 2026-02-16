// database/types.ts
export type ItemType = 'обувь' | 'одежда';

export type QRCodeType = 'none' | 'per_box' | 'per_item';

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
  uuid?: string;
}

export interface Transaction {
  id: number;
  serverId?: number | null; // ID на сервере для синхронизации
  uuid?: string;
  action: 'create' | 'update' | 'delete' | 'sale' | 'wholesale';
  itemId?: number;
  itemName: string;
  itemImageUri?: string | null; // картинка товара для офлайн отображения
  timestamp: number;
  details?: string | null;
  itemUuid?: string;
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