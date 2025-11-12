// src/screens/SettingsScreen.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useDatabase, ImportResult } from '../../hooks/useDatabase';
import * as FileSystem from 'expo-file-system';
import { 
  streamingExportDatabase,
  streamingImportFromFolder,
  StreamingExportProgress,
  StreamingImportProgress 
} from '../../database/streamingImportExport';
import * as DocumentPicker from 'expo-document-picker';

const SettingsScreen: React.FC = () => {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<StreamingExportProgress | null>(null);
  const [importProgress, setImportProgress] = useState<StreamingImportProgress | null>(null);
  const [showStreamingExport, setShowStreamingExport] = useState(false);
  
  const {
    clearDatabase,
    exportDatabase,
    shareExportedZip,
    pickAndImportZip,
    clearTransactions,
  } = useDatabase();

  const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

  const handleExport = async () => {
    // Предлагаем выбор типа экспорта
    Alert.alert(
      'Тип экспорта',
      'Выберите способ экспорта:',
      [
        {
          text: 'Обычный (ZIP)',
          onPress: handleStandardExport
        },
        {
          text: 'Большие объемы (Папка)',
          onPress: handleStreamingExport
        },
        {
          text: 'Отмена',
          style: 'cancel'
        }
      ]
    );
  };

  const handleStandardExport = async () => {
    try {
      setIsExporting(true);
      await sleep(200);
      const zipPath = await exportDatabase();
      await shareExportedZip(zipPath);
      Alert.alert('Успех', 'Экспорт выполнен');
    } catch (e) {
      console.error('Export error:', e);
      Alert.alert('Ошибка', 'Не удалось экспортировать базу данных: ' + String((e as any)?.message || e));
    } finally {
      setIsExporting(false);
    }
  };

  const handleStreamingExport = async () => {
    try {
      setIsExporting(true);
      setShowStreamingExport(true);
      setExportProgress({ stage: 'preparing', current: 0, total: 100, message: 'Подготовка...' });
      
      const folderPath = await streamingExportDatabase((progress) => {
        setExportProgress(progress);
      });
      
      Alert.alert(
        'Экспорт завершен!', 
        `Данные сохранены в папку:\n${folderPath}\n\nДля больших файлов рекомендуем заархивировать папку через файловый менеджер.`,
        [
          {
            text: 'ОК',
            onPress: () => setShowStreamingExport(false)
          }
        ]
      );
    } catch (e) {
      console.error('Streaming export error:', e);
      Alert.alert('Ошибка экспорта', String((e as any)?.message || e));
      setShowStreamingExport(false);
    } finally {
      setIsExporting(false);
      setExportProgress(null);
    }
  };

  const handleImport = async () => {
    try {
      await sleep(250);
      setIsImporting(true);
      const res: ImportResult = await pickAndImportZip();

      if (res.imported) {
        let message = 'Импорт завершён успешно!';
        if (res.itemsWithoutPrice && res.itemsWithoutPrice > 0) {
          message += `\n\n⚠️ Внимание: ${res.itemsWithoutPrice} товар(ов) импортированы без цены и помечены красной рамкой. Пожалуйста, откройте эти товары и добавьте цены.`;
        }
        Alert.alert('Успех', message);
      } else {
        const message = res.message ?? 'cancelled';
        if (message === 'cancelled') {
          Alert.alert(
            'Импорт отменён',
            'Вы отменили выбор файла или система не открыла диалог. Попробуйте снова: нажмите "Импорт" и выберите ZIP-файл.'
          );
        } else if (message.includes('слишком большой')) {
          Alert.alert(
            'Файл слишком большой',
            message + '\n\nСоветы по уменьшению размера:\n• Сжать изображения\n• Удалить ненужные товары\n• Разделить на несколько файлов'
          );
        } else if (message.includes('памяти')) {
          Alert.alert(
            'Недостаточно памяти',
            message + '\n\nПопробуйте:\n• Перезапустить приложение\n• Закрыть другие приложения\n• Использовать файл меньшего размера'
          );
        } else {
          Alert.alert('Ошибка импорта', String(message));
        }
      }
    } catch (e) {
      console.error('Import error:', e);
      const errorMessage = String((e as any)?.message || e);
      if (errorMessage.includes('OutOfMemoryError') || errorMessage.includes('памяти')) {
        Alert.alert(
          'Недостаточно памяти',
          'Файл слишком большой для обработки.\n\nРешения:\n• Перезапустить приложение\n• Сжать изображения в архиве\n• Разделить данные на несколько файлов\n• Использовать устройство с большим объемом RAM'
        );
      } else {
        Alert.alert('Ошибка', 'Не удалось импортировать файл: ' + errorMessage);
      }
    } finally {
      setIsImporting(false);
    }
  };

  const handleLargeImport = async () => {
    Alert.alert(
      'Импорт больших данных',
      'Для файлов больше 30MB:\n\n📌 Android 10+ не позволяет прямой доступ к папкам\n\n✅ Решение:\n1. Разархивируйте ZIP\n2. Выберите нужные файлы по очереди\n3. Мы скопируем их и импортируем\n\nПродолжить?',
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Выбрать файлы', onPress: handlePickItemsCsvForLargeImport }
      ]
    );
  };

  const handlePickItemsCsvForLargeImport = async () => {
    // НЕ устанавливаем setIsImporting(true) здесь - только покажем диалог
    Alert.alert(
      'Выбор файлов для импорта',
      'Для импорта больших данных нужно выбрать несколько файлов:\n\n1. items.csv (обязательно)\n2. transactions.csv (опционально)\n3. Изображения из папки images/ (опционально)\n\nНачнем с items.csv',
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Выбрать файлы', onPress: () => pickMultipleFilesForImport() }
      ]
    );
  };

  const pickMultipleFilesForImport = async () => {
    try {
      // Шаг 1: Выбираем items.csv
      const itemsResult = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', '*/*'],
        copyToCacheDirectory: true, // Копируем в кеш
        multiple: false
      });

      if (itemsResult.canceled || !itemsResult.assets || itemsResult.assets.length === 0) {
        // Пользователь отменил выбор
        return;
      }

      const itemsUri = itemsResult.assets[0].uri;
      const itemsName = itemsResult.assets[0].name || '';
      
      console.log('Selected items.csv:', itemsUri);

      if (!itemsName.toLowerCase().includes('items.csv')) {
        Alert.alert('Ошибка', 'Пожалуйста, выберите файл items.csv');
        return;
      }

      // Шаг 2: Предлагаем выбрать transactions.csv
      Alert.alert(
        'Выбрать transactions.csv?',
        'Хотите импортировать историю транзакций?\n\n(Можно пропустить если нужны только товары)',
        [
          { 
            text: 'Пропустить', 
            onPress: () => askForImages(itemsUri, null)
          },
          { 
            text: 'Выбрать', 
            onPress: async () => {
              const transResult = await DocumentPicker.getDocumentAsync({
                type: ['text/csv', 'text/comma-separated-values', '*/*'],
                copyToCacheDirectory: true,
                multiple: false
              });

              const transUri = (!transResult.canceled && transResult.assets && transResult.assets.length > 0) 
                ? transResult.assets[0].uri 
                : null;

              if (transUri) {
                console.log('Selected transactions.csv:', transUri);
              }

              // Переходим к выбору изображений
              askForImages(itemsUri, transUri);
            }
          }
        ]
      );
    } catch (error) {
      console.error('Multi-file pick error:', error);
      Alert.alert('Ошибка', String((error as any)?.message || error));
    }
  };

  const askForImages = (itemsUri: string, transactionsUri: string | null) => {
    Alert.alert(
      'Выбрать изображения?',
      'Хотите загрузить изображения товаров?\n\n📸 Можно выбрать несколько файлов (до 50 за раз)\n\n💡 Совет: Если экспортировали из старой версии, выберите изображения из папки "images" экспорта. Система автоматически сопоставит их с товарами.\n\n(Можно пропустить если изображения не нужны)',
      [
        { 
          text: 'Пропустить', 
          onPress: () => proceedToImportWithFiles(itemsUri, transactionsUri, [])
        },
        { 
          text: 'Выбрать', 
          onPress: () => pickImages(itemsUri, transactionsUri)
        }
      ]
    );
  };

  const pickImages = async (itemsUri: string, transactionsUri: string | null) => {
    try {
      const imageResult = await DocumentPicker.getDocumentAsync({
        type: ['image/*'],
        copyToCacheDirectory: true,
        multiple: true
      });

      let imageUris: string[] = [];
      
      if (!imageResult.canceled && imageResult.assets && imageResult.assets.length > 0) {
        imageUris = imageResult.assets.map(asset => asset.uri);
        console.log(`Selected ${imageUris.length} images`);
      }

      proceedToImportWithFiles(itemsUri, transactionsUri, imageUris);
    } catch (error) {
      console.error('Image pick error:', error);
      Alert.alert('Ошибка выбора изображений', 'Продолжаем импорт без изображений');
      proceedToImportWithFiles(itemsUri, transactionsUri, []);
    }
  };

  const proceedToImportWithFiles = async (
    itemsUri: string, 
    transactionsUri: string | null,
    imageUris: string[]
  ) => {
    // ТЕПЕРЬ устанавливаем флаг загрузки - начинается реальный импорт
    setIsImporting(true);
    
    try {
      // Создаем временную папку для импорта
      const tempImportDir = `${FileSystem.documentDirectory}temp_large_import_${Date.now()}/`;
      await FileSystem.makeDirectoryAsync(tempImportDir, { intermediates: true });
      
      // Создаем папку для изображений
      const imagesDir = `${tempImportDir}images/`;
      await FileSystem.makeDirectoryAsync(imagesDir, { intermediates: true });

      console.log('Copying files to temp directory:', tempImportDir);

      // Копируем items.csv
      const itemsDestPath = `${tempImportDir}items.csv`;
      await FileSystem.copyAsync({ from: itemsUri, to: itemsDestPath });
      console.log('Copied items.csv to:', itemsDestPath);

      // Копируем transactions.csv если есть
      if (transactionsUri) {
        const transDestPath = `${tempImportDir}transactions.csv`;
        await FileSystem.copyAsync({ from: transactionsUri, to: transDestPath });
        console.log('Copied transactions.csv to:', transDestPath);
      }

      // Копируем изображения если есть
      if (imageUris.length > 0) {
        console.log(`Copying ${imageUris.length} images...`);
        console.log('Image URIs:', imageUris);
        
        for (let i = 0; i < imageUris.length; i++) {
          try {
            const imageUri = imageUris[i];
            // Получаем имя файла из URI - очищаем от спецсимволов
            let fileName = imageUri.split('/').pop() || `image_${i}.jpg`;
            
            // Декодируем URL-encoded имена файлов
            try {
              fileName = decodeURIComponent(fileName);
            } catch (e) {
              console.warn('Failed to decode filename:', fileName);
            }
            
            // Убираем query parameters если есть (например ?timestamp=123)
            fileName = fileName.split('?')[0];
            
            const destPath = `${imagesDir}${fileName}`;
            await FileSystem.copyAsync({ from: imageUri, to: destPath });
            console.log(`✓ Copied image ${i + 1}/${imageUris.length}: ${fileName}`);
          } catch (imgError) {
            console.warn(`Failed to copy image ${i}:`, imgError);
          }
        }
        console.log(`✓ All ${imageUris.length} images copied to ${imagesDir}`);
        
        // Выводим список всех файлов в папке для отладки
        try {
          const filesInDir = await FileSystem.readDirectoryAsync(imagesDir);
          console.log(`Files in images directory (${filesInDir.length}):`, filesInDir);
        } catch (e) {
          console.warn('Failed to read images directory:', e);
        }
      }

      // Импортируем из временной папки
      await handleLargeFileImport(tempImportDir);
      
      // Очищаем временную папку
      try {
        await FileSystem.deleteAsync(tempImportDir, { idempotent: true });
        console.log('Cleaned up temp directory');
      } catch (cleanupError) {
        console.warn('Failed to cleanup temp directory:', cleanupError);
      }
      
    } catch (error) {
      console.error('Import preparation error:', error);
      Alert.alert('Ошибка', String((error as any)?.message || error));
      setIsImporting(false);
    }
  };

  const handleLargeFileImport = async (folderUri: string) => {
    try {
      console.log('Starting large file import from folder:', folderUri);
      
      // Импортируем из папки потоково
      const result = await streamingImportFromFolder(folderUri, (progress) => {
        setImportProgress(progress);
        console.log(`Import progress: ${progress.current}/${progress.total} - ${progress.message}`);
      });
      
      let message = '✅ Импорт завершён успешно!';
      
      // Добавляем информацию об изображениях
      if (result.imagesImported !== undefined && result.imagesTotal !== undefined) {
        if (result.imagesImported > 0) {
          message += `\n\n📸 Изображения: ${result.imagesImported}`;
          if (result.imagesTotal > result.imagesImported) {
            message += ` (выбрано ${result.imagesTotal})`;
          }
        } else if (result.imagesTotal > 0) {
          message += `\n\n⚠️ Изображения не сопоставлены (${result.imagesTotal} выбрано)`;
          message += `\n\n💡 Совет: Проверьте консоль для подробностей`;
        }
      }
      
      // Добавляем информацию о ценах
      if (result.itemsWithoutPrice && result.itemsWithoutPrice > 0) {
        message += `\n\n🔴 ${result.itemsWithoutPrice} товар(ов) без цены`;
      }
      
      Alert.alert('Импорт завершён', message);
      setImportProgress(null);
    } catch (error) {
      console.error('Folder import error:', error);
      const errorMsg = String((error as any)?.message || error);
      
      if (errorMsg.includes('items.csv не найден')) {
        Alert.alert(
          'Файл не найден',
          'Не удалось найти items.csv в подготовленной папке.\n\nПопробуйте снова или используйте "Импорт данных (ZIP)"',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Ошибка импорта', errorMsg);
      }
      setImportProgress(null);
    } finally {
      setIsImporting(false);
    }
  };


  const handleClearDatabase = async () => {
    Alert.alert(
      'Очистка базы данных',
      'Вы уверены, что хотите удалить все записи? Это действие нельзя отменить.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearDatabase();
              Alert.alert('Успех', 'База данных очищена');
            } catch (error) {
              console.error('Error clearing database:', error);
              Alert.alert('Ошибка', 'Не удалось очистить базу данных');
            }
          },
        },
      ]
    );
  };

  const handleClearHistory = async () => {
    Alert.alert(
      'Очистить историю?',
      'Все записи об изменениях будут удалены. Это действие нельзя отменить.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Очистить',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearTransactions();
              Alert.alert('Успех', 'История очищена');
            } catch (error) {
              console.error('Failed to clear transactions:', error);
              Alert.alert('Ошибка', 'Не удалось очистить историю');
            }
          }
        }
      ]
    );
  };

  const SettingItem: React.FC<{
    icon: keyof typeof MaterialIcons.glyphMap;
    title: string;
    description: string;
    onPress: () => void;
    color?: string;
    destructive?: boolean;
  }> = ({ icon, title, description, onPress, color = '#10b981', destructive = false }) => (
    <TouchableOpacity
      style={[styles.settingItem, destructive && styles.destructiveItem]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.iconContainer, { backgroundColor: `${color}20` }]}>
        <MaterialIcons name={icon} size={24} color={color} />
      </View>
      <View style={styles.settingContent}>
        <Text style={[styles.settingTitle, destructive && styles.destructiveText]}>
          {title}
        </Text>
        <Text style={styles.settingDescription}>{description}</Text>
      </View>
      <MaterialIcons name="chevron-right" size={24} color="#9ca3af" />
    </TouchableOpacity>
  );

  const SectionHeader: React.FC<{ title: string }> = ({ title }) => (
    <Text style={styles.sectionHeader}>{title}</Text>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Настройки</Text>
        <MaterialIcons name="settings" size={24} color="#10b981" />
      </View>
      
      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        <SectionHeader title="Данные" />
        
        <SettingItem
          icon="file-download"
          title="Экспорт данных"
          description="Создать ZIP архив с товарами и изображениями"
          onPress={handleExport}
          color="#3b82f6"
        />
        
        <SettingItem
          icon="file-upload"
          title="Импорт данных (ZIP)"
          description="Для ZIP файлов до 30MB - быстрый импорт"
          onPress={handleImport}
          color="#8b5cf6"
        />
        
        <SettingItem
          icon="folder-open"
          title="Импорт больших данных"
          description="Для файлов >30MB - выбор файлов по очереди"
          onPress={handleLargeImport}
          color="#06b6d4"
        />
        
        <SectionHeader title="Очистка" />
        
        <SettingItem
          icon="delete-sweep"
          title="Очистить историю"
          description="Удалить все записи о транзакциях"
          onPress={handleClearHistory}
          color="#f59e0b"
        />
        
        <SettingItem
          icon="delete-forever"
          title="Очистить базу данных"
          description="Удалить все товары и данные"
          onPress={handleClearDatabase}
          color="#ef4444"
          destructive
        />
        
        <SectionHeader title="О приложении" />
        
        <View style={styles.appInfo}>
          <Text style={styles.appName}>Склад</Text>
          <Text style={styles.appVersion}>Версия 1.0.3</Text>
          <Text style={styles.appDescription}>
            Система управления складскими запасами с современным интерфейсом и аналитикой созданно командой NOROV
          </Text>
        </View>
      </ScrollView>

      {/* Modal overlay for exporting */}
      <Modal visible={isExporting} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ActivityIndicator size="large" color="#10b981" />
            <Text style={styles.modalText}>Выполняется экспорт...</Text>
          </View>
        </View>
      </Modal>

      {/* Modal overlay for importing */}
      <Modal visible={isImporting && !importProgress} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ActivityIndicator size="large" color="#10b981" />
            <Text style={styles.modalText}>Выполняется импорт...</Text>
          </View>
        </View>
      </Modal>

      {/* Modal for streaming import progress */}
      <Modal visible={isImporting && !!importProgress} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { width: '80%' }]}>
            <Text style={[styles.modalText, { marginBottom: 20 }]}>Импорт больших данных</Text>
            
            {importProgress && (
              <>
                <Text style={{ marginBottom: 10, textAlign: 'center' }}>
                  {importProgress.message}
                </Text>
                
                <View style={{ width: '100%', marginBottom: 10 }}>
                  <View style={{ height: 6, backgroundColor: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
                    <View 
                      style={{ 
                        height: 6, 
                        backgroundColor: '#8b5cf6', 
                        borderRadius: 3,
                        width: `${importProgress.total > 0 ? (importProgress.current / importProgress.total) * 100 : 0}%`
                      }} 
                    />
                  </View>
                </View>
                
                <Text style={{ fontSize: 12, color: '#6b7280', textAlign: 'center' }}>
                  {importProgress.current}/{importProgress.total} 
                  {importProgress.total > 0 && ` (${Math.round((importProgress.current / importProgress.total) * 100)}%)`}
                </Text>
              </>
            )}
            
            <ActivityIndicator size="large" color="#8b5cf6" style={{ marginTop: 20 }} />
          </View>
        </View>
      </Modal>

      {/* Modal for streaming export progress */}
      <Modal visible={showStreamingExport} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { width: '80%' }]}>
            <Text style={[styles.modalText, { marginBottom: 20 }]}>Экспорт больших данных</Text>
            
            {exportProgress && (
              <>
                <Text style={{ marginBottom: 10, textAlign: 'center' }}>
                  {exportProgress.message}
                </Text>
                
                <View style={{ width: '100%', marginBottom: 10 }}>
                  <View style={{ height: 6, backgroundColor: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
                    <View 
                      style={{ 
                        height: 6, 
                        backgroundColor: '#10b981', 
                        borderRadius: 3,
                        width: `${exportProgress.total > 0 ? (exportProgress.current / exportProgress.total) * 100 : 0}%`
                      }} 
                    />
                  </View>
                </View>
                
                <Text style={{ fontSize: 12, color: '#6b7280', textAlign: 'center' }}>
                  {exportProgress.current}/{exportProgress.total} 
                  {exportProgress.total > 0 && ` (${Math.round((exportProgress.current / exportProgress.total) * 100)}%)`}
                </Text>
              </>
            )}
            
            <ActivityIndicator size="large" color="#10b981" style={{ marginTop: 20 }} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingTop: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginTop: 24,
    marginBottom: 12,
    marginLeft: 4,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  destructiveItem: {
    borderWidth: 1,
    borderColor: '#fee2e2',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  destructiveText: {
    color: '#ef4444',
  },
  settingDescription: {
    fontSize: 14,
    color: '#6b7280',
  },
  appInfo: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  appName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  appVersion: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 12,
  },
  appDescription: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: 220,
    padding: 24,
    backgroundColor: '#fff',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
});

export default SettingsScreen;

