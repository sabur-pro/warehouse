// src/contexts/CatalogsContext.tsx
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
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
import { CATALOG_TEMPLATES, CatalogTemplate, getTemplateById } from '../config/catalogTemplates';
import SyncService from '../services/SyncService';
import { useSyncRefresh } from '../components/sync/SyncStatusBar';

// Фоновый push каталогов сразу после локального изменения, чтобы на других устройствах
// (админ/ассистенты) изменение появилось без ожидания периодического тика автосинка.
// Ошибки глотаем — периодический фуллсинк всё равно подхватит, если что.
const triggerCatalogsSync = () => {
  SyncService.syncCatalogs().catch((err: unknown) => {
    console.warn('[CatalogsContext] background syncCatalogs failed (will retry on next tick)', err);
  });
};

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

// РАНЬШЕ: при пустой таблице каталогов автоматически создавали "обувь" и "одежда"
// (CLASSIC_TEMPLATE_ID). Теперь пользователь сам выбирает что добавить — либо вручную,
// либо применив один из шаблонов в настройках каталогов. Если каталогов нет —
// форма добавления товара покажет подсказку "Создайте каталог" (это уже есть в UI).

export const CatalogsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await getAllCatalogs();
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

  // После любой успешной синхронизации (включая pull новых каталогов с других устройств)
  // перечитываем локальную БД, иначе экран показывает старый список до перемонтирования.
  useSyncRefresh('CatalogsContext', reload);

  const addCatalog = useCallback(async (input: CatalogInput): Promise<Catalog> => {
    const created = await dbAddCatalog(input);
    await reload();
    triggerCatalogsSync(); // фоновый push, чтобы другое устройство увидело каталог сразу
    return created;
  }, [reload]);

  const updateCatalog = useCallback(async (id: number, patch: Partial<CatalogInput>) => {
    await dbUpdateCatalog(id, patch);
    await reload();
    triggerCatalogsSync();
  }, [reload]);

  const toggleEnabled = useCallback(async (id: number, enabled: boolean) => {
    await dbUpdateCatalog(id, { isEnabled: enabled });
    await reload();
    triggerCatalogsSync();
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
    triggerCatalogsSync();
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
    if (added > 0) triggerCatalogsSync(); // если шаблон что-то добавил — сразу пушим
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
