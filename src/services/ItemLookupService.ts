import AuthService from './AuthService';
import { Item } from '../../database/types';
import { getItemById, getItemByCode, upsertItemFromServer } from '../../database/database';

/**
 * Поиск товара по данным из QR-кода с серверным fallback.
 *
 * Порядок:
 *   1. Локальная БД (uuid → local id → serverId)
 *   2. Если локально нет и есть uuid — запрос на сервер по uuid (admin или assistant роутом)
 *   3. Если сервер вернул товар — вставляем в локальную БД и возвращаем
 *
 * НИКАКОГО поиска по name/code: имена и коды могут совпадать у разных товаров.
 */
class ItemLookupService {
  /**
   * Возвращает структуру с результатом и статусом — чтобы сканер мог показать
   * человеку понятную причину, если ничего не нашли.
   */
  async findForScan(parsed: { itemId?: number; itemUuid?: string; itemName?: string }): Promise<{
    item: Item | null;
    source: 'local' | 'server' | 'none';
    reason?: 'no_uuid' | 'not_authenticated' | 'server_404' | 'server_error' | 'network';
  }> {
    const { itemId, itemUuid, itemName } = parsed || {};
    console.log('🔎 ItemLookup.findForScan: itemId=', itemId, 'uuid=', itemUuid?.slice(0, 8), 'name=', itemName);

    // 1. Локальный поиск
    const local = await getItemById(itemId ?? 0, itemName, itemUuid);
    if (local) {
      console.log('🔎 ItemLookup: resolved locally, id=', local.id);
      return { item: local, source: 'local' };
    }

    // 2. Без uuid серверный поиск невозможен — поиск по name/code запрещён
    if (!itemUuid) {
      console.warn('🔎 ItemLookup: no uuid in QR, cannot do server fallback');
      return { item: null, source: 'none', reason: 'no_uuid' };
    }

    // 3. Серверный fallback
    return await this.fetchFromServer(itemUuid);
  }

  /**
   * Поиск товара по штрих-коду (поле `code`).
   * Сначала локально, потом серверный fallback.
   * Если найден на сервере — вставляется локально для следующего раза.
   */
  async findByBarcode(code: string): Promise<{
    item: Item | null;
    source: 'local' | 'server' | 'none';
    reason?: 'no_code' | 'not_authenticated' | 'server_404' | 'server_error' | 'network';
  }> {
    if (!code || !code.trim()) {
      return { item: null, source: 'none', reason: 'no_code' };
    }
    console.log('🔎 ItemLookup.findByBarcode: code=', code);

    const local = await getItemByCode(code);
    if (local) {
      console.log('🔎 ItemLookup.findByBarcode: hit locally, id=', local.id);
      return { item: local, source: 'local' };
    }

    const token = await AuthService.getAccessToken();
    if (!token) {
      console.warn('🌐 ItemLookup.findByBarcode: not authenticated');
      return { item: null, source: 'none', reason: 'not_authenticated' };
    }
    const decoded = AuthService.decodeToken(token);
    if (!decoded) {
      return { item: null, source: 'none', reason: 'not_authenticated' };
    }

    const role = decoded.role;
    const endpoint =
      role === 'ASSISTANT'
        ? `/sync/assistant/items/by-code/${encodeURIComponent(code)}`
        : `/sync/admin/items/by-code/${encodeURIComponent(code)}`;
    console.log('🌐 ItemLookup.findByBarcode: fallback GET', endpoint, 'role=', role);

    const api = AuthService.getApiInstance();
    try {
      const response = await api.get(endpoint);
      const serverItem = response.data;
      if (!serverItem) {
        return { item: null, source: 'none', reason: 'server_404' };
      }
      console.log('🌐 ItemLookup.findByBarcode: server hit, serverId=', serverItem.id);
      const inserted = await upsertItemFromServer(serverItem);
      if (!inserted) return { item: null, source: 'none', reason: 'server_error' };
      return { item: inserted, source: 'server' };
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 404) {
        console.warn('🌐 ItemLookup.findByBarcode: server 404 for code=', code);
        return { item: null, source: 'none', reason: 'server_404' };
      }
      if (status) {
        console.error('🌐 ItemLookup.findByBarcode: server error', status, err?.response?.data);
        return { item: null, source: 'none', reason: 'server_error' };
      }
      console.error('🌐 ItemLookup.findByBarcode: network error', err?.message || err);
      return { item: null, source: 'none', reason: 'network' };
    }
  }

  /**
   * Запрос на сервер по uuid с правильным эндпоинтом по роли.
   */
  private async fetchFromServer(uuid: string): Promise<{
    item: Item | null;
    source: 'server' | 'none';
    reason?: 'not_authenticated' | 'server_404' | 'server_error' | 'network';
  }> {
    const token = await AuthService.getAccessToken();
    if (!token) {
      console.warn('🌐 ItemLookup: not authenticated, cannot fallback to server');
      return { item: null, source: 'none', reason: 'not_authenticated' };
    }
    const decoded = AuthService.decodeToken(token);
    if (!decoded) {
      console.warn('🌐 ItemLookup: cannot decode token');
      return { item: null, source: 'none', reason: 'not_authenticated' };
    }

    const role = decoded.role;
    const endpoint =
      role === 'ASSISTANT'
        ? `/sync/assistant/items/by-uuid/${encodeURIComponent(uuid)}`
        : `/sync/admin/items/by-uuid/${encodeURIComponent(uuid)}`;

    console.log('🌐 ItemLookup: fallback GET', endpoint, 'role=', role);
    const api = AuthService.getApiInstance();

    try {
      const response = await api.get(endpoint);
      const serverItem = response.data;
      if (!serverItem) {
        console.warn('🌐 ItemLookup: server returned empty body');
        return { item: null, source: 'none', reason: 'server_404' };
      }
      console.log('🌐 ItemLookup: server hit, serverId=', serverItem.id, 'uuid=', serverItem.uuid?.slice(0, 8));

      const inserted = await upsertItemFromServer(serverItem);
      if (!inserted) {
        console.warn('🌐 ItemLookup: failed to upsert into local DB');
        return { item: null, source: 'none', reason: 'server_error' };
      }
      return { item: inserted, source: 'server' };
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 404) {
        console.warn('🌐 ItemLookup: server 404 for uuid=', uuid);
        return { item: null, source: 'none', reason: 'server_404' };
      }
      if (status) {
        console.error('🌐 ItemLookup: server error', status, err?.response?.data);
        return { item: null, source: 'none', reason: 'server_error' };
      }
      console.error('🌐 ItemLookup: network error', err?.message || err);
      return { item: null, source: 'none', reason: 'network' };
    }
  }
}

export default new ItemLookupService();
