// src/services/ItemAttributeService.ts
import {
  getDatabaseInstance,
  runWithRetry,
  getAllWithRetry,
  getFirstWithRetry,
} from '../../database/database';
import { AttributeType, ItemAttribute } from '../../database/types';

const generateUUID = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

const rowToAttr = (row: any): ItemAttribute => ({
  id: row.id,
  serverId: row.serverId ?? null,
  uuid: row.uuid,
  itemUuid: row.itemUuid,
  name: row.name,
  value: row.value,
  attrType: ((row.attrType ?? 'text') as AttributeType),
  unit: row.unit ?? null,
  sortOrder: row.sortOrder ?? 0,
  version: row.version ?? 1,
  isDeleted: !!row.isDeleted,
  needsSync: !!row.needsSync,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export interface ItemAttributeInput {
  itemUuid: string;
  name: string;
  value: string;
  attrType?: AttributeType;
  unit?: string | null;
  sortOrder?: number;
}

export const getAttributesForItem = async (itemUuid: string): Promise<ItemAttribute[]> => {
  const db = await getDatabaseInstance();
  const rows = await getAllWithRetry<any>(
    db,
    'SELECT * FROM item_attributes WHERE itemUuid = ? AND isDeleted = 0 ORDER BY sortOrder ASC, id ASC',
    [itemUuid]
  );
  return rows.map(rowToAttr);
};

export const addAttribute = async (input: ItemAttributeInput): Promise<ItemAttribute> => {
  const db = await getDatabaseInstance();
  const now = Date.now();
  const uuid = generateUUID();
  const result = await runWithRetry(
    db,
    `INSERT INTO item_attributes
       (uuid, itemUuid, name, value, attrType, unit, sortOrder, version, isDeleted, needsSync, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, 1, ?, ?)`,
    [
      uuid,
      input.itemUuid,
      input.name,
      input.value,
      input.attrType ?? 'text',
      input.unit ?? null,
      input.sortOrder ?? 0,
      now,
      now,
    ]
  );
  const inserted = await getFirstWithRetry<any>(
    db,
    'SELECT * FROM item_attributes WHERE id = ?',
    [(result as any).lastInsertRowId || 0]
  );
  return rowToAttr(inserted);
};

export const updateAttribute = async (id: number, patch: Partial<ItemAttributeInput>): Promise<void> => {
  const db = await getDatabaseInstance();
  const updates: string[] = [];
  const params: any[] = [];

  if (patch.name !== undefined) { updates.push('name = ?'); params.push(patch.name); }
  if (patch.value !== undefined) { updates.push('value = ?'); params.push(patch.value); }
  if (patch.attrType !== undefined) { updates.push('attrType = ?'); params.push(patch.attrType); }
  if (patch.unit !== undefined) { updates.push('unit = ?'); params.push(patch.unit); }
  if (patch.sortOrder !== undefined) { updates.push('sortOrder = ?'); params.push(patch.sortOrder); }

  if (updates.length === 0) return;

  updates.push('version = version + 1');
  updates.push('needsSync = 1');
  updates.push('updatedAt = ?');
  params.push(Date.now());
  params.push(id);

  await runWithRetry(db, `UPDATE item_attributes SET ${updates.join(', ')} WHERE id = ?`, params);
};

export const deleteAttribute = async (id: number): Promise<void> => {
  const db = await getDatabaseInstance();
  await runWithRetry(
    db,
    'UPDATE item_attributes SET isDeleted = 1, version = version + 1, needsSync = 1, updatedAt = ? WHERE id = ?',
    [Date.now(), id]
  );
};

/** Полностью переписывает набор атрибутов товара. Удаляет старые, добавляет новые. */
export const replaceAttributesForItem = async (
  itemUuid: string,
  attrs: ItemAttributeInput[],
): Promise<void> => {
  const existing = await getAttributesForItem(itemUuid);
  for (const old of existing) {
    await deleteAttribute(old.id);
  }
  for (let i = 0; i < attrs.length; i++) {
    await addAttribute({ ...attrs[i], itemUuid, sortOrder: i });
  }
};

export const getAttributesNeedingSync = async (): Promise<ItemAttribute[]> => {
  const db = await getDatabaseInstance();
  const rows = await getAllWithRetry<any>(db, 'SELECT * FROM item_attributes WHERE needsSync = 1');
  return rows.map(rowToAttr);
};

export const markAttributeSynced = async (localId: number, serverId: number): Promise<void> => {
  const db = await getDatabaseInstance();
  await runWithRetry(
    db,
    'UPDATE item_attributes SET serverId = ?, needsSync = 0 WHERE id = ?',
    [serverId, localId]
  );
};

export const upsertAttributeFromServer = async (remote: {
  id: number;
  uuid: string;
  itemUuid: string;
  name: string;
  value: string;
  attrType?: string;
  unit?: string | null;
  sortOrder?: number;
  version?: number;
  isDeleted?: boolean;
  updatedAt?: string | number;
}): Promise<void> => {
  const db = await getDatabaseInstance();
  const existing = await getFirstWithRetry<any>(
    db,
    'SELECT id FROM item_attributes WHERE serverId = ? OR uuid = ?',
    [remote.id, remote.uuid]
  );
  const updatedAt = typeof remote.updatedAt === 'string'
    ? new Date(remote.updatedAt).getTime()
    : remote.updatedAt ?? Date.now();

  if (existing) {
    await runWithRetry(
      db,
      `UPDATE item_attributes SET
         serverId = ?, uuid = ?, itemUuid = ?, name = ?, value = ?, attrType = ?, unit = ?,
         sortOrder = ?, version = ?, isDeleted = ?, needsSync = 0, updatedAt = ?
       WHERE id = ?`,
      [
        remote.id,
        remote.uuid,
        remote.itemUuid,
        remote.name,
        remote.value,
        remote.attrType ?? 'text',
        remote.unit ?? null,
        remote.sortOrder ?? 0,
        remote.version ?? 1,
        remote.isDeleted ? 1 : 0,
        updatedAt,
        existing.id,
      ]
    );
  } else {
    await runWithRetry(
      db,
      `INSERT INTO item_attributes
         (serverId, uuid, itemUuid, name, value, attrType, unit, sortOrder, version, isDeleted, needsSync, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        remote.id,
        remote.uuid,
        remote.itemUuid,
        remote.name,
        remote.value,
        remote.attrType ?? 'text',
        remote.unit ?? null,
        remote.sortOrder ?? 0,
        remote.version ?? 1,
        remote.isDeleted ? 1 : 0,
        updatedAt,
        updatedAt,
      ]
    );
  }
};
