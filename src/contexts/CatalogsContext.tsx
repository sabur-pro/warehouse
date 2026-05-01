// src/contexts/CatalogsContext.tsx
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Catalog } from '../../database/types';
import {
  addCatalog as dbAddCatalog,
  CatalogInput,
  countItemsInCatalog,
  ensureSizeTypeIds,
  getAllCatalogs,
  getCatalogByName,
  reassignItems,
  softDeleteCatalog,
  updateCatalog as dbUpdateCatalog,
} from '../services/CatalogService';
import { CATALOG_TEMPLATES, CatalogTemplate, CLASSIC_TEMPLATE_ID, getTemplateById } from '../config/catalogTemplates';

interface CatalogsContextType {
  catalogs: Catalog[];
  enabledCatalogs: Catalog[];
  loading: boolean;
  reload: () => Promise<void>;
  addCatalog: (input: CatalogInput) => Promise<Catalog>;
  updateCatalog: (id: number, patch: Partial<CatalogInput>) => Promise<void>;
  toggleEnabled: (id: number, enabled: boolean) => Promise<void>;
  deleteCatalog: (id: number, opts?: { reassignTo?: string }) => Promise<{ deleted: boolean; usedBy?: number }>;
  applyTemplate: (templateId: string) => Promise<{ added: number; skipped: number }>;
  templates: CatalogTemplate[];
  resolveSizeType: (catalogName: string, sizeTypeName: string) => { sizes: (string | number)[] } | null;
}

const CatalogsContext = createContext<CatalogsContextType | undefined>(undefined);

const seedClassicTemplate = async (): Promise<void> => {
  const template = getTemplateById(CLASSIC_TEMPLATE_ID);
  if (!template) return;
  for (const cat of template.catalogs) {
    const existing = await getCatalogByName(cat.name);
    if (existing) continue;
    await dbAddCatalog({
      name: cat.name,
      icon: cat.icon ?? null,
      color: cat.color ?? null,
      sortOrder: 0,
      isEnabled: true,
      sizeTypes: ensureSizeTypeIds(cat.sizeTypes.map((s) => ({ name: s.name, sizes: s.sizes }))),
    });
  }
};

export const CatalogsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [loading, setLoading] = useState(true);
  const seededRef = useRef(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      let rows = await getAllCatalogs();
      if (rows.length === 0 && !seededRef.current) {
        seededRef.current = true;
        console.log('[CatalogsContext] Seeding default catalogs (classic template)');
        await seedClassicTemplate();
        rows = await getAllCatalogs();
      }
      setCatalogs(rows);
    } catch (e) {
      console.error('[CatalogsContext] reload failed', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const addCatalog = useCallback(async (input: CatalogInput): Promise<Catalog> => {
    const created = await dbAddCatalog(input);
    await reload();
    return created;
  }, [reload]);

  const updateCatalog = useCallback(async (id: number, patch: Partial<CatalogInput>) => {
    await dbUpdateCatalog(id, patch);
    await reload();
  }, [reload]);

  const toggleEnabled = useCallback(async (id: number, enabled: boolean) => {
    await dbUpdateCatalog(id, { isEnabled: enabled });
    await reload();
  }, [reload]);

  const deleteCatalog = useCallback(async (
    id: number,
    opts?: { reassignTo?: string },
  ): Promise<{ deleted: boolean; usedBy?: number }> => {
    const target = catalogs.find((c) => c.id === id);
    if (!target) return { deleted: false };

    const usage = await countItemsInCatalog(target.name);
    if (usage > 0) {
      if (!opts?.reassignTo) {
        return { deleted: false, usedBy: usage };
      }
      await reassignItems(target.name, opts.reassignTo);
    }
    await softDeleteCatalog(id);
    await reload();
    return { deleted: true };
  }, [catalogs, reload]);

  const applyTemplate = useCallback(async (templateId: string) => {
    const template = getTemplateById(templateId);
    if (!template) return { added: 0, skipped: 0 };

    let added = 0;
    let skipped = 0;
    for (const cat of template.catalogs) {
      const existing = await getCatalogByName(cat.name);
      if (existing) {
        skipped += 1;
        continue;
      }
      await dbAddCatalog({
        name: cat.name,
        icon: cat.icon ?? null,
        color: cat.color ?? null,
        sortOrder: 0,
        isEnabled: true,
        sizeTypes: ensureSizeTypeIds(cat.sizeTypes.map((s) => ({ name: s.name, sizes: s.sizes }))),
      });
      added += 1;
    }
    await reload();
    return { added, skipped };
  }, [reload]);

  const enabledCatalogs = useMemo(
    () => catalogs.filter((c) => c.isEnabled && !c.isDeleted),
    [catalogs],
  );

  const resolveSizeType = useCallback(
    (catalogName: string, sizeTypeName: string) => {
      const cat = catalogs.find((c) => c.name.toLowerCase() === catalogName.toLowerCase());
      if (!cat) return null;
      const st = cat.sizeTypes.find((s) => s.name.toLowerCase() === sizeTypeName.toLowerCase());
      return st ? { sizes: st.sizes } : null;
    },
    [catalogs],
  );

  const value = useMemo<CatalogsContextType>(
    () => ({
      catalogs,
      enabledCatalogs,
      loading,
      reload,
      addCatalog,
      updateCatalog,
      toggleEnabled,
      deleteCatalog,
      applyTemplate,
      templates: CATALOG_TEMPLATES,
      resolveSizeType,
    }),
    [catalogs, enabledCatalogs, loading, reload, addCatalog, updateCatalog, toggleEnabled, deleteCatalog, applyTemplate, resolveSizeType],
  );

  return <CatalogsContext.Provider value={value}>{children}</CatalogsContext.Provider>;
};

export const useCatalogs = (): CatalogsContextType => {
  const ctx = useContext(CatalogsContext);
  if (!ctx) throw new Error('useCatalogs must be used within CatalogsProvider');
  return ctx;
};
