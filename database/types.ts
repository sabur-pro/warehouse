// database/types.ts
export type ItemType = 'обувь' | 'одежда';

export type QRCodeType = 'none' | 'per_box' | 'per_item';

export interface QRCodeData {
  type: QRCodeType;
  codes: string;
}

export interface Item {
  id: number;
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
  createdAt: number;
  totalQuantity: number;
  totalValue: number;
  qrCodeType: QRCodeType; 
  qrCodes: string | null; 
}

export interface Transaction {
  id: number;
  action: 'create' | 'update' | 'delete' | 'sale' | 'wholesale';
  itemId?: number;
  itemName: string;
  timestamp: number;
  details?: string | null;
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