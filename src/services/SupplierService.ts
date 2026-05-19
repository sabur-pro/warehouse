// src/services/SupplierService.ts
// Высокоуровневые операции над поставщиками, поставками и оплатами.
// Используется UI; локальная запись + needsSync=1, sync доставит до сервера.

import {
  addSupplier as dbAddSupplier,
  updateSupplier as dbUpdateSupplier,
  deleteSupplier as dbDeleteSupplier,
  getAllSuppliers,
  getSupplierByUuid,
  getSupplierById,
  addSupply as dbAddSupply,
  getSuppliesBySupplier,
  addSupplierPayment as dbAddPayment,
  getSupplierPaymentsBySupplier,
  applySupplyToItems,
  deleteSupply as dbDeleteSupply,
  deleteSupplierPayment as dbDeletePayment,
} from '../../database/database';
import { Supplier, Supply, SupplyLine, SupplierPayment, PaymentAllocation } from '../../database/types';

export interface CreateSupplierInput {
  name: string;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
}

export interface CreateSupplyInput {
  supplierId?: number | null;       // локальный id, если поставщик уже создан
  supplierUuid?: string | null;     // более стабильно после sync
  lines: SupplyLine[];              // позиции прихода
  paidAmount: number;               // отдано в момент прихода
  note?: string | null;
  date?: number;                    // ms; default = Date.now()
}

export interface CreatePaymentInput {
  supplierId?: number | null;
  supplierUuid?: string | null;
  supplyUuid?: string | null;
  amount: number;
  note?: string | null;
  date?: number;
}

export interface SupplyEnriched extends Supply {
  // Сколько по этой поставке уже зачтено через payments.allocations
  allocatedFromPayments: number;
  // Кто из payments в неё попал и сколько
  paymentBreakdown: { paymentId: number; paymentDate: number; amount: number; note?: string | null }[];
  // Остаток к оплате по этой поставке
  remaining: number;
}

export interface SupplierAggregate {
  supplier: Supplier;
  supplies: SupplyEnriched[];
  payments: SupplierPayment[];
  totals: {
    totalSupplied: number;        // сумма всех поставок
    totalPaidOnSupply: number;    // оплачено сразу при оформлении прихода
    totalPaidExtra: number;       // отдельные оплаты после
    totalPaid: number;            // = totalPaidOnSupply + totalPaidExtra
    debt: number;                 // > 0: мы должны поставщику; < 0: поставщик должен нам (аванс)
  };
}

export const listSuppliers = (): Promise<Supplier[]> => getAllSuppliers();

export const getSupplier = (uuid: string): Promise<Supplier | null> => getSupplierByUuid(uuid);
export const getSupplierByLocalId = (id: number): Promise<Supplier | null> => getSupplierById(id);

export const createSupplier = async (input: CreateSupplierInput): Promise<Supplier> => {
  const { id, uuid } = await dbAddSupplier({
    name: input.name.trim(),
    phone: input.phone ?? null,
    address: input.address ?? null,
    notes: input.notes ?? null,
  });
  const created = await getSupplierById(id);
  if (!created) throw new Error('Failed to load created supplier');
  return created;
};

export const updateSupplier = (id: number, patch: Partial<Supplier>) => dbUpdateSupplier(id, patch);

export const deleteSupplier = (id: number) => dbDeleteSupplier(id);

/**
 * Создать приход:
 *  - сохраняем Supply в локальной БД (с JSON-строкой lines)
 *  - применяем поставку к товарам (увеличиваем количества и пишем транзакцию receipt)
 *  - возвращаем созданный Supply
 */
export const createSupply = async (input: CreateSupplyInput): Promise<{ id: number; uuid: string; totalAmount: number }> => {
  const totalAmount = input.lines.reduce((sum, l) => sum + (l.quantity || 0) * (l.unitPrice || 0), 0);
  const date = input.date ?? Date.now();

  // если supplierId задан, но supplierUuid не известен — попробуем подтянуть
  let supplierUuid = input.supplierUuid ?? null;
  let supplierServerId: number | null = null;
  if (input.supplierId) {
    const sup = await getSupplierById(input.supplierId);
    if (sup) {
      supplierUuid = supplierUuid || sup.uuid || null;
      supplierServerId = sup.serverId ?? null;
    }
  } else if (supplierUuid) {
    const sup = await getSupplierByUuid(supplierUuid);
    if (sup) supplierServerId = sup.serverId ?? null;
  }

  const { id, uuid } = await dbAddSupply({
    supplierServerId,
    supplierUuid,
    lines: JSON.stringify(input.lines),
    totalAmount,
    paidAmount: input.paidAmount || 0,
    note: input.note ?? null,
    date,
    isDeleted: 0,
  });

  // применить к товарам (увеличить количества + записать транзакции)
  await applySupplyToItems(input.lines);

  return { id, uuid, totalAmount };
};

export const listSuppliesBySupplier = (supplierUuid: string): Promise<Supply[]> => getSuppliesBySupplier(supplierUuid);

export const deleteSupply = (id: number) => dbDeleteSupply(id);

