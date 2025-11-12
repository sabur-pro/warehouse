import React, { useState, useEffect, useRef } from 'react';
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
  RefreshControl,
  Image,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import SubscriptionService, {
  SUBSCRIPTION_PLANS,
  SubscriptionPlan,
  Subscription,
} from '../services/SubscriptionService';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../../constants/theme';
import AuthService from '../services/AuthService';

export default function SubscriptionScreen() {
  const { loadUser } = useAuth();
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);
  const [showPlans, setShowPlans] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loadingSubscription, setLoadingSubscription] = useState(true);

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

    loadSubscription();
  }, []);

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
    await loadSubscription();
    setRefreshing(false);
  };

  const handleSelectPlan = (plan: SubscriptionPlan) => {
    setSelectedPlan(plan);
    setPhotoUri(null);
  };

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Ошибка', 'Необходимо разрешение на доступ к галерее');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const handlePurchase = async () => {
    if (!selectedPlan) {
      Alert.alert('Ошибка', 'Выберите план подписки');
      return;
    }

    if (!photoUri) {
      Alert.alert('Ошибка', 'Прикрепите чек оплаты');
      return;
    }

    setLoading(true);
    try {
      const response = await SubscriptionService.createSubscription(selectedPlan, photoUri);

      // Обновляем токены
      await AuthService.saveTokens(response.access_token, response.refresh_token);
      await loadUser();

      Alert.alert(
        'Успешно!',
        'Ваша подписка отправлена на проверку. Ожидайте подтверждения.',
        [
          {
            text: 'OK',
            onPress: () => {
              setShowPlans(false);
              setSelectedPlan(null);
              setPhotoUri(null);
              loadSubscription();
            },
          },
        ]
      );
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.message || error.message || 'Ошибка при покупке подписки';
      Alert.alert('Ошибка', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return '#10b981';
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const gradientColors = isDark ? colors.gradients.accent : colors.gradients.main;

  return (
    <>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background.screen }]}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh} 
            tintColor={isDark ? colors.primary.gold : colors.primary.blue}
            colors={isDark ? [colors.primary.gold] : [colors.primary.blue]}
          />
        }
      >
        <LinearGradient
          colors={gradientColors}
          style={styles.headerGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Animated.View
            style={[
              styles.headerContent,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
              },
            ]}
          >
            <MaterialIcons name="workspace-premium" size={60} color="#fff" />
            <Text style={styles.headerTitle}>Премиум подписка</Text>
            <Text style={styles.headerSubtitle}>
              Получите полный доступ ко всем функциям
            </Text>
          </Animated.View>
        </LinearGradient>

        <View style={[styles.content, { backgroundColor: colors.background.screen }]}>
          {loadingSubscription ? (
            <ActivityIndicator size="large" color={isDark ? colors.primary.gold : colors.primary.blue} style={{ marginTop: 40 }} />
          ) : subscription ? (
            <View style={[styles.currentSubscription, { backgroundColor: colors.background.card }]}>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: `${getStatusColor(subscription.status)}20` },
                ]}
              >
                <MaterialIcons
                  name={getStatusIcon(subscription.status) as any}
                  size={24}
                  color={getStatusColor(subscription.status)}
                />
                <Text style={[styles.statusText, { color: getStatusColor(subscription.status) }]}>
                  {getStatusText(subscription.status)}
                </Text>
              </View>

              <View style={styles.subscriptionInfo}>
                <View style={styles.infoRow}>
                  <MaterialIcons name="calendar-today" size={20} color={isDark ? colors.primary.gold : colors.primary.blue} />
                  <View style={styles.infoTextContainer}>
                    <Text style={[styles.infoLabel, { color: colors.text.muted }]}>Начало</Text>
                    <Text style={[styles.infoValue, { color: colors.text.normal }]}>{formatDate(subscription.start_date)}</Text>
                  </View>
                </View>

                <View style={styles.infoRow}>
                  <MaterialIcons name="event" size={20} color={isDark ? colors.primary.gold : colors.primary.blue} />
                  <View style={styles.infoTextContainer}>
                    <Text style={[styles.infoLabel, { color: colors.text.muted }]}>Окончание</Text>
                    <Text style={[styles.infoValue, { color: colors.text.normal }]}>{formatDate(subscription.end_date)}</Text>
                  </View>
                </View>

                <View style={styles.infoRow}>
                  <MaterialIcons name="payments" size={20} color={isDark ? colors.primary.gold : colors.primary.blue} />
                  <View style={styles.infoTextContainer}>
                    <Text style={[styles.infoLabel, { color: colors.text.muted }]}>Стоимость</Text>
                    <Text style={[styles.infoValue, { color: colors.text.normal }]}>{subscription.price} сомонӣ</Text>
                  </View>
                </View>
              </View>

              {subscription.status === 'fail' && (
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={() => setShowPlans(true)}
                >
                  <MaterialIcons name="refresh" size={20} color="#fff" />
                  <Text style={styles.retryButtonText}>Попробовать снова</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <>
              <View style={[styles.featuresContainer, { backgroundColor: colors.background.card }]}>
                <Text style={[styles.featuresTitle, { color: colors.text.normal }]}>Преимущества премиум:</Text>

                {[
                  { icon: 'check-circle', text: 'Безлимитное хранение товаров' },
                  { icon: 'check-circle', text: 'Полная статистика продаж' },
                  { icon: 'check-circle', text: 'Экспорт и импорт данных' },
                  { icon: 'check-circle', text: 'Добавление ассистентов' },
                  { icon: 'check-circle', text: 'Приоритетная поддержка' },
                ].map((feature, index) => (
                  <View key={index} style={styles.featureItem}>
                    <MaterialIcons name={feature.icon as any} size={24} color={isDark ? colors.primary.gold : colors.primary.blue} />
                    <Text style={[styles.featureText, { color: colors.text.normal }]}>{feature.text}</Text>
                  </View>
                ))}
              </View>

              <TouchableOpacity
                style={[styles.purchaseButton, { backgroundColor: isDark ? colors.primary.gold : colors.primary.blue }]}
                onPress={() => setShowPlans(true)}
              >
                <MaterialIcons name="shopping-cart" size={24} color="#fff" />
                <Text style={styles.purchaseButtonText}>Купить подписку</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>

      {/* Modal выбора плана */}
      <Modal
        visible={showPlans}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowPlans(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.background.screen }]}>
          <View style={[styles.modalHeader, { backgroundColor: colors.background.card, borderBottomColor: colors.border.normal }]}>
            <Text style={[styles.modalTitle, { color: colors.text.normal }]}>Выберите план</Text>
            <TouchableOpacity onPress={() => setShowPlans(false)}>
              <MaterialIcons name="close" size={28} color={colors.text.normal} />
            </TouchableOpacity>
          </View>

          <ScrollView style={[styles.modalContent, { backgroundColor: colors.background.screen }]}>
            {!selectedPlan ? (
              <View style={styles.plansContainer}>
                {SUBSCRIPTION_PLANS.map((plan) => (
                  <TouchableOpacity
                    key={plan.id}
                    style={[
                      styles.planCard, 
                      { backgroundColor: colors.background.card, borderColor: colors.border.normal },
                      plan.popular && [styles.planCardPopular, { 
                        borderColor: isDark ? colors.primary.gold : colors.primary.blue,
                        backgroundColor: isDark ? 'rgba(212, 175, 55, 0.1)' : '#f0fdf4'
                      }]
                    ]}
                    onPress={() => handleSelectPlan(plan)}
                  >
                    {plan.popular && (
                      <View style={[styles.popularBadge, { backgroundColor: isDark ? colors.primary.gold : colors.primary.blue }]}>
                        <Text style={styles.popularText}>Популярный</Text>
                      </View>
                    )}
                    <Text style={[styles.planName, { color: colors.text.normal }]}>{plan.name}</Text>
                    <Text style={[styles.planDuration, { color: colors.text.muted }]}>{plan.duration}</Text>
                    <View style={styles.planPriceContainer}>
                      <Text style={[styles.planPrice, { color: isDark ? colors.primary.gold : colors.primary.blue }]}>{plan.price}</Text>
                      <Text style={[styles.planCurrency, { color: colors.text.muted }]}>сомонӣ</Text>
                    </View>
                    <MaterialIcons name="arrow-forward" size={24} color={isDark ? colors.primary.gold : colors.primary.blue} />
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <View style={styles.checkoutContainer}>
                <View style={[styles.selectedPlanCard, { backgroundColor: colors.background.card }]}>
                  <MaterialIcons name="workspace-premium" size={40} color={isDark ? colors.primary.gold : colors.primary.blue} />
                  <Text style={[styles.selectedPlanName, { color: colors.text.normal }]}>{selectedPlan.name}</Text>
                  <Text style={[styles.selectedPlanPrice, { color: isDark ? colors.primary.gold : colors.primary.blue }]}>{selectedPlan.price} сомонӣ</Text>
                </View>

                <View style={[styles.uploadSection, { backgroundColor: colors.background.card }]}>
                  <Text style={[styles.uploadTitle, { color: colors.text.normal }]}>Прикрепите чек оплаты</Text>
                  <Text style={[styles.uploadSubtitle, { color: colors.text.muted }]}>
                    Переведите {selectedPlan.price} сомонӣ на номер:{'\n'}
                    <Text style={[styles.phoneNumber, { color: isDark ? colors.primary.gold : colors.primary.blue }]}>+992 970 07 43 43</Text>
                  </Text>

                  <TouchableOpacity 
                    style={[styles.uploadButton, { 
                      borderColor: isDark ? colors.primary.gold : colors.primary.blue,
                      backgroundColor: isDark ? 'rgba(212, 175, 55, 0.05)' : '#f9fafb'
                    }]} 
                    onPress={handlePickImage}
                  >
                    <MaterialIcons name="add-photo-alternate" size={40} color={isDark ? colors.primary.gold : colors.primary.blue} />
                    <Text style={[styles.uploadButtonText, { color: isDark ? colors.primary.gold : colors.primary.blue }]}>
                      {photoUri ? 'Изменить чек' : 'Загрузить чек'}
                    </Text>
                  </TouchableOpacity>

                  {photoUri && (
                    <View style={styles.previewContainer}>
                      <Image source={{ uri: photoUri }} style={styles.previewImage} />
                      <TouchableOpacity
                        style={styles.removePhotoButton}
                        onPress={() => setPhotoUri(null)}
                      >
                        <MaterialIcons name="close" size={20} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                <View style={styles.buttonsRow}>
                  <TouchableOpacity
                    style={[styles.backButton, { borderColor: isDark ? colors.primary.gold : colors.primary.blue }]}
                    onPress={() => {
                      setSelectedPlan(null);
                      setPhotoUri(null);
                    }}
                  >
                    <Text style={[styles.backButtonText, { color: isDark ? colors.primary.gold : colors.primary.blue }]}>Назад</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.confirmButton, 
                      { backgroundColor: isDark ? colors.primary.gold : colors.primary.blue },
                      (!photoUri || loading) && styles.buttonDisabled
                    ]}
                    onPress={handlePurchase}
                    disabled={!photoUri || loading}
                  >
                    {loading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <MaterialIcons name="check" size={20} color="#fff" />
                        <Text style={styles.confirmButtonText}>Оплатить</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>
    </>
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
  headerContent: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 16,
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
  },
  content: {
    padding: 20,
  },
  currentSubscription: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 20,
    gap: 8,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
  },
  subscriptionInfo: {
    gap: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  infoTextContainer: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b981',
    padding: 14,
    borderRadius: 12,
    marginTop: 16,
    gap: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  featuresContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  featuresTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  featureText: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  purchaseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b981',
    padding: 18,
    borderRadius: 16,
    gap: 12,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  purchaseButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
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
  plansContainer: {
    gap: 16,
  },
  planCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  planCardPopular: {
    borderColor: '#10b981',
    backgroundColor: '#f0fdf4',
  },
  popularBadge: {
    position: 'absolute',
    top: -10,
    right: 20,
    backgroundColor: '#10b981',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  popularText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  planName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  planDuration: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  planPriceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  planPrice: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#10b981',
  },
  planCurrency: {
    fontSize: 16,
    color: '#666',
    marginLeft: 8,
  },
  checkoutContainer: {
    gap: 24,
  },
  selectedPlanCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  selectedPlanName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 12,
  },
  selectedPlanPrice: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#10b981',
    marginTop: 8,
  },
  uploadSection: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  uploadTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  uploadSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
    lineHeight: 20,
  },
  phoneNumber: {
    fontWeight: 'bold',
    color: '#10b981',
  },
  uploadButton: {
    borderWidth: 2,
    borderColor: '#10b981',
    borderStyle: 'dashed',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  uploadButtonText: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '600',
    color: '#10b981',
  },
  previewContainer: {
    marginTop: 16,
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
  },
  removePhotoButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    padding: 8,
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  backButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#10b981',
    alignItems: 'center',
  },
  backButtonText: {
    color: '#10b981',
    fontSize: 16,
    fontWeight: '600',
  },
  confirmButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b981',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  buttonDisabled: {
    backgroundColor: '#93c5ae',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

