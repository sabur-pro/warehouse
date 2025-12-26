import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  Animated,
  Modal,
  TextInput,
  RefreshControl,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { getThemeColors } from '../../constants/theme';
import { useDatabase, ImportResult } from '../../hooks/useDatabase';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  streamingExportDatabase,
  StreamingExportProgress,
} from '../../database/streamingImportExport';
import AssistantService, { Assistant } from '../services/AssistantService';
import SubscriptionService, { Subscription } from '../services/SubscriptionService';
import { useSyncRefresh } from '../components/sync/SyncStatusBar';
import LogService from '../services/LogService';

type ProfileStackParamList = {
  ProfileMain: undefined;
  Subscription: undefined;
};

export default function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const { user, signOut, isAdmin } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const colors = getThemeColors(isDark);
  const [showSettings, setShowSettings] = useState(false);
  const [showAddAssistant, setShowAddAssistant] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Database operations
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<StreamingExportProgress | null>(null);
  const [showStreamingExport, setShowStreamingExport] = useState(false);

  // Assistants
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [loadingAssistants, setLoadingAssistants] = useState(false);
  const [addingAssistant, setAddingAssistant] = useState(false);

  // Subscription
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loadingSubscription, setLoadingSubscription] = useState(false);

  // Add assistant form
  const [assistantLogin, setAssistantLogin] = useState('');
  const [assistantPassword, setAssistantPassword] = useState('');
  const [assistantPhone, setAssistantPhone] = useState('');

  const {
    clearDatabase,
    exportDatabase,
    shareExportedZip,
    pickAndImportZip,
    clearTransactions,
  } = useDatabase();

  // Анимации
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 40,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 40,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();

    if (isAdmin()) {
      loadAssistants();
      loadSubscription();
    }
  }, [user]);

  const loadAssistants = async () => {
    try {
      setLoadingAssistants(true);
      const response = await AssistantService.getAssistants({ page: 1, limit: 10 });
      setAssistants(response.data);
    } catch (error: any) {
      console.error('Load assistants error:', error);
    } finally {
      setLoadingAssistants(false);
    }
  };

  const loadSubscription = async () => {
    try {
      setLoadingSubscription(true);
      const data = await SubscriptionService.getSubscription();
      setSubscription(data);
    } catch (error: any) {
      console.log('No subscription found');
      setSubscription(null);
    } finally {
      setLoadingSubscription(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    if (isAdmin()) {
      await Promise.all([loadAssistants(), loadSubscription()]);
    }
    setRefreshing(false);
  };

  // === АВТОМАТИЧЕСКОЕ ОБНОВЛЕНИЕ ПОСЛЕ СИНХРОНИЗАЦИИ ===
  const handleSyncRefresh = useCallback(() => {
    console.log('🔄 ProfileScreen: sync completed, reloading data...');
    onRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useSyncRefresh('ProfileScreen', handleSyncRefresh);

  const handleAddAssistant = async () => {
    if (!assistantLogin || !assistantPassword || !assistantPhone) {
      Alert.alert('Ошибка', 'Заполните все поля');
      return;
    }

    if (assistantPhone && !assistantPhone.startsWith('+')) {
      Alert.alert('Ошибка', 'Телефон должен начинаться с +');
      return;
    }

    setAddingAssistant(true);
    try {
      const response = await AssistantService.createAssistant({
        login: assistantLogin,
        password: assistantPassword,
        phone: assistantPhone,
      });

      // Сохраняем токены ассистента для будущего переключения
      await saveAssistantTokens(assistantLogin, response.access_token, response.refresh_token);

      Alert.alert('Успешно', 'Ассистент создан');
      setShowAddAssistant(false);
      setAssistantLogin('');
      setAssistantPassword('');
      setAssistantPhone('');

      // Обновляем список
      await loadAssistants();
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Ошибка при создании ассистента';
      Alert.alert('Ошибка', errorMessage);
    } finally {
      setAddingAssistant(false);
    }
  };

  const saveAssistantTokens = async (login: string, accessToken: string, refreshToken: string) => {
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const assistantsTokens = await AsyncStorage.getItem('assistants_tokens');
      const tokens = assistantsTokens ? JSON.parse(assistantsTokens) : {};

      tokens[login] = {
        access_token: accessToken,
        refresh_token: refreshToken,
        saved_at: new Date().toISOString(),
      };

      await AsyncStorage.setItem('assistants_tokens', JSON.stringify(tokens));
    } catch (error) {
      console.error('Save assistant tokens error:', error);
    }
  };

  const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

  // Database operations (from old SettingsScreen)
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
      }
    } catch (e) {
      console.error('Import error:', e);
      Alert.alert('Ошибка', 'Не удалось импортировать файл');
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

  const handleShareLogs = async () => {
    try {
      const logsCount = LogService.getLogsCount();
      if (logsCount === 0) {
        Alert.alert('Нет логов', 'Логи пока не были записаны');
        return;
      }
      await LogService.shareLogsFile();
    } catch (error: any) {
      Alert.alert('Ошибка', error.message || 'Не удалось экспортировать логи');
    }
  };

  const handleSignOut = () => {
    Alert.alert(
      'Выход',
      'Вы уверены, что хотите выйти из системы?',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Выйти',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut();
            } catch (error: any) {
              console.error('Sign out error:', error);
            }
          },
        },
      ]
    );
  };

  if (!user) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Данные пользователя недоступны</Text>
      </View>
    );
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return colors.primary.blue;
      case 'pending':
        return '#f59e0b';
      case 'fail':
        return '#ef4444';
      default:
        return '#666';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active':
        return 'Активна';
      case 'pending':
        return 'На проверке';
      case 'fail':
        return 'Отклонена';
      default:
        return status;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return 'check-circle';
      case 'pending':
        return 'schedule';
      case 'fail':
        return 'cancel';
      default:
        return 'info';
    }
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
      style={[styles.settingItem, { backgroundColor: colors.background.card, borderColor: colors.border.light }, destructive && styles.destructiveItem]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.settingIconContainer, { backgroundColor: `${color}20` }]}>
        <MaterialIcons name={icon} size={24} color={color} />
      </View>
      <View style={styles.settingContent}>
        <Text style={[styles.settingTitle, { color: colors.text.normal }, destructive && styles.destructiveText]}>
          {title}
        </Text>
        <Text style={[styles.settingDescription, { color: colors.text.muted }]}>{description}</Text>
      </View>
      <MaterialIcons name="chevron-right" size={24} color={colors.text.muted} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.screen }]} edges={['top']}>
      <ScrollView
        style={{ flex: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary.blue}
            colors={isDark ? [colors.primary.gold, colors.primary.blue] : colors.gradients.main as any}
          />
        }
      >
        <LinearGradient
          colors={isDark ? colors.gradients.accent : colors.gradients.main}
          style={styles.headerGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Animated.View
            style={[
              styles.profileCard,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
              },
            ]}
          >
            <View style={styles.avatarContainer}>
              <Text style={styles.avatarText}>
                {user.role === 'ASSISTANT'
                  ? (user.login?.[0] || 'A').toUpperCase()
                  : (user.gmail?.[0] || 'U').toUpperCase()
                }
              </Text>
            </View>
            <Text style={styles.name}>
              {user.role === 'ASSISTANT' ? user.login : user.gmail}
            </Text>
            <View style={styles.roleBadge}>
              <MaterialIcons
                name={user.role === 'ASSISTANT' ? 'person' : 'verified-user'}
                size={16}
                color="#fff"
              />
              <Text style={styles.roleText}>{user.role === 'ASSISTANT' ? 'Ассистент' : 'Администратор'}</Text>
            </View>
          </Animated.View>
        </LinearGradient>

        <View style={[styles.content, { backgroundColor: colors.background.screen }]}>
          {/* Быстрые действия */}
          <View style={styles.quickActions}>
            {isAdmin() && (
              <TouchableOpacity
                style={[styles.quickAction, { backgroundColor: colors.background.card }]}
                onPress={() => navigation.navigate('PendingActions' as any)}
              >
                <MaterialIcons name="assignment" size={24} color="#f59e0b" />
                <Text style={[styles.quickActionText, { color: colors.text.normal }]}>Заявки</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.quickAction, { backgroundColor: colors.background.card }]}
              onPress={() => setShowSettings(true)}
            >
              <MaterialIcons name="settings" size={24} color={isDark ? colors.primary.gold : colors.primary.purple} />
              <Text style={[styles.quickActionText, { color: colors.text.normal }]}>Настройки</Text>
            </TouchableOpacity>
            {isAdmin() && assistants.length === 0 && (
              <TouchableOpacity
                style={[styles.quickAction, { backgroundColor: colors.background.card }]}
                onPress={() => setShowAddAssistant(true)}
              >
                <MaterialIcons name="person-add" size={24} color={colors.primary.blue} />
                <Text style={[styles.quickActionText, { color: colors.primary.blue }]}>Ассистент</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.quickAction, { backgroundColor: colors.background.card }]}
              onPress={handleSignOut}
            >
              <MaterialIcons name="exit-to-app" size={24} color="#ef4444" />
              <Text style={[styles.quickActionText, { color: '#ef4444' }]}>Выйти</Text>
            </TouchableOpacity>
          </View>

          {/* Список ассистентов - только для администраторов */}
          {isAdmin() && assistants.length > 0 && (
            <View style={[styles.infoSection, { backgroundColor: colors.background.card }]}>
              <Text style={[styles.sectionTitle, { color: colors.text.normal }]}>
                <MaterialIcons name="people" size={20} color={colors.primary.blue} /> Ассистенты
              </Text>

              {loadingAssistants ? (
                <ActivityIndicator color={colors.primary.blue} style={{ marginVertical: 20 }} />
              ) : (
                assistants.map((assistant) => (
                  <View key={assistant.id} style={[styles.assistantItem, { borderBottomColor: colors.border.light }]}>
                    <View style={[styles.assistantIcon, { backgroundColor: isDark ? 'rgba(59, 188, 255, 0.2)' : '#f0f0ff' }]}>
                      <MaterialIcons name="person" size={24} color={colors.primary.blue} />
                    </View>
                    <View style={styles.assistantInfo}>
                      <Text style={[styles.assistantLogin, { color: colors.text.normal }]}>{assistant.login}</Text>
                      <Text style={[styles.assistantPhone, { color: colors.text.muted }]}>{assistant.phone}</Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}

          {/* Подписка - только для администраторов */}
          {isAdmin() && (
            loadingSubscription ? (
              <View style={[styles.subscriptionCard, { backgroundColor: colors.background.card }]}>
                <ActivityIndicator color={isDark ? colors.primary.gold : colors.primary.purple} />
              </View>
            ) : subscription ? (
              <View style={styles.subscriptionInfoCard}>
                <LinearGradient
                  colors={isDark ? ['#2d2d2d', '#1a1a1a'] : ['#EFF6FF', '#DBEAFE']}
                  style={styles.subscriptionGradientCard}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <View style={styles.subscriptionHeader}>
                    <View style={[styles.premiumIconContainer, {
                      backgroundColor: isDark ? 'rgba(212, 175, 55, 0.15)' : 'rgba(147, 51, 234, 0.1)'
                    }]}>
                      <MaterialIcons
                        name="workspace-premium"
                        size={32}
                        color={isDark ? colors.primary.gold : colors.primary.purple}
                      />
                    </View>
                    <Text style={[styles.subscriptionHeaderTitle, { color: colors.text.normal }]}>
                      Премиум Подписка
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: `${getStatusColor(subscription.status)}20` },
                    ]}
                  >
                    <MaterialIcons
                      name={getStatusIcon(subscription.status) as any}
                      size={20}
                      color={getStatusColor(subscription.status)}
                    />
                    <Text style={[styles.statusText, { color: getStatusColor(subscription.status) }]}>
                      {getStatusText(subscription.status)}
                    </Text>
                  </View>

                  <View style={styles.subscriptionDetails}>
                    <View style={styles.detailRow}>
                      <View style={[styles.detailIconContainer, {
                        backgroundColor: isDark ? 'rgba(59, 188, 255, 0.15)' : 'rgba(59, 130, 246, 0.1)'
                      }]}>
                        <MaterialIcons
                          name="calendar-today"
                          size={18}
                          color={isDark ? colors.primary.blue : colors.primary.blue}
                        />
                      </View>
                      <View style={styles.detailTextContainer}>
                        <Text style={[styles.detailLabel, { color: colors.text.muted }]}>Начало</Text>
                        <Text style={[styles.detailValue, { color: colors.text.normal }]}>{formatDate(subscription.start_date)}</Text>
                      </View>
                    </View>

                    <View style={styles.detailRow}>
                      <View style={[styles.detailIconContainer, {
                        backgroundColor: isDark ? 'rgba(154, 111, 232, 0.15)' : 'rgba(147, 51, 234, 0.1)'
                      }]}>
                        <MaterialIcons
                          name="event"
                          size={18}
                          color={isDark ? colors.primary.purple : colors.primary.purple}
                        />
                      </View>
                      <View style={styles.detailTextContainer}>
                        <Text style={[styles.detailLabel, { color: colors.text.muted }]}>Окончание</Text>
                        <Text style={[styles.detailValue, { color: colors.text.normal }]}>{formatDate(subscription.end_date)}</Text>
                      </View>
                    </View>

                    <View style={styles.detailRow}>
                      <View style={[styles.detailIconContainer, {
                        backgroundColor: isDark ? 'rgba(212, 175, 55, 0.15)' : 'rgba(147, 51, 234, 0.1)'
                      }]}>
                        <MaterialIcons
                          name="payments"
                          size={18}
                          color={isDark ? colors.primary.gold : colors.primary.purple}
                        />
                      </View>
                      <View style={styles.detailTextContainer}>
                        <Text style={[styles.detailLabel, { color: colors.text.muted }]}>Стоимость</Text>
                        <Text style={[styles.detailValue, { color: colors.text.normal }]}>{subscription.price} сомонӣ</Text>
                      </View>
                    </View>
                  </View>
                </LinearGradient>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.subscriptionCard}
                onPress={() => navigation.navigate('Subscription' as any)}
              >
                <LinearGradient
                  colors={isDark
                    ? ['#2d2d2d', '#3a3528']
                    : ['#3b82f6', '#8b5cf6']
                  }
                  style={styles.subscriptionGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <View style={styles.subscriptionContent}>
                    <View style={[styles.subscriptionIconContainer, {
                      backgroundColor: 'rgba(255, 255, 255, 0.2)'
                    }]}>
                      <MaterialIcons name="workspace-premium" size={32} color="#fff" />
                    </View>
                    <View style={styles.subscriptionTextContainer}>
                      <Text style={styles.subscriptionTitle}>Получить подписку</Text>
                      <Text style={styles.subscriptionSubtitle}>
                        Получите полный доступ к функциям
                      </Text>
                    </View>
                    <MaterialIcons name="arrow-forward-ios" size={20} color="#fff" />
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            )
          )}


          {/* О приложении */}
          <View style={[styles.appInfo, { backgroundColor: colors.background.card }]}>
            <MaterialIcons name="inventory-2" size={40} color={isDark ? colors.primary.gold : colors.primary.blue} />
            <Text style={[styles.appName, { color: colors.text.normal }]}>Склад</Text>
            <Text style={[styles.appVersion, { color: colors.text.muted }]}>Версия 1.0.3</Text>
            <Text style={[styles.appDescription, { color: colors.text.muted }]}>
              Система управления складскими запасами
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Modal для добавления ассистента */}
      <Modal
        visible={showAddAssistant}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddAssistant(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.background.screen }]}>
          <View style={[styles.modalHeader, { backgroundColor: colors.background.card, borderBottomColor: colors.border.normal }]}>
            <Text style={[styles.modalTitle, { color: colors.text.normal }]}>Добавить ассистента</Text>
            <TouchableOpacity onPress={() => setShowAddAssistant(false)}>
              <MaterialIcons name="close" size={28} color={colors.text.normal} />
            </TouchableOpacity>
          </View>

          <ScrollView style={[styles.modalContent, { backgroundColor: colors.background.screen }]}>
            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: colors.text.normal }]}>Логин</Text>
              <View style={[styles.inputWrapper, { backgroundColor: colors.background.card, borderColor: colors.border.normal }]}>
                <MaterialIcons name="person" size={20} color={colors.primary.blue} style={styles.inputIconLeft} />
                <TextInput
                  style={[styles.formInput, { color: colors.text.normal }]}
                  placeholder="Введите логин"
                  placeholderTextColor={colors.text.muted}
                  value={assistantLogin}
                  onChangeText={setAssistantLogin}
                  autoCapitalize="none"
                  editable={!addingAssistant}
                />
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: colors.text.normal }]}>Пароль</Text>
              <View style={[styles.inputWrapper, { backgroundColor: colors.background.card, borderColor: colors.border.normal }]}>
                <MaterialIcons name="lock" size={20} color="#10b981" style={styles.inputIconLeft} />
                <TextInput
                  style={[styles.formInput, { color: colors.text.normal }]}
                  placeholder="Введите пароль"
                  placeholderTextColor={colors.text.muted}
                  value={assistantPassword}
                  onChangeText={setAssistantPassword}
                  secureTextEntry
                  editable={!addingAssistant}
                />
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: colors.text.normal }]}>Телефон</Text>
              <View style={[styles.inputWrapper, { backgroundColor: colors.background.card, borderColor: colors.border.normal }]}>
                <MaterialIcons name="phone" size={20} color="#10b981" style={styles.inputIconLeft} />
                <TextInput
                  style={[styles.formInput, { color: colors.text.normal }]}
                  placeholder="+992XXXXXXXXX"
                  placeholderTextColor={colors.text.muted}
                  value={assistantPhone}
                  onChangeText={setAssistantPhone}
                  keyboardType="phone-pad"
                  editable={!addingAssistant}
                />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.addButton, addingAssistant && styles.addButtonDisabled]}
              onPress={handleAddAssistant}
              disabled={addingAssistant}
            >
              {addingAssistant ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <MaterialIcons name="person-add" size={20} color="#fff" />
                  <Text style={styles.addButtonText}>Создать ассистента</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* Modal для настроек */}
      <Modal
        visible={showSettings}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowSettings(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.background.screen }]}>
          <View style={[styles.modalHeader, { backgroundColor: colors.background.card, borderBottomColor: colors.border.normal }]}>
            <Text style={[styles.modalTitle, { color: colors.text.normal }]}>Настройки</Text>
            <TouchableOpacity onPress={() => setShowSettings(false)}>
              <MaterialIcons name="close" size={28} color={colors.text.normal} />
            </TouchableOpacity>
          </View>

          <ScrollView style={[styles.modalContent, { backgroundColor: colors.background.screen }]}>
            <Text style={[styles.modalSectionTitle, { color: colors.text.normal }]}>Внешний вид</Text>

            <View style={[styles.settingItem, { backgroundColor: colors.background.card, borderColor: colors.border.light }]}>
              <View style={[styles.settingIconContainer, { backgroundColor: isDark ? 'rgba(212, 175, 55, 0.2)' : `${colors.primary.purple}20` }]}>
                <MaterialIcons name={isDark ? "dark-mode" : "light-mode"} size={24} color={isDark ? colors.primary.gold : colors.primary.purple} />
              </View>
              <View style={styles.settingContent}>
                <Text style={[styles.settingTitle, { color: colors.text.normal }]}>
                  Темная тема
                </Text>
                <Text style={[styles.settingDescription, { color: colors.text.muted }]}>
                  {isDark ? 'Темное оформление включено' : 'Светлое оформление'}
                </Text>
              </View>
              <Switch
                value={isDark}
                onValueChange={toggleTheme}
                trackColor={{ false: '#d1d5db', true: colors.primary.gold }}
                thumbColor={isDark ? colors.primary.lightGold : '#f3f4f6'}
                ios_backgroundColor="#d1d5db"
              />
            </View>

            <Text style={[styles.modalSectionTitle, { color: colors.text.normal }]}>Данные</Text>

            <SettingItem
              icon="file-download"
              title="Экспорт данных"
              description="Создать ZIP архив с товарами"
              onPress={handleExport}
              color="#3b82f6"
            />

            <SettingItem
              icon="file-upload"
              title="Импорт данных"
              description="Загрузить данные из ZIP файла"
              onPress={handleImport}
              color="#8b5cf6"
            />

            <SettingItem
              icon="bug-report"
              title="Скачать логи"
              description="Экспорт логов для отладки"
              onPress={handleShareLogs}
              color="#10b981"
            />

            <Text style={[styles.modalSectionTitle, { color: colors.text.normal }]}>Очистка</Text>

            <SettingItem
              icon="delete-sweep"
              title="Очистить историю"
              description="Удалить все транзакции"
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
          </ScrollView>
        </View>

        {/* Loading overlays */}
        <Modal visible={isExporting && !showStreamingExport} transparent animationType="fade">
          <View style={styles.loadingOverlay}>
            <View style={[styles.loadingContent, { backgroundColor: colors.background.card }]}>
              <ActivityIndicator size="large" color={isDark ? colors.primary.gold : "#10b981"} />
              <Text style={[styles.loadingText, { color: colors.text.normal }]}>Экспорт...</Text>
            </View>
          </View>
        </Modal>

        <Modal visible={isImporting} transparent animationType="fade">
          <View style={styles.loadingOverlay}>
            <View style={[styles.loadingContent, { backgroundColor: colors.background.card }]}>
              <ActivityIndicator size="large" color={isDark ? colors.primary.gold : "#10b981"} />
              <Text style={[styles.loadingText, { color: colors.text.normal }]}>Импорт...</Text>
            </View>
          </View>
        </Modal>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  headerGradient: {
    paddingTop: 60,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  profileCard: {
    alignItems: 'center',
  },
  avatarContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  avatarText: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#10b981',
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  roleText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  content: {
    padding: 20,
    paddingTop: 10,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  quickAction: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  quickActionText: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: '600',
    color: '#333',
  },
  subscriptionCard: {
    marginBottom: 20,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  subscriptionGradient: {
    padding: 20,
  },
  subscriptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  subscriptionTextContainer: {
    flex: 1,
  },
  subscriptionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  subscriptionSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  assistantItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  assistantIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f0f0ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  assistantInfo: {
    flex: 1,
  },
  assistantLogin: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  assistantPhone: {
    fontSize: 14,
    color: '#666',
  },
  formGroup: {
    marginBottom: 20,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    paddingHorizontal: 12,
  },
  inputIconLeft: {
    marginRight: 8,
  },
  formInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: '#333',
  },
  addButton: {
    backgroundColor: '#10b981',
    paddingVertical: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    gap: 8,
  },
  addButtonDisabled: {
    backgroundColor: '#93c5ae',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  infoSection: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  infoTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  appInfo: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginTop: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  appName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 12,
    marginBottom: 4,
  },
  appVersion: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  appDescription: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    padding: 20,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  modalSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginTop: 16,
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
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  destructiveItem: {
    borderWidth: 1,
    borderColor: '#fee2e2',
  },
  settingIconContainer: {
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
  loadingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  subscriptionInfoCard: {
    borderRadius: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    overflow: 'hidden',
  },
  subscriptionGradientCard: {
    padding: 24,
    borderRadius: 20,
  },
  subscriptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 14,
  },
  premiumIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  subscriptionHeaderTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    marginBottom: 20,
    gap: 10,
  },
  statusText: {
    fontSize: 15,
    fontWeight: '700',
  },
  subscriptionDetails: {
    gap: 14,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 14,
  },
  detailIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailTextContainer: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
  },
  subscriptionIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
