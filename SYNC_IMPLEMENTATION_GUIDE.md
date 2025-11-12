# 🔄 Руководство по интеграции системы синхронизации

## ✅ Что уже реализовано

### Backend
- ✅ Prisma schema с новыми моделями (Item, Transaction, PendingAction, PushToken, SyncState)
- ✅ Миграция PostgreSQL базы данных
- ✅ Storage модуль для работы с изображениями
- ✅ Sync модуль для синхронизации (assistant/admin endpoints)
- ✅ Notifications модуль для PUSH-уведомлений
- ✅ Cron-задача для автоотклонения pending actions

### Frontend
- ✅ Миграция SQLite (добавлены sync-поля и новые таблицы)
- ✅ ImageService для загрузки/скачивания изображений
- ✅ SyncService для синхронизации данных
- ✅ NotificationService для PUSH-уведомлений
- ✅ useAutoSync hook для автоматической синхронизации
- ✅ SyncStatusBar компонент

## 📝 Что нужно доделать

### 1. Интеграция в главный экран

Добавьте `SyncStatusBar` в главный layout:

```tsx
// App.tsx или MainScreen.tsx
import { SyncStatusBar } from './src/components/sync/SyncStatusBar';

export default function App() {
  return (
    <View style={{ flex: 1 }}>
      <SyncStatusBar />
      {/* Остальной контент */}
    </View>
  );
}
```

### 2. Регистрация PUSH-токена при входе

Добавьте в AuthContext или после успешного входа:

```tsx
import NotificationService from './src/services/NotificationService';

// После успешного входа
await NotificationService.registerPushToken();
NotificationService.setupNotificationListeners((notification) => {
  // Обработка уведомлений
  console.log('Notification:', notification);
});
```

### 3. Модификация addItem для синхронизации

Обновите функцию создания товара:

