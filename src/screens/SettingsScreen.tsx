// src/screens/SettingsScreen.tsx
import React, { useCallback, useState, useEffect } from 'react';
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
  Linking,
  BackHandler,
  TextInput,
  FlatList,
  Switch,
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
import { generateLocalTestData } from '../../database/database';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useCurrency } from '../contexts/CurrencyContext';
import {
  useShowHardwareIndicators,
  setShowHardwareIndicators,
} from '../utils/hardwareIndicatorsSettings';
import { getThemeColors } from '../../constants/theme';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import LogService from '../services/LogService';
import SyncService from '../services/SyncService';

export const SYNC_INTERVAL_KEY = 'sync_interval_ms';
export const DEFAULT_SYNC_INTERVAL = 5 * 60 * 1000; // 5 минут

const SYNC_INTERVAL_OPTIONS = [
  { label: '30 секунд', value: 30 * 1000 },
  { label: '1 минута', value: 60 * 1000 },
  { label: '2 минуты', value: 2 * 60 * 1000 },
  { label: '3 минуты', value: 3 * 60 * 1000 },
  { label: '5 минут', value: 5 * 60 * 1000 },
  { label: '7 минут', value: 7 * 60 * 1000 },
  { label: '10 минут', value: 10 * 60 * 1000 },
];