export const createPayment = async (input: CreatePaymentInput): Promise<{ id: number; uuid: string; allocations: PaymentAllocation[]; unallocated: number }> => {
  let supplierUuid = input.supplierUuid ?? null;
  let supplierServerId: number | null = null;
  if (input.supplierId) {
    const sup = await getSupplierById(input.supplierId);
    if (sup) {
      supplierUuid = supplierUuid || sup.uuid || null;
      supplierServerId = sup.serverId ?? null;
    }
  } else if (supplierUuid) {
    const sup = await getSupplierByUuid(supplierUuid);
    if (sup) supplierServerId = sup.serverId ?? null;
  }

  // Считаем allocations по FIFO — гасим самые старые непогашенные поставки.
  // Если задан supplyUuid — оплата идёт целиком в эту поставку (явный выбор пользователя).
  let allocations: PaymentAllocation[] = [];
  let unallocated = input.amount;

  if (input.supplyUuid) {
    allocations.push({ supplyUuid: input.supplyUuid, amount: input.amount });
    unallocated = 0;
  } else if (supplierUuid) {
    // Получаем enriched поставки (с уже учтёнными прошлыми оплатами)
    const agg = await getSupplierAggregate(supplierUuid);
    if (agg) {
      // Сортируем по дате по возрастанию (старые первыми)
      const supplies = [...agg.supplies].sort((a, b) => a.date - b.date);
      let remaining = input.amount;
      for (const s of supplies) {
        if (remaining <= 0) break;
        if (s.remaining <= 0) continue;
        const apply = Math.min(s.remaining, remaining);
        allocations.push({ supplyUuid: s.uuid!, amount: apply });
        remaining -= apply;
      }
      unallocated = Math.max(0, remaining);
    }
  }

  const res = await dbAddPayment({
    supplierServerId,
    supplierUuid,
    supplyUuid: input.supplyUuid ?? null,
    allocations: JSON.stringify(allocations),
    amount: input.amount,
    note: input.note ?? null,
    date: input.date ?? Date.now(),
    isDeleted: 0,
  });

  return { id: res.id, uuid: res.uuid, allocations, unallocated };
};

export const listPaymentsBySupplier = (supplierUuid: string): Promise<SupplierPayment[]> => getSupplierPaymentsBySupplier(supplierUuid);

export const deletePayment = (id: number) => dbDeletePayment(id);

const parseAllocations = (raw: string | null | undefined): PaymentAllocation[] => {
  if (!raw) return [];
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
};

/**
 * Полная сводка по поставщику: поставки (с разбивкой оплат), оплаты, итоги долга.
 * Считает локально, чтобы работало офлайн.
 *
 * Долг может быть:
 *   > 0 — мы должны поставщику
 *   < 0 — поставщик должен нам (мы заплатили вперёд)
 *   = 0 — расчёт сошёлся
 */
export const getSupplierAggregate = async (supplierUuid: string): Promise<SupplierAggregate | null> => {
  const supplier = await getSupplierByUuid(supplierUuid);
  if (!supplier) return null;
  const [supplies, payments] = await Promise.all([
    getSuppliesBySupplier(supplierUuid),
    getSupplierPaymentsBySupplier(supplierUuid),
  ]);

  // Накапливаем разбивку оплат по поставкам
  const breakdownMap = new Map<string, { paymentId: number; paymentDate: number; amount: number; note?: string | null }[]>();
  for (const p of payments) {
    const allocs = parseAllocations(p.allocations);
    for (const a of allocs) {
      if (!a.supplyUuid) continue;
      const arr = breakdownMap.get(a.supplyUuid) || [];
      arr.push({ paymentId: p.id, paymentDate: p.date, amount: a.amount, note: p.note });
      breakdownMap.set(a.supplyUuid, arr);
    }
  }

  const enriched: SupplyEnriched[] = supplies.map((s) => {
    const breakdown = breakdownMap.get(s.uuid || '') || [];
    const allocatedFromPayments = breakdown.reduce((sum, b) => sum + (b.amount || 0), 0);
    const remaining = (s.totalAmount || 0) - (s.paidAmount || 0) - allocatedFromPayments;
    return {
      ...s,
      allocatedFromPayments,
      paymentBreakdown: breakdown.sort((a, b) => a.paymentDate - b.paymentDate),
      remaining: Math.max(0, remaining),
    };
  });

  const totalSupplied = supplies.reduce((s, x) => s + (x.totalAmount || 0), 0);
  const totalPaidOnSupply = supplies.reduce((s, x) => s + (x.paidAmount || 0), 0);
  const totalPaidExtra = payments.reduce((s, x) => s + (x.amount || 0), 0);
  const totalPaid = totalPaidOnSupply + totalPaidExtra;

  return {
    supplier,
    supplies: enriched,
    payments,
    totals: {
      totalSupplied,
      totalPaidOnSupply,
      totalPaidExtra,
      totalPaid,
      debt: totalSupplied - totalPaid,
    },
  };
};

export const parseSupplyLines = (raw: string | null | undefined): SupplyLine[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};
