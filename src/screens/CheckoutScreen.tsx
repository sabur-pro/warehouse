// src/screens/CheckoutScreen.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    FlatList,
    Modal,
    ActivityIndicator,
    ScrollView,
    KeyboardAvoidingView,
    Platform,
    Image,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../../constants/theme';
import { useCart } from '../contexts/CartContext';
import { getAllClients, addClient, searchClients } from '../../database/database';
import { Client } from '../../database/types';
import { Toast } from '../components/Toast';

// Интерфейс данных продажи
export interface SaleData {
    clientId: number | null;
    clientUuid?: string | null;
    paymentMethod: 'cash' | 'card' | 'mixed';
    bank?: 'alif' | 'dc';
    cashAmount?: number;
    cardAmount?: number;
    discount?: { mode: 'amount' | 'percent'; value: number };
    finalPrice: number;
    subtotal: number;
}

interface CheckoutScreenProps {
    visible: boolean;
    onClose: () => void;
    onConfirm: (saleData: SaleData) => void;
}

const CheckoutScreen: React.FC<CheckoutScreenProps> = ({ visible, onClose, onConfirm }) => {
    const { theme, isDark } = useTheme();
    const colors = getThemeColors(isDark);
    // Используем цвет из темы приложения
    const accentColor = isDark ? colors.primary.gold : colors.primary.blue;

    const { cartItems, getCartTotal } = useCart();
    const cartTotals = getCartTotal();

    // Состояние клиента
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [showClientModal, setShowClientModal] = useState(false);
    const [showAddClientModal, setShowAddClientModal] = useState(false);

    // Поиск клиентов
    const [searchQuery, setSearchQuery] = useState('');
    const [clients, setClients] = useState<Client[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    // Новый клиент
    const [newClientName, setNewClientName] = useState('');
    const [newClientPhone, setNewClientPhone] = useState('');
    const [newClientAddress, setNewClientAddress] = useState('');
    const [newClientBirthday, setNewClientBirthday] = useState('');
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [isAddingClient, setIsAddingClient] = useState(false);

    // Toast
    const [toastVisible, setToastVisible] = useState(false);
    const [toastMessage, setToastMessage] = useState('');
    const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('success');

    // Скидка
    const [showDiscount, setShowDiscount] = useState(false);
    const [discountMode, setDiscountMode] = useState<'amount' | 'percent'>('amount'); // по умолчанию сумма
    const [discountValue, setDiscountValue] = useState('');

    // Оплата
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'mixed' | null>(null);
    const [selectedBank, setSelectedBank] = useState<'alif' | 'dc' | null>(null);
    const [cashAmount, setCashAmount] = useState('');
    const [cardAmount, setCardAmount] = useState('');

    const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
        setToastMessage(message);
        setToastType(type);
        setToastVisible(true);
    };

    // Загрузка клиентов
    const loadClients = useCallback(async () => {
        try {
            setIsSearching(true);
            const result = searchQuery.trim()
                ? await searchClients(searchQuery.trim())
                : await getAllClients();
            setClients(result);
        } catch (error) {
            console.error('Error loading clients:', error);
        } finally {
            setIsSearching(false);
        }
    }, [searchQuery]);

    useEffect(() => {
        if (showClientModal) {
            loadClients();
        }
    }, [showClientModal, loadClients]);

    // Сброс состояния при закрытии CheckoutScreen
    useEffect(() => {
        if (!visible) {
            setShowClientModal(false);
            setShowAddClientModal(false);
            setNewClientName('');
            setNewClientPhone('');
            setNewClientAddress('');
            setNewClientBirthday('');
            setSelectedDate(null);
            setShowDatePicker(false);
            setSearchQuery('');
            setIsAddingClient(false);
            // Сброс скидки
            setShowDiscount(false);
            setDiscountValue('');
            setDiscountMode('amount');
            // Сброс оплаты
            setPaymentMethod(null);
            setSelectedBank(null);
            setCashAmount('');
            setCardAmount('');
        }
    }, [visible]);

    // Debounced search
    useEffect(() => {
        const timer = setTimeout(() => {
            if (showClientModal) {
                loadClients();
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Добавление нового клиента
    const handleAddClient = async () => {
        if (!newClientName.trim()) {
            showToast('Введите имя клиента', 'error');
            return;
        }

        try {
            setIsAddingClient(true);
            const newId = await addClient({
                name: newClientName.trim(),
                phone: newClientPhone.trim() || null,
                address: newClientAddress.trim() || null,
                notes: null,
                birthday: newClientBirthday.trim() || null,
            });

            const newClient: Client = {
                id: newId,
                name: newClientName.trim(),
                phone: newClientPhone.trim() || null,
                address: newClientAddress.trim() || null,
                birthday: newClientBirthday.trim() || null,
                needsSync: 1
            };

            // Сначала закрываем модалку добавления
            setShowAddClientModal(false);

            // Очищаем поля формы
            setNewClientName('');
            setNewClientPhone('');
            setNewClientAddress('');
            setNewClientBirthday('');
            setSelectedDate(null);
            setShowDatePicker(false);

            // Устанавливаем выбранного клиента
            setSelectedClient(newClient);

            // Закрываем модалку выбора клиента
            setShowClientModal(false);

            // Показываем toast
            showToast('Клиент добавлен', 'success');
        } catch (error) {
            console.error('Error adding client:', error);
            showToast('Ошибка добавления клиента', 'error');
        } finally {
            setIsAddingClient(false);
        }
    };

    // Выбор клиента
    const handleSelectClient = (client: Client) => {
        setSelectedClient(client);
        setShowClientModal(false);
    };

    // Подтверждение заказа
    const handleConfirm = () => {
        // Расчёт итоговой суммы
        let finalPrice = cartTotals.totalRecommendedPrice;
        const discountVal = parseFloat(discountValue) || 0;

        if (showDiscount && discountVal > 0) {
            if (discountMode === 'percent') {
                finalPrice = cartTotals.totalRecommendedPrice - Math.round(cartTotals.totalRecommendedPrice * discountVal / 100);
            } else {
                finalPrice = cartTotals.totalRecommendedPrice - discountVal;
            }
        }
        finalPrice = Math.max(0, finalPrice);

        const saleData: SaleData = {
            clientId: selectedClient?.id || null,
            clientUuid: selectedClient?.uuid || null,
            paymentMethod: paymentMethod!,
            subtotal: cartTotals.totalRecommendedPrice,
            finalPrice,
        };

        // Добавляем банк если это карточная или смешанная оплата
        if ((paymentMethod === 'card' || paymentMethod === 'mixed') && selectedBank) {
            saleData.bank = selectedBank;
        }

        // Добавляем суммы для смешанной оплаты
        if (paymentMethod === 'mixed') {
            saleData.cashAmount = parseFloat(cashAmount) || 0;
            saleData.cardAmount = parseFloat(cardAmount) || 0;
        }

        // Добавляем скидку если есть
        if (showDiscount && discountVal > 0) {
            saleData.discount = {
                mode: discountMode,
                value: discountVal
            };
        }

        onConfirm(saleData);
    };

    if (!visible) return null;

    return (
        <Modal
            visible={visible}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={onClose}
        >
            <SafeAreaView style={[styles.container, { backgroundColor: colors.background.screen }]}>
                {/* Header */}
                <View style={[styles.header, { borderBottomColor: colors.border.normal }]}>
                    <TouchableOpacity onPress={onClose} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color={colors.text.normal} />
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: colors.text.normal }]}>
                        Оформление
                    </Text>
                    <View style={{ width: 40 }} />
                </View>

                <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                    {/* Сводка заказа */}
                    <View style={[styles.section, { backgroundColor: colors.background.card }]}>
                        <Text style={[styles.sectionTitle, { color: colors.text.normal }]}>
                            Сводка заказа
                        </Text>
                        <View style={styles.summaryRow}>
                            <Text style={[styles.summaryLabel, { color: colors.text.muted }]}>
                                Товаров
                            </Text>
                            <Text style={[styles.summaryValue, { color: colors.text.normal }]}>
                                {cartTotals.totalItems} шт.
                            </Text>
                        </View>
                        <View style={styles.summaryRow}>
                            <Text style={[styles.summaryLabel, { color: colors.text.muted }]}>
                                Позиций
                            </Text>
                            <Text style={[styles.summaryValue, { color: colors.text.normal }]}>
                                {cartItems.length}
                            </Text>
                        </View>
                        <View style={[styles.divider, { backgroundColor: colors.border.normal }]} />
                        <View style={styles.summaryRow}>
                            <Text style={[styles.totalLabel, { color: colors.text.normal }]}>
                                Подытог
                            </Text>
                            <Text style={[styles.summaryValue, { color: colors.text.normal }]}>
                                {cartTotals.totalRecommendedPrice.toLocaleString()} сом
                            </Text>
                        </View>

                        {/* Скидка в итого */}
                        {showDiscount && discountValue && parseFloat(discountValue) > 0 && (
                            <View style={styles.summaryRow}>
                                <Text style={[styles.summaryLabel, { color: '#EF4444' }]}>
                                    Скидка {discountMode === 'percent' ? `(${discountValue}%)` : ''}
                                </Text>
                                <Text style={[styles.summaryValue, { color: '#EF4444' }]}>
                                    -{discountMode === 'percent'
                                        ? Math.round(cartTotals.totalRecommendedPrice * parseFloat(discountValue) / 100).toLocaleString()
                                        : parseFloat(discountValue).toLocaleString()} сом
                                </Text>
                            </View>
                        )}

                        <View style={[styles.divider, { backgroundColor: colors.border.normal }]} />
                        <View style={styles.summaryRow}>
                            <Text style={[styles.totalLabel, { color: colors.text.normal }]}>
                                Итого
                            </Text>
                            <Text style={[styles.totalValue, { color: accentColor }]}>
                                {(() => {
                                    let finalPrice = cartTotals.totalRecommendedPrice;
                                    if (showDiscount && discountValue && parseFloat(discountValue) > 0) {
                                        if (discountMode === 'percent') {
                                            finalPrice = cartTotals.totalRecommendedPrice - Math.round(cartTotals.totalRecommendedPrice * parseFloat(discountValue) / 100);
                                        } else {
                                            finalPrice = cartTotals.totalRecommendedPrice - parseFloat(discountValue);
                                        }
                                    }
                                    return Math.max(0, finalPrice).toLocaleString();
                                })()} сом
                            </Text>
                        </View>
                    </View>

                    {/* Скидка */}
                    <View style={[styles.section, { backgroundColor: colors.background.card }]}>
                        <TouchableOpacity
                            style={styles.discountHeader}
                            onPress={() => setShowDiscount(!showDiscount)}
                            activeOpacity={0.7}
                        >
                            <View style={styles.discountHeaderLeft}>
                                <Ionicons
                                    name="pricetag-outline"
                                    size={20}
                                    color={showDiscount && discountValue ? '#EF4444' : colors.text.muted}
                                />
                                <Text style={[styles.sectionTitle, { color: colors.text.normal, marginBottom: 0, marginLeft: 8 }]}>
                                    Скидка
                                </Text>
                                {showDiscount && discountValue && parseFloat(discountValue) > 0 && (
                                    <View style={[styles.discountBadge, { backgroundColor: '#EF4444' }]}>
                                        <Text style={styles.discountBadgeText}>
                                            {discountMode === 'percent'
                                                ? `-${discountValue}%`
                                                : `-${parseFloat(discountValue).toLocaleString()}`}
                                        </Text>
                                    </View>
                                )}
                            </View>
                            <Ionicons
                                name={showDiscount ? "chevron-up" : "chevron-down"}
                                size={20}
                                color={colors.text.muted}
                            />
                        </TouchableOpacity>

                        {showDiscount && (
                            <View style={styles.discountContent}>
                                {/* Переключатель режима */}
                                <View style={[styles.discountModeSelector, { backgroundColor: colors.background.screen }]}>
                                    <TouchableOpacity
                                        style={[
                                            styles.discountModeButton,
                                            discountMode === 'amount' && { backgroundColor: accentColor }
                                        ]}
                                        onPress={() => {
                                            setDiscountMode('amount');
                                            setDiscountValue('');
                                        }}
                                    >
                                        <Text style={[
                                            styles.discountModeText,
                                            { color: discountMode === 'amount' ? 'white' : colors.text.muted }
                                        ]}>
                                            Сумма
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[
                                            styles.discountModeButton,
                                            discountMode === 'percent' && { backgroundColor: accentColor }
                                        ]}
                                        onPress={() => {
                                            setDiscountMode('percent');
                                            setDiscountValue('');
                                        }}
                                    >
                                        <Text style={[
                                            styles.discountModeText,
                                            { color: discountMode === 'percent' ? 'white' : colors.text.muted }
                                        ]}>
                                            Процент
                                        </Text>
                                    </TouchableOpacity>
                                </View>

                                {/* Поле ввода */}
                                <View style={styles.discountInputContainer}>
                                    <TextInput
                                        style={[styles.discountInput, {
                                            backgroundColor: colors.background.screen,
                                            color: colors.text.normal,
                                            borderColor: colors.border.normal,
                                        }]}
                                        placeholder={discountMode === 'percent' ? "Введите %" : "Введите сумму"}
                                        placeholderTextColor={colors.text.muted}
                                        value={discountValue}
                                        onChangeText={(text) => {
                                            // Только цифры и точка
                                            const filtered = text.replace(/[^0-9.]/g, '');
                                            // Ограничение процента до 100
                                            if (discountMode === 'percent' && parseFloat(filtered) > 100) {
                                                setDiscountValue('100');
                                            } else {
                                                setDiscountValue(filtered);
                                            }
                                        }}
                                        keyboardType="numeric"
                                    />
                                    <Text style={[styles.discountSuffix, { color: colors.text.muted }]}>
                                        {discountMode === 'percent' ? '%' : 'сом'}
                                    </Text>
                                </View>

                                {/* Показ расчёта для процента */}
                                {discountMode === 'percent' && discountValue && parseFloat(discountValue) > 0 && (
                                    <View style={[styles.discountCalculation, { backgroundColor: '#EF444410' }]}>
                                        <Text style={[styles.discountCalcText, { color: '#EF4444' }]}>
                                            {discountValue}% от {cartTotals.totalRecommendedPrice.toLocaleString()} = {Math.round(cartTotals.totalRecommendedPrice * parseFloat(discountValue) / 100).toLocaleString()} сом
                                        </Text>
                                    </View>
                                )}

                                {/* Кнопка очистки */}
                                {discountValue && (
                                    <TouchableOpacity
                                        style={styles.clearDiscountButton}
                                        onPress={() => setDiscountValue('')}
                                    >
                                        <Text style={[styles.clearDiscountText, { color: colors.text.muted }]}>
                                            Убрать скидку
                                        </Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        )}
                    </View>

                    {/* Клиент */}
                    <View style={[styles.section, { backgroundColor: colors.background.card }]}>
                        <Text style={[styles.sectionTitle, { color: colors.text.normal }]}>
                            Клиент
                        </Text>

                        <TouchableOpacity
                            style={[styles.clientSelector, { borderColor: colors.border.normal }]}
                            onPress={() => setShowClientModal(true)}
                        >
                            {selectedClient ? (
                                <View style={styles.selectedClientInfo}>
                                    <View style={[styles.clientAvatar, { backgroundColor: accentColor + '20' }]}>
                                        <Ionicons name="person" size={20} color={accentColor} />
                                    </View>
                                    <View style={styles.clientDetails}>
                                        <Text style={[styles.clientName, { color: colors.text.normal }]}>
                                            {selectedClient.name}
                                        </Text>
                                        {selectedClient.phone && (
                                            <Text style={[styles.clientPhone, { color: colors.text.muted }]}>
                                                {selectedClient.phone}
                                            </Text>
                                        )}
                                    </View>
                                    <Ionicons name="chevron-forward" size={20} color={colors.text.muted} />
                                </View>
                            ) : (
                                <View style={styles.addClientPlaceholder}>
                                    <Ionicons name="person-add-outline" size={24} color={accentColor} />
                                    <Text style={[styles.addClientText, { color: accentColor }]}>
                                        Добавить клиента
                                    </Text>
                                    <Ionicons name="chevron-forward" size={20} color={colors.text.muted} />
                                </View>
                            )}
                        </TouchableOpacity>

                        <Text style={[styles.clientHint, { color: colors.text.muted }]}>
                            Необязательно. Клиент будет привязан к продаже.
                        </Text>
                    </View>

                    {/* Способ оплаты */}
                    <View style={[styles.section, { backgroundColor: colors.background.card }]}>
                        <Text style={[styles.sectionTitle, { color: colors.text.normal }]}>
                            Способ оплаты *
                        </Text>

                        {/* Варианты оплаты */}
                        <View style={styles.paymentOptions}>
                            {/* Наличные */}
                            <TouchableOpacity
                                style={[
                                    styles.paymentOption,
                                    { borderColor: paymentMethod === 'cash' ? accentColor : colors.border.normal },
                                    paymentMethod === 'cash' && { backgroundColor: accentColor + '15' }
                                ]}
                                onPress={() => {
                                    setPaymentMethod('cash');
                                    setCashAmount('');
                                    setCardAmount('');
                                }}
                            >
                                <Ionicons
                                    name="cash-outline"
                                    size={24}
                                    color={paymentMethod === 'cash' ? accentColor : colors.text.muted}
                                />
                                <Text style={[
                                    styles.paymentOptionText,
                                    { color: paymentMethod === 'cash' ? accentColor : colors.text.normal }
                                ]}>
                                    Наличные
                                </Text>
                                {paymentMethod === 'cash' && (
                                    <Ionicons name="checkmark-circle" size={20} color={accentColor} />
                                )}
                            </TouchableOpacity>

                            {/* Карта */}
                            <TouchableOpacity
                                style={[
                                    styles.paymentOption,
                                    { borderColor: paymentMethod === 'card' ? accentColor : colors.border.normal },
                                    paymentMethod === 'card' && { backgroundColor: accentColor + '15' }
                                ]}
                                onPress={() => {
                                    setPaymentMethod('card');
                                    setSelectedBank(null);
                                    setCashAmount('');
                                    setCardAmount('');
                                }}
                            >
                                <Ionicons
                                    name="card-outline"
                                    size={24}
                                    color={paymentMethod === 'card' ? accentColor : colors.text.muted}
                                />
                                <Text style={[
                                    styles.paymentOptionText,
                                    { color: paymentMethod === 'card' ? accentColor : colors.text.normal }
                                ]}>
                                    Карта
                                </Text>
                                {paymentMethod === 'card' && (
                                    <Ionicons name="checkmark-circle" size={20} color={accentColor} />
                                )}
                            </TouchableOpacity>

                            {/* Смешанная */}
                            <TouchableOpacity
                                style={[
                                    styles.paymentOption,
                                    { borderColor: paymentMethod === 'mixed' ? accentColor : colors.border.normal },
                                    paymentMethod === 'mixed' && { backgroundColor: accentColor + '15' }
                                ]}
                                onPress={() => {
                                    setPaymentMethod('mixed');
                                    setSelectedBank(null);
                                    setCashAmount('');
                                    setCardAmount('');
                                }}
                            >
                                <Ionicons
                                    name="wallet-outline"
                                    size={24}
                                    color={paymentMethod === 'mixed' ? accentColor : colors.text.muted}
                                />
                                <Text style={[
                                    styles.paymentOptionText,
                                    { color: paymentMethod === 'mixed' ? accentColor : colors.text.normal }
                                ]}>
                                    Смешанная
                                </Text>
                                {paymentMethod === 'mixed' && (
                                    <Ionicons name="checkmark-circle" size={20} color={accentColor} />
                                )}
                            </TouchableOpacity>
                        </View>

                        {/* Выбор банка при оплате картой или смешанной */}
                        {(paymentMethod === 'card' || paymentMethod === 'mixed') && (
                            <View style={styles.bankSelector}>
                                <Text style={[styles.bankSelectorTitle, { color: colors.text.muted }]}>
                                    Выберите банк
                                </Text>
                                <View style={styles.bankOptions}>
                                    {/* АлифБанк */}
                                    <TouchableOpacity
                                        style={[
                                            styles.bankOption,
                                            {
                                                borderColor: selectedBank === 'alif' ? '#00C853' : colors.border.normal,
                                                backgroundColor: selectedBank === 'alif' ? '#00C85310' : 'transparent'
                                            }
                                        ]}
                                        onPress={() => setSelectedBank('alif')}
                                        activeOpacity={0.7}
                                    >
                                        <Image
                                            source={require('../../assets/alif.png')}
                                            style={styles.bankLogo}
                                            resizeMode="contain"
                                        />
                                        <Text style={[styles.bankName, { color: colors.text.normal }]}>
                                            АлифБанк
                                        </Text>
                                        {selectedBank === 'alif' && (
                                            <Ionicons name="checkmark-circle" size={20} color="#00C853" />
                                        )}
                                    </TouchableOpacity>

                                    {/* ДушанбеСити */}
                                    <TouchableOpacity
                                        style={[
                                            styles.bankOption,
                                            {
                                                borderColor: selectedBank === 'dc' ? '#1976D2' : colors.border.normal,
                                                backgroundColor: selectedBank === 'dc' ? '#1976D210' : 'transparent'
                                            }
                                        ]}
                                        onPress={() => setSelectedBank('dc')}
                                        activeOpacity={0.7}
                                    >
                                        <Image
                                            source={require('../../assets/dc.png')}
                                            style={styles.bankLogo}
                                            resizeMode="contain"
                                        />
                                        <Text style={[styles.bankName, { color: colors.text.normal }]}>
                                            ДушанбеСити
                                        </Text>
                                        {selectedBank === 'dc' && (
                                            <Ionicons name="checkmark-circle" size={20} color="#1976D2" />
                                        )}
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}

                        {/* Поля для смешанной оплаты */}
                        {paymentMethod === 'mixed' && (
                            <View style={styles.mixedPaymentFields}>
                                <View style={styles.mixedPaymentRow}>
                                    <View style={styles.mixedPaymentLabel}>
                                        <Ionicons name="cash-outline" size={18} color={colors.text.muted} />
                                        <Text style={[styles.mixedPaymentLabelText, { color: colors.text.muted }]}>
                                            Наличные
                                        </Text>
                                    </View>
                                    <View style={styles.mixedPaymentInputWrapper}>
                                        <TextInput
                                            style={[styles.mixedPaymentInput, {
                                                backgroundColor: colors.background.screen,
                                                color: colors.text.normal,
                                                borderColor: colors.border.normal,
                                            }]}
                                            placeholder="0"
                                            placeholderTextColor={colors.text.muted}
                                            value={cashAmount}
                                            onChangeText={(text) => setCashAmount(text.replace(/[^0-9]/g, ''))}
                                            keyboardType="numeric"
                                        />
                                        <Text style={[styles.mixedPaymentSuffix, { color: colors.text.muted }]}>сом</Text>
                                    </View>
                                </View>

                                <View style={styles.mixedPaymentRow}>
                                    <View style={styles.mixedPaymentLabel}>
                                        <Ionicons name="card-outline" size={18} color={colors.text.muted} />
                                        <Text style={[styles.mixedPaymentLabelText, { color: colors.text.muted }]}>
                                            Карта
                                        </Text>
                                    </View>
                                    <View style={styles.mixedPaymentInputWrapper}>
                                        <TextInput
                                            style={[styles.mixedPaymentInput, {
                                                backgroundColor: colors.background.screen,
                                                color: colors.text.normal,
                                                borderColor: colors.border.normal,
                                            }]}
                                            placeholder="0"
                                            placeholderTextColor={colors.text.muted}
                                            value={cardAmount}
                                            onChangeText={(text) => setCardAmount(text.replace(/[^0-9]/g, ''))}
                                            keyboardType="numeric"
                                        />
                                        <Text style={[styles.mixedPaymentSuffix, { color: colors.text.muted }]}>сом</Text>
                                    </View>
                                </View>

                                {/* Подсказка о сумме */}
                                {(() => {
                                    const cash = parseFloat(cashAmount) || 0;
                                    const card = parseFloat(cardAmount) || 0;
                                    const total = cash + card;
                                    let finalPrice = cartTotals.totalRecommendedPrice;
                                    if (showDiscount && discountValue && parseFloat(discountValue) > 0) {
                                        if (discountMode === 'percent') {
                                            finalPrice = cartTotals.totalRecommendedPrice - Math.round(cartTotals.totalRecommendedPrice * parseFloat(discountValue) / 100);
                                        } else {
                                            finalPrice = cartTotals.totalRecommendedPrice - parseFloat(discountValue);
                                        }
                                    }
                                    const diff = finalPrice - total;

                                    if (total > 0) {
                                        return (
                                            <View style={[styles.mixedPaymentHint, {
                                                backgroundColor: diff === 0 ? '#10B98110' : diff > 0 ? '#F59E0B10' : '#EF444410'
                                            }]}>
                                                <Text style={[styles.mixedPaymentHintText, {
                                                    color: diff === 0 ? '#10B981' : diff > 0 ? '#F59E0B' : '#EF4444'
                                                }]}>
                                                    {diff === 0
                                                        ? `✓ Сумма совпадает: ${total.toLocaleString()} сом`
                                                        : diff > 0
                                                            ? `Не хватает: ${diff.toLocaleString()} сом`
                                                            : `Переплата: ${Math.abs(diff).toLocaleString()} сом`}
                                                </Text>
                                            </View>
                                        );
                                    }
                                    return null;
                                })()}
                            </View>
                        )}
                    </View>
                </ScrollView>

                {/* Кнопка подтверждения */}
                <View style={[styles.footer, { borderTopColor: colors.border.normal }]}>
                    {(() => {
                        // Расчёт итоговой суммы
                        let finalPrice = cartTotals.totalRecommendedPrice;
                        if (showDiscount && discountValue && parseFloat(discountValue) > 0) {
                            if (discountMode === 'percent') {
                                finalPrice = cartTotals.totalRecommendedPrice - Math.round(cartTotals.totalRecommendedPrice * parseFloat(discountValue) / 100);
                            } else {
                                finalPrice = cartTotals.totalRecommendedPrice - parseFloat(discountValue);
                            }
                        }
                        finalPrice = Math.max(0, finalPrice);

                        // Проверка валидности оплаты
                        let isPaymentValid = !!paymentMethod;
                        let buttonText = 'Выберите способ оплаты';

                        // Проверка выбора банка для карточной оплаты
                        if ((paymentMethod === 'card' || paymentMethod === 'mixed') && !selectedBank) {
                            isPaymentValid = false;
                            buttonText = 'Выберите банк';
                        }

                        if (paymentMethod === 'mixed') {
                            const cash = parseFloat(cashAmount) || 0;
                            const card = parseFloat(cardAmount) || 0;
                            const total = cash + card;

                            if (total < finalPrice) {
                                isPaymentValid = false;
                                buttonText = `Не хватает ${(finalPrice - total).toLocaleString()} сом`;
                            } else if (total > finalPrice) {
                                isPaymentValid = false;
                                buttonText = `Переплата ${(total - finalPrice).toLocaleString()} сом`;
                            } else {
                                buttonText = 'Оформить продажу';
                            }
                        } else if (paymentMethod) {
                            buttonText = 'Оформить продажу';
                        }

                        return (
                            <TouchableOpacity
                                style={[
                                    styles.confirmButton,
                                    { backgroundColor: isPaymentValid ? accentColor : colors.border.normal }
                                ]}
                                onPress={handleConfirm}
                                activeOpacity={0.8}
                                disabled={!isPaymentValid}
                            >
                                <Text style={[styles.confirmButtonText, { opacity: isPaymentValid ? 1 : 0.5 }]}>
                                    {buttonText}
                                </Text>
                                <Ionicons name="checkmark-circle" size={22} color="white" style={{ opacity: isPaymentValid ? 1 : 0.5 }} />
                            </TouchableOpacity>
                        );
                    })()}
                </View>

                {/* Модальное окно выбора клиента */}
                <Modal
                    visible={showClientModal}
                    animationType="slide"
                    presentationStyle="pageSheet"
                    onRequestClose={() => setShowClientModal(false)}
                >
                    <SafeAreaView style={[styles.modalContainer, { backgroundColor: colors.background.screen }]}>
                        <View style={[styles.modalHeader, { borderBottomColor: colors.border.normal }]}>
                            <TouchableOpacity onPress={() => setShowClientModal(false)}>
                                <Ionicons name="close" size={24} color={colors.text.normal} />
                            </TouchableOpacity>
                            <Text style={[styles.modalTitle, { color: colors.text.normal }]}>
                                Выбор клиента
                            </Text>
                            <TouchableOpacity onPress={() => {
                                setShowClientModal(false);
                                setTimeout(() => {
                                    setShowAddClientModal(true);
                                }, 300);
                            }}>
                                <Ionicons name="add" size={28} color={accentColor} />
                            </TouchableOpacity>
                        </View>

                        {/* Поиск */}
                        <View style={[styles.searchContainer, { backgroundColor: colors.background.card }]}>
                            <Ionicons name="search" size={20} color={colors.text.muted} />
                            <TextInput
                                style={[styles.searchInput, { color: colors.text.normal }]}
                                placeholder="Поиск по имени или телефону..."
                                placeholderTextColor={colors.text.muted}
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                            />
                            {searchQuery.length > 0 && (
                                <TouchableOpacity onPress={() => setSearchQuery('')}>
                                    <Ionicons name="close-circle" size={20} color={colors.text.muted} />
                                </TouchableOpacity>
                            )}
                        </View>

                        {/* Список клиентов */}
                        {isSearching ? (
                            <ActivityIndicator size="large" color={accentColor} style={{ marginTop: 40 }} />
                        ) : (
                            <FlatList
                                data={clients}
                                keyExtractor={(item) => item.id.toString()}
                                contentContainerStyle={styles.clientsList}
                                ListEmptyComponent={
                                    <View style={styles.emptyContainer}>
                                        <Ionicons name="people-outline" size={48} color={colors.text.muted} />
                                        <Text style={[styles.emptyText, { color: colors.text.muted }]}>
                                            {searchQuery ? 'Клиенты не найдены' : 'Нет клиентов'}
                                        </Text>
                                        <TouchableOpacity
                                            style={[styles.addClientButton, { backgroundColor: accentColor }]}
                                            onPress={() => setShowAddClientModal(true)}
                                        >
                                            <Ionicons name="add" size={20} color="white" />
                                            <Text style={styles.addClientButtonText}>Добавить клиента</Text>
                                        </TouchableOpacity>
                                    </View>
                                }
                                renderItem={({ item }) => (
                                    <TouchableOpacity
                                        style={[styles.clientItem, { backgroundColor: colors.background.card }]}
                                        onPress={() => handleSelectClient(item)}
                                    >
                                        <View style={[styles.clientAvatar, { backgroundColor: accentColor + '20' }]}>
                                            <Text style={[styles.avatarText, { color: accentColor }]}>
                                                {item.name.charAt(0).toUpperCase()}
                                            </Text>
                                        </View>
                                        <View style={styles.clientItemInfo}>
                                            <Text style={[styles.clientItemName, { color: colors.text.normal }]}>
                                                {item.name}
                                            </Text>
                                            {item.phone && (
                                                <Text style={[styles.clientItemPhone, { color: colors.text.muted }]}>
                                                    {item.phone}
                                                </Text>
                                            )}
                                        </View>
                                        {selectedClient?.id === item.id && (
                                            <Ionicons name="checkmark-circle" size={24} color={accentColor} />
                                        )}
                                    </TouchableOpacity>
                                )}
                            />
                        )}

                        {/* Кнопка "Без клиента" */}
                        <TouchableOpacity
                            style={[styles.skipClientButton, { borderTopColor: colors.border.normal }]}
                            onPress={() => {
                                setSelectedClient(null);
                                setShowClientModal(false);
                            }}
                        >
                            <Text style={[styles.skipClientText, { color: colors.text.muted }]}>
                                Продолжить без клиента
                            </Text>
                        </TouchableOpacity>
                    </SafeAreaView>
                </Modal>

                {/* Модальное окно добавления клиента */}
                <Modal
                    visible={showAddClientModal}
                    animationType="slide"
                    presentationStyle="formSheet"
                    onRequestClose={() => setShowAddClientModal(false)}
                >
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        style={[styles.addClientModal, { backgroundColor: colors.background.screen }]}
                    >
                        <SafeAreaView style={{ flex: 1 }}>
                            <View style={[styles.modalHeader, { borderBottomColor: colors.border.normal }]}>
                                <TouchableOpacity onPress={() => {
                                    setShowAddClientModal(false);
                                    // Возвращаемся к выбору клиента
                                    setTimeout(() => {
                                        setShowClientModal(true);
                                    }, 300);
                                }}>
                                    <Text style={[styles.cancelText, { color: colors.text.muted }]}>Отмена</Text>
                                </TouchableOpacity>
                                <Text style={[styles.modalTitle, { color: colors.text.normal }]}>
                                    Новый клиент
                                </Text>
                                <TouchableOpacity
                                    onPress={handleAddClient}
                                    disabled={isAddingClient || !newClientName.trim()}
                                >
                                    {isAddingClient ? (
                                        <ActivityIndicator size="small" color={accentColor} />
                                    ) : (
                                        <Text style={[
                                            styles.saveText,
                                            { color: newClientName.trim() ? accentColor : colors.text.muted }
                                        ]}>
                                            Сохранить
                                        </Text>
                                    )}
                                </TouchableOpacity>
                            </View>

                            <ScrollView style={styles.addClientForm}>
                                <View style={styles.inputGroup}>
                                    <Text style={[styles.inputLabel, { color: colors.text.muted }]}>
                                        Имя *
                                    </Text>
                                    <TextInput
                                        style={[styles.textInput, {
                                            backgroundColor: colors.background.card,
                                            color: colors.text.normal,
                                            borderColor: colors.border.normal
                                        }]}
                                        placeholder="Введите имя"
                                        placeholderTextColor={colors.text.muted}
                                        value={newClientName}
                                        onChangeText={setNewClientName}
                                        autoFocus
                                    />
                                </View>

                                <View style={styles.inputGroup}>
                                    <Text style={[styles.inputLabel, { color: colors.text.muted }]}>
                                        Телефон
                                    </Text>
                                    <TextInput
                                        style={[styles.textInput, {
                                            backgroundColor: colors.background.card,
                                            color: colors.text.normal,
                                            borderColor: colors.border.normal
                                        }]}
                                        placeholder="992XXXXXXXXX"
                                        placeholderTextColor={colors.text.muted}
                                        value={newClientPhone}
                                        onChangeText={(text) => setNewClientPhone(text.replace(/[^0-9]/g, ''))}
                                        keyboardType="number-pad"
                                        maxLength={12}
                                    />
                                </View>

                                <View style={styles.inputGroup}>
                                    <Text style={[styles.inputLabel, { color: colors.text.muted }]}>
                                        Адрес
                                    </Text>
                                    <TextInput
                                        style={[styles.textInput, {
                                            backgroundColor: colors.background.card,
                                            color: colors.text.normal,
                                            borderColor: colors.border.normal
                                        }]}
                                        placeholder="Введите адрес"
                                        placeholderTextColor={colors.text.muted}
                                        value={newClientAddress}
                                        onChangeText={setNewClientAddress}
                                    />
                                </View>

                                <View style={styles.inputGroup}>
                                    <Text style={[styles.inputLabel, { color: colors.text.muted }]}>
                                        День рождения
                                    </Text>
                                    <TouchableOpacity
                                        style={[styles.textInput, {
                                            backgroundColor: colors.background.card,
                                            borderColor: colors.border.normal,
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            justifyContent: 'space-between'
                                        }]}
                                        onPress={() => setShowDatePicker(true)}
                                    >
                                        <Text style={{
                                            fontSize: 16,
                                            color: newClientBirthday ? colors.text.normal : colors.text.muted
                                        }}>
                                            {newClientBirthday || 'Выберите дату'}
                                        </Text>
                                        <Ionicons name="calendar-outline" size={20} color={colors.text.muted} />
                                    </TouchableOpacity>
                                </View>
                            </ScrollView>
                        </SafeAreaView>
                    </KeyboardAvoidingView>

                    {/* Birthday Date Picker */}
                    {Platform.OS === 'ios' ? (
                        <Modal
                            visible={showDatePicker}
                            transparent={true}
                            animationType="fade"
                            onRequestClose={() => setShowDatePicker(false)}
                        >
                            <View style={styles.datePickerOverlay}>
                                <View style={[styles.datePickerContainer, { backgroundColor: colors.background.card }]}>
                                    <View style={[styles.datePickerHeader, { borderBottomColor: colors.border.normal }]}>
                                        <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                                            <Text style={[styles.datePickerCancel, { color: colors.text.muted }]}>Отмена</Text>
                                        </TouchableOpacity>
                                        <Text style={[styles.datePickerTitle, { color: colors.text.normal }]}>День рождения</Text>
                                        <TouchableOpacity onPress={() => {
                                            if (selectedDate) {
                                                const day = selectedDate.getDate().toString().padStart(2, '0');
                                                const month = (selectedDate.getMonth() + 1).toString().padStart(2, '0');
                                                const year = selectedDate.getFullYear();
                                                setNewClientBirthday(`${day}.${month}.${year}`);
                                            }
                                            setShowDatePicker(false);
                                        }}>
                                            <Text style={[styles.datePickerDone, { color: accentColor }]}>Готово</Text>
                                        </TouchableOpacity>
                                    </View>
                                    <DateTimePicker
                                        value={selectedDate || new Date(2000, 0, 1)}
                                        mode="date"
                                        display="spinner"
                                        themeVariant={isDark ? 'dark' : 'light'}
                                        textColor={colors.text.normal}
                                        maximumDate={new Date()}
                                        minimumDate={new Date(1920, 0, 1)}
                                        onChange={(event, date) => {
                                            if (date) {
                                                setSelectedDate(date);
                                            }
                                        }}
                                        style={{ backgroundColor: colors.background.card }}
                                    />
                                </View>
                            </View>
                        </Modal>
                    ) : (
                        showDatePicker && (
                            <DateTimePicker
                                value={selectedDate || new Date(2000, 0, 1)}
                                mode="date"
                                display="default"
                                themeVariant={isDark ? 'dark' : 'light'}
                                maximumDate={new Date()}
                                minimumDate={new Date(1920, 0, 1)}
                                onChange={(event, date) => {
                                    setShowDatePicker(false);
                                    if (date && event.type !== 'dismissed') {
                                        setSelectedDate(date);
                                        const day = date.getDate().toString().padStart(2, '0');
                                        const month = (date.getMonth() + 1).toString().padStart(2, '0');
                                        const year = date.getFullYear();
                                        setNewClientBirthday(`${day}.${month}.${year}`);
                                    }
                                }}
                            />
                        )
                    )}
                </Modal>

                <Toast
                    visible={toastVisible}
                    message={toastMessage}
                    type={toastType}
                    onHide={() => setToastVisible(false)}
                />
            </SafeAreaView>
        </Modal>
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
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    backButton: {
        padding: 8,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '600',
    },
    content: {
        flex: 1,
        padding: 16,
    },
    section: {
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 16,
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 8,
    },
    summaryLabel: {
        fontSize: 14,
    },
    summaryValue: {
        fontSize: 14,
        fontWeight: '500',
    },
    divider: {
        height: 1,
        marginVertical: 12,
    },
    totalLabel: {
        fontSize: 16,
        fontWeight: '600',
    },
    totalValue: {
        fontSize: 20,
        fontWeight: '700',
    },
    clientSelector: {
        borderWidth: 1,
        borderRadius: 12,
        padding: 16,
        borderStyle: 'dashed',
    },
    selectedClientInfo: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    clientAvatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
    },
    clientDetails: {
        flex: 1,
        marginLeft: 12,
    },
    clientName: {
        fontSize: 16,
        fontWeight: '500',
    },
    clientPhone: {
        fontSize: 14,
        marginTop: 2,
    },
    addClientPlaceholder: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    addClientText: {
        flex: 1,
        fontSize: 16,
        fontWeight: '500',
    },
    clientHint: {
        fontSize: 12,
        marginTop: 12,
    },
    footer: {
        padding: 16,
        borderTopWidth: 1,
    },
    confirmButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        borderRadius: 12,
        gap: 8,
    },
    confirmButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '600',
    },
    // Modal styles
    modalContainer: {
        flex: 1,
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    modalTitle: {
        fontSize: 17,
        fontWeight: '600',
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        margin: 16,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 10,
        gap: 8,
    },
    searchInput: {
        flex: 1,
        fontSize: 16,
    },
    clientsList: {
        padding: 16,
        paddingTop: 0,
    },
    clientItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 12,
        marginBottom: 8,
    },
    avatarText: {
        fontSize: 18,
        fontWeight: '600',
    },
    clientItemInfo: {
        flex: 1,
        marginLeft: 12,
    },
    clientItemName: {
        fontSize: 16,
        fontWeight: '500',
    },
    clientItemPhone: {
        fontSize: 14,
        marginTop: 2,
    },
    emptyContainer: {
        alignItems: 'center',
        paddingTop: 60,
    },
    emptyText: {
        fontSize: 16,
        marginTop: 12,
        marginBottom: 24,
    },
    addClientButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 10,
        gap: 8,
    },
    addClientButtonText: {
        color: 'white',
        fontSize: 14,
        fontWeight: '600',
    },
    skipClientButton: {
        padding: 16,
        alignItems: 'center',
        borderTopWidth: 1,
    },
    skipClientText: {
        fontSize: 16,
    },
    // Add client modal
    addClientModal: {
        flex: 1,
    },
    cancelText: {
        fontSize: 16,
    },
    saveText: {
        fontSize: 16,
        fontWeight: '600',
    },
    addClientForm: {
        padding: 16,
    },
    inputGroup: {
        marginBottom: 20,
    },
    inputLabel: {
        fontSize: 13,
        fontWeight: '500',
        marginBottom: 8,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    textInput: {
        fontSize: 16,
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderRadius: 10,
        borderWidth: 1,
    },
    // Стили скидки
    discountHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    discountHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    discountBadge: {
        marginLeft: 8,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    discountBadgeText: {
        color: 'white',
        fontSize: 12,
        fontWeight: '600',
    },
    discountContent: {
        marginTop: 16,
    },
    discountModeSelector: {
        flexDirection: 'row',
        borderRadius: 10,
        padding: 4,
    },
    discountModeButton: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        borderRadius: 8,
    },
    discountModeText: {
        fontSize: 14,
        fontWeight: '500',
    },
    discountInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 12,
    },
    discountInput: {
        flex: 1,
        fontSize: 18,
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderRadius: 10,
        borderWidth: 1,
    },
    discountSuffix: {
        marginLeft: 12,
        fontSize: 16,
        fontWeight: '500',
    },
    discountCalculation: {
        marginTop: 12,
        padding: 12,
        borderRadius: 8,
    },
    discountCalcText: {
        fontSize: 14,
        fontWeight: '500',
        textAlign: 'center',
    },
    clearDiscountButton: {
        marginTop: 12,
        alignItems: 'center',
    },
    clearDiscountText: {
        fontSize: 14,
    },
    // Стили оплаты
    paymentOptions: {
        gap: 10,
    },
    paymentOption: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        borderRadius: 12,
        borderWidth: 1.5,
        gap: 12,
    },
    paymentOptionText: {
        flex: 1,
        fontSize: 15,
        fontWeight: '500',
    },
    mixedPaymentFields: {
        marginTop: 16,
        gap: 12,
    },
    mixedPaymentRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    mixedPaymentLabel: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    mixedPaymentLabelText: {
        fontSize: 14,
    },
    mixedPaymentInputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    mixedPaymentInput: {
        width: 120,
        fontSize: 16,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 8,
        borderWidth: 1,
        textAlign: 'right',
    },
    mixedPaymentSuffix: {
        marginLeft: 8,
        fontSize: 14,
    },
    mixedPaymentHint: {
        marginTop: 4,
        padding: 10,
        borderRadius: 8,
    },
    mixedPaymentHintText: {
        fontSize: 13,
        fontWeight: '500',
        textAlign: 'center',
    },
    // Стили выбора банка
    bankSelector: {
        marginTop: 16,
    },
    bankSelectorTitle: {
        fontSize: 13,
        fontWeight: '500',
        marginBottom: 10,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    bankOptions: {
        flexDirection: 'row',
        gap: 12,
    },
    bankOption: {
        flex: 1,
        flexDirection: 'column',
        alignItems: 'center',
        padding: 16,
        borderRadius: 12,
        borderWidth: 2,
        gap: 8,
    },
    bankLogo: {
        width: 48,
        height: 48,
        borderRadius: 8,
    },
    bankName: {
        fontSize: 13,
        fontWeight: '500',
        textAlign: 'center',
    },
    // Date Picker Modal styles
    datePickerOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    datePickerContainer: {
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingBottom: 34,
    },
    datePickerHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: 1,
    },
    datePickerCancel: {
        fontSize: 16,
    },
    datePickerTitle: {
        fontSize: 17,
        fontWeight: '600',
    },
    datePickerDone: {
        fontSize: 16,
        fontWeight: '600',
    },
});

export default CheckoutScreen;
