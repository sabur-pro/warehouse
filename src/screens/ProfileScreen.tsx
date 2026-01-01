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
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { getThemeColors } from '../../constants/theme';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AssistantService, { Assistant } from '../services/AssistantService';
import SubscriptionService, { Subscription } from '../services/SubscriptionService';
import { useSyncRefresh } from '../components/sync/SyncStatusBar';
import { ProfileStackParamList } from '../types/navigation';

export default function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const { user, signOut, isAdmin } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const colors = getThemeColors(isDark);
  const insets = useSafeAreaInsets();
  const [showAddAssistant, setShowAddAssistant] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.screen }]} edges={['top']}>
      {/* Floating refresh button in top-right corner */}
      <TouchableOpacity
        onPress={onRefresh}
        activeOpacity={0.7}
        style={[styles.floatingRefreshButton, {
          backgroundColor: isDark ? 'rgba(212, 175, 55, 0.15)' : 'rgba(59, 130, 246, 0.1)',
          top: insets.top + 12,
        }]}
      >
        <MaterialIcons
          name="refresh"
          size={22}
          color={isDark ? colors.primary.gold : colors.primary.blue}
        />
      </TouchableOpacity>
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
                onPress={() => navigation.navigate('PendingActions')}
              >
                <MaterialIcons name="assignment" size={24} color="#f59e0b" />
                <Text style={[styles.quickActionText, { color: colors.text.normal }]}>Заявки</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.quickAction, { backgroundColor: colors.background.card }]}
              onPress={() => navigation.navigate('Settings')}
            >
              <MaterialIcons name="settings" size={24} color={isDark ? colors.primary.gold : colors.primary.purple} />
              <Text style={[styles.quickActionText, { color: colors.text.normal }]}>Настройки</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickAction, { backgroundColor: colors.background.card }]}
              onPress={toggleTheme}
            >
              <MaterialIcons
                name={isDark ? 'light-mode' : 'dark-mode'}
                size={24}
                color={isDark ? '#fbbf24' : '#6366f1'}
              />
              <Text style={[styles.quickActionText, { color: colors.text.normal }]}>
                {isDark ? 'Светлая' : 'Тёмная'}
              </Text>
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
                onPress={() => navigation.navigate('Subscription')}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  errorText: {
    fontSize: 16,
    color: '#ef4444',
    textAlign: 'center',
    marginTop: 20,
  },
  headerGradient: {
    paddingTop: 20,
    paddingBottom: 40,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    paddingHorizontal: 20,
  },
  profileCard: {
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
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
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  avatarText: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#3b82f6',
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
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  roleText: {
    color: '#fff',
    marginLeft: 6,
    fontWeight: '600',
    fontSize: 14,
  },
  content: {
    flex: 1,
    marginTop: -20,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 20,
  },
  quickActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  quickAction: {
    width: '48%',
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  quickActionText: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoSection: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  assistantItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  assistantIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
  },
  assistantPhone: {
    fontSize: 14,
    marginTop: 2,
  },
  subscriptionCard: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  subscriptionGradient: {
    padding: 20,
  },
  subscriptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subscriptionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  subscriptionTextContainer: {
    flex: 1,
  },
  subscriptionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  subscriptionSubtitle: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 13,
  },
  subscriptionInfoCard: {
    marginBottom: 24,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  subscriptionGradientCard: {
    padding: 20,
  },
  subscriptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  premiumIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  subscriptionHeaderTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 20,
  },
  statusText: {
    marginLeft: 6,
    fontWeight: '600',
    fontSize: 14,
  },
  subscriptionDetails: {
    gap: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  detailTextContainer: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 12,
  },
  detailValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  appInfo: {
    alignItems: 'center',
    padding: 24,
    borderRadius: 20,
    marginBottom: 24,
  },
  appName: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 12,
  },
  appVersion: {
    fontSize: 14,
    marginTop: 4,
  },
  appDescription: {
    textAlign: 'center',
    fontSize: 14,
    marginTop: 8,
    lineHeight: 20,
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  formGroup: {
    marginBottom: 20,
  },
  formLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  inputIconLeft: {
    marginRight: 10,
  },
  formInput: {
    flex: 1,
    height: 50,
    fontSize: 16,
  },
  addButton: {
    backgroundColor: '#3b82f6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    marginTop: 10,
  },
  addButtonDisabled: {
    opacity: 0.7,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  floatingRefreshButton: {
    position: 'absolute',
    right: 20,
    zIndex: 100,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
});
