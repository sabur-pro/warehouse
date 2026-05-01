// src/services/CatalogService.ts
import {
  getDatabaseInstance,
  runWithRetry,
  getAllWithRetry,
  getFirstWithRetry,
} from '../../database/database';
import { Catalog, CatalogSizeType } from '../../database/types';

const generateUUID = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const generateSizeTypeId = (): string => `st_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const parseSizeTypes = (raw: string | null | undefined): CatalogSizeType[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((st: any) => ({
        id: typeof st?.id === 'string' && st.id ? st.id : generateSizeTypeId(),
        name: String(st?.name ?? ''),
        sizes: Array.isArray(st?.sizes) ? st.sizes : [],
      }))
      .filter((st) => st.name.length > 0);
  } catch {
    return [];
  }
};

const rowToCatalog = (row: any): Catalog => ({
  id: row.id,
  serverId: row.serverId ?? null,
  uuid: row.uuid,
  name: row.name,
  icon: row.icon ?? null,
  color: row.color ?? null,
  sortOrder: row.sortOrder ?? 0,
  isEnabled: !!row.isEnabled,
  sizeTypes: parseSizeTypes(row.sizeTypes),
  version: row.version ?? 1,
  isDeleted: !!row.isDeleted,
  needsSync: !!row.needsSync,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export interface CatalogInput {
  name: string;
  icon?: string | null;
  color?: string | null;
  sortOrder?: number;
  isEnabled?: boolean;
  sizeTypes: { id?: string; name: string; sizes: (string | number)[] }[];
}

export const ensureSizeTypeIds = (sizeTypes: { id?: string; name: string; sizes: (string | number)[] }[]): CatalogSizeType[] =>
  sizeTypes.map((st) => ({
    id: st.id || generateSizeTypeId(),
    name: st.name,
    sizes: st.sizes,
  }));

export const getAllCatalogs = async (): Promise<Catalog[]> => {
  const db = await getDatabaseInstance();
  const rows = await getAllWithRetry<any>(
    db,
    'SELECT * FROM catalogs WHERE isDeleted = 0 ORDER BY sortOrder ASC, id ASC'
  );
  return rows.map(rowToCatalog);
};

export const getCatalogByName = async (name: string): Promise<Catalog | null> => {
  const db = await getDatabaseInstance();
  const row = await getFirstWithRetry<any>(
    db,
    'SELECT * FROM catalogs WHERE isDeleted = 0 AND LOWER(name) = LOWER(?) LIMIT 1',
    [name]
  );
  return row ? rowToCatalog(row) : null;
};

export const getCatalogById = async (id: number): Promise<Catalog | null> => {
  const db = await getDatabaseInstance();
  const row = await getFirstWithRetry<any>(db, 'SELECT * FROM catalogs WHERE id = ?', [id]);
  return row ? rowToCatalog(row) : null;
};

export const addCatalog = async (input: CatalogInput): Promise<Catalog> => {
  const db = await getDatabaseInstance();
  const now = Date.now();
  const uuid = generateUUID();
  const sizeTypes = ensureSizeTypeIds(input.sizeTypes);
  const result = await runWithRetry(
    db,
    `
      INSERT INTO catalogs
        (uuid, name, icon, color, sortOrder, isEnabled, sizeTypes, version, isDeleted, needsSync, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, 1, ?, ?)
    `,
    [
      uuid,
      input.name,
      input.icon ?? null,
      input.color ?? null,
      input.sortOrder ?? 0,
      input.isEnabled === false ? 0 : 1,
      JSON.stringify(sizeTypes),
      now,
      now,
    ]
  );
  const inserted = await getFirstWithRetry<any>(db, 'SELECT * FROM catalogs WHERE id = ?', [
    (result as any).lastInsertRowId || 0,
  ]);
  return rowToCatalog(inserted);
};

export const updateCatalog = async (id: number, patch: Partial<CatalogInput>): Promise<void> => {
  const db = await getDatabaseInstance();
  const updates: string[] = [];
  const params: any[] = [];

  if (patch.name !== undefined) { updates.push('name = ?'); params.push(patch.name); }
  if (patch.icon !== undefined) { updates.push('icon = ?'); params.push(patch.icon); }
  if (patch.color !== undefined) { updates.push('color = ?'); params.push(patch.color); }
  if (patch.sortOrder !== undefined) { updates.push('sortOrder = ?'); params.push(patch.sortOrder); }
  if (patch.isEnabled !== undefined) { updates.push('isEnabled = ?'); params.push(patch.isEnabled ? 1 : 0); }
  if (patch.sizeTypes !== undefined) {
    updates.push('sizeTypes = ?');
    params.push(JSON.stringify(ensureSizeTypeIds(patch.sizeTypes)));
  }

  updates.push('version = version + 1');
  updates.push('needsSync = 1');
  updates.push('updatedAt = ?');
  params.push(Date.now());
  params.push(id);

  await runWithRetry(db, `UPDATE catalogs SET ${updates.join(', ')} WHERE id = ?`, params);
};

export const softDeleteCatalog = async (id: number): Promise<void> => {
  const db = await getDatabaseInstance();
  await runWithRetry(
    db,
    'UPDATE catalogs SET isDeleted = 1, needsSync = 1, version = version + 1, updatedAt = ? WHERE id = ?',
    [Date.now(), id]
  );
};

export const countItemsInCatalog = async (catalogName: string): Promise<number> => {
  const db = await getDatabaseInstance();
  const row = await getFirstWithRetry<{ count: number }>(
    db,
    'SELECT COUNT(*) as count FROM items WHERE itemType = ? AND isDeleted = 0',
    [catalogName]
  );
  return row?.count ?? 0;
};

export const reassignItems = async (fromName: string, toName: string): Promise<void> => {
  const db = await getDatabaseInstance();
  await runWithRetry(
    db,
    'UPDATE items SET itemType = ?, needsSync = 1, version = COALESCE(version, 1) + 1 WHERE itemType = ?',
    [toName, fromName]
  );
};

export const getCatalogsNeedingSync = async (): Promise<Catalog[]> => {
  const db = await getDatabaseInstance();
  const rows = await getAllWithRetry<any>(db, 'SELECT * FROM catalogs WHERE needsSync = 1');
  return rows.map(rowToCatalog);
};

export const markCatalogSynced = async (localId: number, serverId: number): Promise<void> => {
  const db = await getDatabaseInstance();
  await runWithRetry(db, 'UPDATE catalogs SET serverId = ?, needsSync = 0 WHERE id = ?', [serverId, localId]);
};

export const upsertCatalogFromServer = async (remote: {
  id: number;
  uuid: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  sortOrder?: number;
  isEnabled?: boolean;
  sizeTypes: string;
  version?: number;
  isDeleted?: boolean;
  updatedAt?: string | number;
}): Promise<void> => {
  const db = await getDatabaseInstance();
  const existing = await getFirstWithRetry<any>(
    db,
    'SELECT id FROM catalogs WHERE serverId = ? OR uuid = ?',
    [remote.id, remote.uuid]
  );
  const updatedAt = typeof remote.updatedAt === 'string'
    ? new Date(remote.updatedAt).getTime()
    : remote.updatedAt ?? Date.now();

  if (existing) {
    await runWithRetry(
      db,
      `UPDATE catalogs SET
        serverId = ?, uuid = ?, name = ?, icon = ?, color = ?, sortOrder = ?,
        isEnabled = ?, sizeTypes = ?, version = ?, isDeleted = ?, needsSync = 0, updatedAt = ?
       WHERE id = ?`,
      [
        remote.id,
        remote.uuid,
        remote.name,
        remote.icon ?? null,
        remote.color ?? null,
        remote.sortOrder ?? 0,
        remote.isEnabled === false ? 0 : 1,
        remote.sizeTypes ?? '[]',
        remote.version ?? 1,
        remote.isDeleted ? 1 : 0,
        updatedAt,
        existing.id,
      ]
    );
  } else {
    await runWithRetry(
      db,
      `INSERT INTO catalogs
        (serverId, uuid, name, icon, color, sortOrder, isEnabled, sizeTypes, version, isDeleted, needsSync, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        remote.id,
        remote.uuid,
        remote.name,
        remote.icon ?? null,
        remote.color ?? null,
        remote.sortOrder ?? 0,
        remote.isEnabled === false ? 0 : 1,
        remote.sizeTypes ?? '[]',
        remote.version ?? 1,
        remote.isDeleted ? 1 : 0,
        updatedAt,
        updatedAt,
      ]
    );
  }
};