const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { isDark } = useTheme();
  const { isAdmin } = useAuth();
  const { currencyCode, currency, currencies, setCurrency } = useCurrency();
  const showHardwareIndicators = useShowHardwareIndicators();
  const colors = getThemeColors(isDark);

  // «Назад» из настроек всегда возвращает в Profile (ProfileMain).
  // navigate с merge-семантикой: если ProfileMain уже в стеке — попается до
  // него (стандартный кейс); если нет — пушится. Так же обрабатываем
  // Android-аппаратную кнопку.
  const handleBack = useCallback(() => {
    navigation.navigate('ProfileMain');
    return true;
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', handleBack);
      return () => sub.remove();
    }, [handleBack]),
  );

  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<string>('');
  const [exportProgress, setExportProgress] = useState<StreamingExportProgress | null>(null);
  const [importProgress, setImportProgress] = useState<StreamingImportProgress | null>(null);
  const [showStreamingExport, setShowStreamingExport] = useState(false);
  const [syncInterval, setSyncInterval] = useState(DEFAULT_SYNC_INTERVAL);
  const [showSyncIntervalPicker, setShowSyncIntervalPicker] = useState(false);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [currencySearch, setCurrencySearch] = useState('');

  // Только админ может менять валюту аккаунта — для ассистента это поле read-only.
  // Серверный PATCH /auth/me/currency также защищён ролью, но фронт скрывает
  // переключение заранее, чтобы UX был согласован.
  const canEditCurrency = isAdmin();

  const filteredCurrencies = React.useMemo(() => {
    const q = currencySearch.trim().toLowerCase();
    if (!q) return currencies;
    return currencies.filter(c =>
      c.code.toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q) ||
      c.symbol.toLowerCase().includes(q)
    );
  }, [currencies, currencySearch]);

  const handleSelectCurrency = async (code: string) => {
    try {
      await setCurrency(code);
    } catch (e) {
      console.warn('Failed to set currency:', e);
    }
    setShowCurrencyPicker(false);
    setCurrencySearch('');
  };

  // Загрузить сохранённый интервал при монтировании
  useEffect(() => {
    AsyncStorage.getItem(SYNC_INTERVAL_KEY).then(val => {
      if (val) setSyncInterval(parseInt(val, 10));
    });
  }, []);

  const handleSelectSyncInterval = async (value: number) => {
    setSyncInterval(value);
    await AsyncStorage.setItem(SYNC_INTERVAL_KEY, String(value));
    setShowSyncIntervalPicker(false);
  };

  const getSyncIntervalLabel = () => {
    const opt = SYNC_INTERVAL_OPTIONS.find(o => o.value === syncInterval);
    return opt ? opt.label : `${Math.round(syncInterval / 1000)} сек`;
  };

  const {
    clearDatabase,
    exportDatabase,
    shareExportedZip,
    pickAndImportZip,
    clearTransactions,
  } = useDatabase();

  const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

  const handleExport = async () => {
    Alert.alert(
      'Тип экспорта',
      'Выберите способ экспорта:',
      [
        { text: 'Обычный (ZIP)', onPress: handleStandardExport },
        { text: 'Большие объемы (Папка)', onPress: handleStreamingExport },
        { text: 'Отмена', style: 'cancel' }
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
        [{ text: 'ОК', onPress: () => setShowStreamingExport(false) }]
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
          message += `\n\n⚠️ Внимание: ${res.itemsWithoutPrice} товар(ов) импортированы без цены.`;
        }
        Alert.alert('Успех', message);
      } else {
        const message = res.message ?? 'cancelled';
        if (message !== 'cancelled') {
          Alert.alert('Ошибка импорта', String(message));
        }
      }
    } catch (e) {
      console.error('Import error:', e);
      Alert.alert('Ошибка', 'Не удалось импортировать файл: ' + String((e as any)?.message || e));
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
    Alert.alert(
      'Выбор файлов для импорта',
      'Начнем с items.csv',
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Выбрать файлы', onPress: () => pickMultipleFilesForImport() }
      ]
    );
  };

  const pickMultipleFilesForImport = async () => {
    try {
      const itemsResult = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', '*/*'],
        copyToCacheDirectory: true,
        multiple: false
      });

      if (itemsResult.canceled || !itemsResult.assets || itemsResult.assets.length === 0) return;

      const itemsUri = itemsResult.assets[0].uri;
      const itemsName = itemsResult.assets[0].name || '';

      if (!itemsName.toLowerCase().includes('items.csv')) {
        Alert.alert('Ошибка', 'Пожалуйста, выберите файл items.csv');
        return;
      }

      Alert.alert(
        'Выбрать transactions.csv?',
        'Хотите импортировать историю транзакций?',
        [
          { text: 'Пропустить', onPress: () => askForImages(itemsUri, null) },
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
      'Хотите загрузить изображения товаров?',
      [
        { text: 'Пропустить', onPress: () => proceedToImportWithFiles(itemsUri, transactionsUri, []) },
        { text: 'Выбрать', onPress: () => pickImages(itemsUri, transactionsUri) }
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
      }
      proceedToImportWithFiles(itemsUri, transactionsUri, imageUris);
    } catch (error) {
      console.error('Image pick error:', error);
      proceedToImportWithFiles(itemsUri, transactionsUri, []);
    }
  };

  const proceedToImportWithFiles = async (
    itemsUri: string,
    transactionsUri: string | null,
    imageUris: string[]
  ) => {
    setIsImporting(true);
    try {
      const tempImportDir = `${FileSystem.documentDirectory}temp_large_import_${Date.now()}/`;
      await FileSystem.makeDirectoryAsync(tempImportDir, { intermediates: true });
      const imagesDir = `${tempImportDir}images/`;
      await FileSystem.makeDirectoryAsync(imagesDir, { intermediates: true });

      await FileSystem.copyAsync({ from: itemsUri, to: `${tempImportDir}items.csv` });
      if (transactionsUri) {
        await FileSystem.copyAsync({ from: transactionsUri, to: `${tempImportDir}transactions.csv` });
      }

      for (let i = 0; i < imageUris.length; i++) {
        try {
          const imageUri = imageUris[i];
          let fileName = imageUri.split('/').pop() || `image_${i}.jpg`;
          try { fileName = decodeURIComponent(fileName); } catch (e) { }
          fileName = fileName.split('?')[0];
          await FileSystem.copyAsync({ from: imageUri, to: `${imagesDir}${fileName}` });
        } catch (imgError) {
          console.warn(`Failed to copy image ${i}:`, imgError);
        }
      }

      await handleLargeFileImport(tempImportDir);

      try {
        await FileSystem.deleteAsync(tempImportDir, { idempotent: true });
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
      const result = await streamingImportFromFolder(folderUri, (progress) => {
        setImportProgress(progress);
      });

      let message = '✅ Импорт завершён успешно!';
      if (result.imagesImported !== undefined && result.imagesTotal !== undefined) {
        if (result.imagesImported > 0) message += `\n\n📸 Изображения: ${result.imagesImported}`;
      }
      if (result.itemsWithoutPrice && result.itemsWithoutPrice > 0) {
        message += `\n\n🔴 ${result.itemsWithoutPrice} товар(ов) без цены`;
      }
      Alert.alert('Импорт завершён', message);
      setImportProgress(null);
    } catch (error) {
      console.error('Folder import error:', error);
      Alert.alert('Ошибка импорта', String((error as any)?.message || error));
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
              Alert.alert('Ошибка', 'Не удалось очистить историю');
            }
          }
        }
      ]
    );
  };

  const handleGenerateTestData = async () => {
    Alert.alert(
      'Генерация тестовых данных',
      'Это действие создаст 3000 товаров и 15000 транзакций для нагрузочного тестирования. Это может занять несколько минут. Продолжить?',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Генерировать',
          onPress: async () => {
            try {
              setIsGenerating(true);
              setGenerationProgress('Инициализация...');
              await sleep(500);

              await generateLocalTestData((msg) => {
                setGenerationProgress(msg);
              });

              Alert.alert('Успех', 'Тестовые данные успешно сгенерированы! Теперь можно тестировать синхронизацию.');
            } catch (error) {
              Alert.alert('Ошибка', 'Не удалось сгенерировать данные: ' + String((error as any)?.message || error));
            } finally {
              setIsGenerating(false);
              setGenerationProgress('');
            }
          }
        }
      ]
    );
  };

  const handleDownloadLogs = async () => {
    try {
      await LogService.shareLogsFile();
    } catch (error: any) {
      Alert.alert('Ошибка', error.message || 'Не удалось экспортировать логи');
    }
  };

  const handleDiagnoseImages = async () => {
    try {
      const result = await SyncService.diagnosePendingImages();

      let message = `📊 Статистика изображений:\n\n`;
      message += `📤 Всего к загрузке: ${result.total}\n`;
      message += `✅ Готовы к отправке: ${result.ready}\n`;
      message += `❌ Отсутствуют: ${result.missing}\n`;

      if (result.missingItems.length > 0) {
        message += `\n🗑️ Поврежденные/отсутствующие:\n`;
        // Показать первые 10
        const shown = result.missingItems.slice(0, 10);
        shown.forEach(item => {
          message += `• ${item.name} (ID: ${item.id})\n`;
        });
        if (result.missingItems.length > 10) {
          message += `... и ещё ${result.missingItems.length - 10} товаров`;
        }
      }

      Alert.alert('Диагностика изображений', message);
    } catch (error: any) {
      Alert.alert('Ошибка', error.message || 'Не удалось проверить изображения');
    }
  };

  const handleDeleteAccount = async () => {
    Alert.alert(
      '⚠️ Удаление аккаунта',
      'Вы уверены, что хотите удалить свой аккаунт?\n\nВсе ваши данные будут удалены:\n• Товары\n• История транзакций\n• Ассистенты\n• Подписки\n\nЭто действие нельзя отменить!',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить аккаунт',
          style: 'destructive',
          onPress: async () => {
            try {
              await SyncService.deleteAccount();
              Alert.alert('Аккаунт удалён', 'Ваш аккаунт и все данные были удалены.');
            } catch (error: any) {
              Alert.alert('Ошибка', error.message || 'Не удалось удалить аккаунт');
            }
          },
        },
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
  }> = ({ icon, title, description, onPress, color = colors.primary.blue, destructive = false }) => (
    <TouchableOpacity
      style={[
        styles.settingItem,
        { backgroundColor: colors.background.card, borderColor: colors.border.light },
        destructive && { borderColor: '#ef4444' }
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.iconContainer, { backgroundColor: `${color}20` }]}>
        <MaterialIcons name={icon} size={24} color={color} />
      </View>
      <View style={styles.settingContent}>
        <Text style={[styles.settingTitle, { color: colors.text.normal }, destructive && { color: '#ef4444' }]}>
          {title}
        </Text>
        <Text style={[styles.settingDescription, { color: colors.text.muted }]}>{description}</Text>
      </View>
      <MaterialIcons name="chevron-right" size={24} color={colors.text.muted} />
    </TouchableOpacity>
  );

  const SectionHeader: React.FC<{ title: string }> = ({ title }) => (
    <Text style={[styles.sectionHeader, { color: colors.text.normal }]}>{title}</Text>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.screen }]}>
      <View style={[styles.header, { backgroundColor: colors.background.card, borderBottomColor: colors.border.light }]}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text.normal} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text.normal }]}>Настройки</Text>
        <MaterialIcons name="settings" size={24} color={isDark ? colors.primary.gold : colors.primary.purple} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        <SectionHeader title="Каталоги" />

        <SettingItem
          icon="category"
          title="Каталоги товаров"
          description="Создайте свои каталоги, размерные ряды и шаблоны под сферу бизнеса"
          onPress={() => (navigation as any).navigate('Catalogs')}
          color={isDark ? '#fbbf24' : '#f59e0b'}
        />

        <SectionHeader title="Оборудование" />

        <SettingItem
          icon="print"
          title="Принтер этикеток"
          description="Подключение Bluetooth-принтера для печати штрихкодов (XPrinter)"
          onPress={() => (navigation as any).navigate('PrinterSettings')}
          color={isDark ? '#22d3ee' : '#06b6d4'}
        />

        <SettingItem
          icon="qr-code-scanner"
          title="Сканер штрихкодов"
          description="Внешний HID-сканер (XB-6208RB / XB-D66 / XB-M82)"
          onPress={() => (navigation as any).navigate('ScannerSettings')}
          color={isDark ? '#34d399' : '#10b981'}
        />

        {/* Тогл «показывать индикаторы оборудования в нижней панели». Когда
            включён — рядом с кнопкой «Синхр.» появляются две маленькие иконки
            (сканер и принтер) с цветовым статусом. Тап по иконке открывает
            соответствующий экран настроек. */}
        <View
          style={[
            styles.settingItem,
            { backgroundColor: colors.background.card, borderColor: colors.border.light },
          ]}
        >
          <View style={[styles.iconContainer, { backgroundColor: 'rgba(99, 102, 241, 0.12)' }]}>
            <MaterialIcons name="dashboard-customize" size={24} color={isDark ? '#818cf8' : '#6366f1'} />
          </View>
          <View style={styles.settingContent}>
            <Text style={[styles.settingTitle, { color: colors.text.normal }]}>
              Индикаторы в панели
            </Text>
            <Text style={[styles.settingDescription, { color: colors.text.muted }]}>
              Показывать статус сканера и принтера рядом с кнопкой «Синхр.»
            </Text>
          </View>
          <Switch
            value={showHardwareIndicators}
            onValueChange={(v) => setShowHardwareIndicators(v)}
            trackColor={{
              false: isDark ? '#374151' : '#d1d5db',
              true: isDark ? '#d4af37' : '#3b82f6',
            }}
            thumbColor="#ffffff"
          />
        </View>

        <SectionHeader title="Региональные настройки" />

        <TouchableOpacity
          style={[
            styles.settingItem,
            { backgroundColor: colors.background.card, borderColor: colors.border.light },
            !canEditCurrency && { opacity: 0.7 },
          ]}
          onPress={() => {
            if (!canEditCurrency) {
              Alert.alert('Только для администратора', 'Валюту может менять только владелец аккаунта.');
              return;
            }
            setShowCurrencyPicker(true);
          }}
          activeOpacity={0.7}
        >
          <View style={[styles.iconContainer, { backgroundColor: 'rgba(245, 158, 11, 0.12)' }]}>
            <MaterialIcons name="payments" size={24} color={isDark ? '#fbbf24' : '#f59e0b'} />
          </View>
          <View style={styles.settingContent}>
            <Text style={[styles.settingTitle, { color: colors.text.normal }]}>Валюта</Text>
            <Text style={[styles.settingDescription, { color: colors.text.muted }]}>
              {currency.name} ({currencyCode} · {currency.shortLabel})
            </Text>
          </View>
          <MaterialIcons name="chevron-right" size={24} color={colors.text.muted} />
        </TouchableOpacity>

        <SectionHeader title="Синхронизация" />

        <TouchableOpacity
          style={[
            styles.settingItem,
            { backgroundColor: colors.background.card, borderColor: colors.border.light }
          ]}
          onPress={() => setShowSyncIntervalPicker(true)}
          activeOpacity={0.7}
        >
          <View style={[styles.iconContainer, { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
            <MaterialIcons name="timer" size={24} color="#10b981" />
          </View>
          <View style={styles.settingContent}>
            <Text style={[styles.settingTitle, { color: colors.text.normal }]}>Интервал автосинхронизации</Text>
            <Text style={[styles.settingDescription, { color: colors.text.muted }]}>
              Текущий: {getSyncIntervalLabel()}
            </Text>
          </View>
          <MaterialIcons name="chevron-right" size={24} color={colors.text.muted} />
        </TouchableOpacity>

        {/* === Данные — временно отключено для прода ===
        <SectionHeader title="Данные" />

        <SettingItem
          icon="file-download"
          title="Экспорт данных"
          description="Создать ZIP архив с товарами и изображениями"
          onPress={handleExport}
          color={isDark ? '#60a5fa' : '#3b82f6'}
        />

        <SettingItem
          icon="file-upload"
          title="Импорт данных (ZIP)"
          description="Для ZIP файлов до 30MB - быстрый импорт"
          onPress={handleImport}
          color={isDark ? '#a78bfa' : '#8b5cf6'}
        />

        <SettingItem
          icon="folder-open"
          title="Импорт больших данных"
          description="Для файлов >30MB - выбор файлов по очереди"
          onPress={handleLargeImport}
          color={isDark ? '#22d3ee' : '#06b6d4'}
        />

        {/* Временно отключено
        <SectionHeader title="Тестирование" />

        <SettingItem
          icon="science"
          title="Сгенерировать тест-данные"
          description="3000 товаров + 15000 транзакций (Load Test)"
          onPress={handleGenerateTestData}
          color="#ec4899"
        />
        * /}

        === Очистка — временно отключено для прода ===
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
        === конец закомментированного блока === */}

        <SectionHeader title="Отладка" />

        <SettingItem
          icon="bug-report"
          title="Скачать логи"
          description="Экспортировать логи приложения для отладки"
          onPress={handleDownloadLogs}
          color={isDark ? '#10b981' : '#059669'}
        />

        <SettingItem
          icon="image-search"
          title="Диагностика изображений"
          description="Проверить какие изображения готовы к отправке"
          onPress={handleDiagnoseImages}
          color={isDark ? '#f59e0b' : '#d97706'}
        />

        <SectionHeader title="Правовая информация" />

        <SettingItem
          icon="privacy-tip"
          title="Политика конфиденциальности"
          description="Как мы обрабатываем ваши данные"
          onPress={() => Linking.openURL('https://policy-warehouse.intelligent.tj')}
          color={isDark ? '#818cf8' : '#6366f1'}
        />

        <SettingItem
          icon="support"
          title="Поддержка"
          description="Свяжитесь с нами для решения вопросов"
          onPress={() => Linking.openURL('https://support-warehouse.intelligent.tj')}
          color={isDark ? '#34d399' : '#10b981'}
        />

        {/* Удаление аккаунта - только для администраторов */}
        {isAdmin() && (
          <>
            <SectionHeader title="Аккаунт" />

            <SettingItem
              icon="person-remove"
              title="Удалить аккаунт"
              description="Удалить аккаунт и все данные безвозвратно"
              onPress={handleDeleteAccount}
              color="#dc2626"
              destructive
            />
          </>
        )}

        <SectionHeader title="О приложении" />

        <View style={[styles.appInfo, { backgroundColor: colors.background.card }]}>
          <Text style={[styles.appName, { color: colors.text.normal }]}>Norov</Text>
          <Text style={[styles.appVersion, { color: colors.text.muted }]}>Версия 1.0.6</Text>
          <Text style={[styles.appDescription, { color: colors.text.muted }]}>
            Система управления складскими запасами с современным интерфейсом и аналитикой созданно командой NOROV
          </Text>
        </View>
      </ScrollView>

      {/* Modals and Overlays */}
      <Modal visible={isExporting} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background.card }]}>
            <ActivityIndicator size="large" color={colors.primary.blue} />
            <Text style={[styles.modalText, { color: colors.text.normal }]}>Выполняется экспорт...</Text>
          </View>
        </View>
      </Modal>

      <Modal visible={isImporting && !importProgress} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background.card }]}>
            <ActivityIndicator size="large" color={colors.primary.blue} />
            <Text style={[styles.modalText, { color: colors.text.normal }]}>Выполняется импорт...</Text>
          </View>
        </View>
      </Modal>

      <Modal visible={isImporting && !!importProgress} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { width: '80%', backgroundColor: colors.background.card }]}>
            <Text style={[styles.modalText, { marginBottom: 20, color: colors.text.normal }]}>Импорт больших данных</Text>
            {importProgress && (
              <>
                <Text style={{ marginBottom: 10, textAlign: 'center', color: colors.text.normal }}>{importProgress.message}</Text>
                <ActivityIndicator size="large" color={colors.primary.blue} style={{ marginTop: 20 }} />
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={showStreamingExport} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { width: '80%', backgroundColor: colors.background.card }]}>
            <Text style={[styles.modalText, { marginBottom: 20, color: colors.text.normal }]}>Экспорт больших данных</Text>
            {exportProgress && (
              <>
                <Text style={{ marginBottom: 10, textAlign: 'center', color: colors.text.normal }}>{exportProgress.message}</Text>
                <ActivityIndicator size="large" color={colors.primary.blue} style={{ marginTop: 20 }} />
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={isGenerating} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { width: '80%', backgroundColor: colors.background.card }]}>
            <ActivityIndicator size="large" color="#ec4899" />
            <Text style={[styles.modalText, { marginTop: 20, textAlign: 'center', color: colors.text.normal }]}>
              {generationProgress}
            </Text>
            <Text style={{ marginTop: 10, color: colors.text.muted, fontSize: 12, textAlign: 'center' }}>
              Пожалуйста, не закрывайте приложение
            </Text>
          </View>
        </View>
      </Modal>

      {/* Currency Picker Modal */}
      <Modal visible={showCurrencyPicker} transparent animationType="fade" onRequestClose={() => setShowCurrencyPicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.currencyPickerContent, { backgroundColor: colors.background.card }]}>
            <View style={styles.currencyPickerHeader}>
              <Text style={[styles.intervalPickerTitle, { color: colors.text.normal, marginBottom: 0 }]}>Выбор валюты</Text>
              <TouchableOpacity onPress={() => { setShowCurrencyPicker(false); setCurrencySearch(''); }}>
                <MaterialIcons name="close" size={24} color={colors.text.muted} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={[styles.currencySearchInput, {
                color: colors.text.normal,
                borderColor: colors.border.light,
                backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
              }]}
              placeholder="Поиск (код, название, символ)..."
              placeholderTextColor={colors.text.muted}
              value={currencySearch}
              onChangeText={setCurrencySearch}
              autoCorrect={false}
              autoCapitalize="characters"
            />
            <FlatList
              data={filteredCurrencies}
              keyExtractor={c => c.code}
              keyboardShouldPersistTaps="handled"
              style={styles.currencyList}
              renderItem={({ item }) => {
                const selected = item.code === currencyCode;
                return (
                  <TouchableOpacity
                    style={[
                      styles.currencyOption,
                      { borderBottomColor: colors.border.light },
                      selected && {
                        backgroundColor: isDark ? 'rgba(212, 175, 55, 0.15)' : 'rgba(59, 130, 246, 0.08)'
                      }
                    ]}
                    onPress={() => handleSelectCurrency(item.code)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[
                        styles.currencyOptionTitle,
                        { color: colors.text.normal },
                        selected && { color: isDark ? '#d4af37' : '#3b82f6', fontWeight: '700' }
                      ]}>
                        {item.code} · {item.symbol}
                      </Text>
                      <Text style={[styles.currencyOptionSub, { color: colors.text.muted }]} numberOfLines={1}>
                        {item.name}
                      </Text>
                    </View>
                    {selected && (
                      <MaterialIcons name="check" size={20} color={isDark ? '#d4af37' : '#3b82f6'} />
                    )}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <Text style={{ textAlign: 'center', color: colors.text.muted, padding: 24 }}>
                  Ничего не найдено
                </Text>
              }
            />
          </View>
        </View>
      </Modal>

      {/* Sync Interval Picker Modal */}
      <Modal visible={showSyncIntervalPicker} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowSyncIntervalPicker(false)}
        >
          <View style={[styles.intervalPickerContent, { backgroundColor: colors.background.card }]}>
            <Text style={[styles.intervalPickerTitle, { color: colors.text.normal }]}>
              Интервал автосинхронизации
            </Text>
            {SYNC_INTERVAL_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.intervalOption,
                  { borderBottomColor: colors.border.light },
                  syncInterval === opt.value && {
                    backgroundColor: isDark ? 'rgba(212, 175, 55, 0.15)' : 'rgba(59, 130, 246, 0.08)'
                  }
                ]}
                onPress={() => handleSelectSyncInterval(opt.value)}
              >
                <Text style={[
                  styles.intervalOptionText,
                  { color: colors.text.normal },
                  syncInterval === opt.value && { fontWeight: '700', color: isDark ? '#d4af37' : '#3b82f6' }
                ]}>
                  {opt.label}
                </Text>
                {syncInterval === opt.value && (
                  <MaterialIcons name="check" size={20} color={isDark ? '#d4af37' : '#3b82f6'} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingTop: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
    marginRight: 32, // Compensate for back button to center title
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
    marginTop: 24,
    marginBottom: 12,
    marginLeft: 4,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
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
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
  },
  appInfo: {
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
    marginBottom: 4,
  },
  appVersion: {
    fontSize: 14,
    marginBottom: 12,
  },
  appDescription: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: 220,
    padding: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '600',
  },
  intervalPickerContent: {
    width: '80%',
    borderRadius: 16,
    padding: 20,
    maxWidth: 400,
  },
  intervalPickerTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
  },
  intervalOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
  },
  intervalOptionText: {
    fontSize: 16,
  },
  currencyPickerContent: {
    width: '90%',
    maxWidth: 480,
    maxHeight: '80%',
    borderRadius: 16,
    padding: 16,
  },
  currencyPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingBottom: 12,
  },
  currencySearchInput: {
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    marginBottom: 8,
    fontSize: 14,
  },
  currencyList: {
    maxHeight: 480,
  },
  currencyOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
  },
  currencyOptionTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  currencyOptionSub: {
    fontSize: 12,
    marginTop: 2,
  },
});

export default SettingsScreen;