```tsx
import { getDatabaseInstance, runWithRetry } from './database/database';
import SyncService from './src/services/SyncService';

const handleCreateItem = async (itemData, imageUri) => {
  const db = await getDatabaseInstance();
  
  // Добавить needsSync=1 и imageNeedsUpload (если есть изображение)
  await runWithRetry(db, `
    INSERT INTO items (
      name, code, warehouse, numberOfBoxes, boxSizeQuantities,
      sizeType, itemType, imageUri, totalQuantity, totalValue,
      qrCodeType, qrCodes, needsSync, imageNeedsUpload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `, [
    itemData.name,
    itemData.code,
    itemData.warehouse,
    itemData.numberOfBoxes,
    JSON.stringify(itemData.boxSizeQuantities),
    itemData.sizeType,
    itemData.itemType,
    imageUri,
    itemData.totalQuantity,
    itemData.totalValue,
    itemData.qrCodeType,
    itemData.qrCodes,
    imageUri ? 1 : 0, // imageNeedsUpload
  ]);
  
  // Запустить синхронизацию в фоне
  SyncService.assistantPush().catch(err => {
    console.error('Sync failed:', err);
  });
};
```

### 4. Модификация updateItem с запросом подтверждения

Для изменения товара (ассистент должен запросить подтверждение):

```tsx
import { Alert } from 'react-native';
import SyncService from './src/services/SyncService';

const handleUpdateItem = async (itemId, newData) => {
  const db = await getDatabaseInstance();
  const oldData = await getFirstWithRetry(db, 'SELECT * FROM items WHERE id=?', [itemId]);
  
  // Показать диалог подтверждения
  Alert.alert(
    'Требуется подтверждение',
    'Изменение товара требует подтверждения администратора',
    [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Отправить запрос',
        onPress: async () => {
          await SyncService.requestApproval(
            'UPDATE_ITEM',
            itemId,
            oldData,
            newData,
            'Изменение данных товара'
          );
          Alert.alert('Запрос отправлен', 'Ожидайте подтверждения администратора');
        },
      },
    ]
  );
};
```

### 5. Модификация addTransaction для синхронизации

Обновите функцию создания транзакции:

```tsx
const handleAddTransaction = async (transactionData) => {
  const db = await getDatabaseInstance();
  
  await runWithRetry(db, `
    INSERT INTO transactions (
      action, itemId, itemName, timestamp, details, needsSync
    ) VALUES (?, ?, ?, ?, ?, 1)
  `, [
    transactionData.action,
    transactionData.itemId,
    transactionData.itemName,
    Date.now(),
    JSON.stringify(transactionData.details),
  ]);
  
  // Запустить синхронизацию в фоне
  SyncService.assistantPush().catch(err => {
    console.error('Sync failed:', err);
  });
};
```

### 6. Обновить API конфигурацию

В файле `src/config/api.ts` укажите правильный IP адрес вашего backend сервера:

```tsx
export const API_CONFIG = {
  development: Platform.OS === 'android' ? 'http://YOUR_IP:3000' : 'http://localhost:3000',
  production: 'https://api.your-domain.com',
};
```

### 7. Обновить NotificationService

В файле `src/services/NotificationService.ts` на строке 96 замените `'your-project-id'` на ваш Expo Project ID:

```tsx
const tokenData = await Notifications.getExpoPushTokenAsync({
  projectId: 'your-actual-expo-project-id', // Получите из app.json или expo.dev
});
```

### 8. Создать экран Pending Actions для админа (опционально)

Создайте экран для просмотра и одобрения запросов:

```tsx
import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import SyncService from '../services/SyncService';

export const PendingActionsScreen = () => {
  const [actions, setActions] = useState([]);
  
  useEffect(() => {
    loadPendingActions();
  }, []);
  
  const loadPendingActions = async () => {
    const data = await SyncService.getPendingActions();
    setActions(data);
  };
  
  const handleApprove = async (id) => {
    await SyncService.approveAction(id, 'Одобрено');
    loadPendingActions();
  };
  
  const handleReject = async (id) => {
    await SyncService.rejectAction(id, 'Отклонено');
    loadPendingActions();
  };
  
  return (
    <FlatList
      data={actions}
      keyExtractor={(item) => item.id.toString()}
      renderItem={({ item }) => (
        <View className="p-4 bg-white mb-2">
          <Text className="font-bold">{item.actionType}</Text>
          <Text className="text-gray-600">{item.reason}</Text>
          <View className="flex-row mt-2">
            <TouchableOpacity onPress={() => handleApprove(item.id)} className="bg-green-500 px-4 py-2 rounded mr-2">
              <Text className="text-white">Одобрить</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleReject(item.id)} className="bg-red-500 px-4 py-2 rounded">
              <Text className="text-white">Отклонить</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    />
  );
};
```

## 🧪 Тестирование

### 1. Проверка работы синхронизации

1. Запустите backend: `cd back_sklad && npm run start:dev`
2. Запустите frontend: `cd sklad && npm start`
3. Войдите как ассистент
4. Создайте товар с изображением
5. Проверьте что:
   - Товар сохранен локально
   - SyncStatusBar показывает синхронизацию
   - Изображение загружено на сервер
   - Данные появились в PostgreSQL

### 2. Проверка PUSH-уведомлений

1. Войдите как админ на одном устройстве
2. Войдите как ассистент на другом
3. Ассистент запрашивает изменение товара
4. Админ должен получить PUSH-уведомление
5. Админ одобряет/отклоняет
6. Ассистент получает уведомление о результате

### 3. Проверка offline работы

1. Отключите интернет на устройстве
2. Создайте несколько товаров
3. SyncStatusBar должен показывать "X не синхронизировано"
4. Включите интернет
5. Данные автоматически синхронизируются

## 📚 Дополнительная информация

### Структура файлов

```
sklad/
├── src/
│   ├── services/
│   │   ├── ImageService.ts       ✅
│   │   ├── SyncService.ts        ✅
│   │   └── NotificationService.ts ✅
│   ├── hooks/
│   │   └── useAutoSync.ts        ✅
│   └── components/
│       └── sync/
│           └── SyncStatusBar.tsx  ✅
└── database/
    └── database.ts (обновлена)    ✅
```

### API Endpoints

**Ассистент:**
- `POST /sync/assistant/push` - отправка изменений
- `GET /sync/assistant/pull` - получение изменений
- `POST /sync/assistant/request-approval` - запрос подтверждения
- `GET /sync/assistant/pending-status` - статус запросов

**Админ:**
- `GET /sync/admin/pull` - получение изменений
- `GET /sync/admin/pending-actions` - список запросов
- `POST /sync/admin/approve/:id` - одобрить
- `POST /sync/admin/reject/:id` - отклонить

**Storage:**
- `POST /storage/upload` - загрузка изображения
- `GET /storage/:adminId/:filename` - получение изображения
- `DELETE /storage/:adminId/:filename` - удаление изображения

**Notifications:**
- `POST /notifications/register-token` - регистрация push token
- `DELETE /notifications/deactivate-token/:token` - деактивация

## ⚠️ Важные замечания

1. **Expo Project ID**: Замените в NotificationService.ts на настоящий ID
2. **BASE_URL**: Обновите в src/config/api.ts для вашего сервера
3. **Права доступа**: Убедитесь что камера и уведомления разрешены в app.json
4. **Тестирование**: PUSH работают только на физических устройствах
5. **Миграция**: При первом запуске БД автоматически мигрирует

## 🚀 Готово к использованию!

Базовая функциональность синхронизации полностью реализована. Можете начинать тестирование! 🎉
