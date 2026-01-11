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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../../constants/theme';
import { useCart } from '../contexts/CartContext';
import { getAllClients, addClient, searchClients } from '../../database/database';
import { Client } from '../../database/types';
import { Toast } from '../components/Toast';

interface CheckoutScreenProps {
    visible: boolean;
    onClose: () => void;
    onConfirm: (clientId: number | null) => void;
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
    const [isAddingClient, setIsAddingClient] = useState(false);

    // Toast
    const [toastVisible, setToastVisible] = useState(false);
    const [toastMessage, setToastMessage] = useState('');
    const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('success');

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
            setSearchQuery('');
            setIsAddingClient(false);
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
        onConfirm(selectedClient?.id || null);
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
                                Итого
                            </Text>
                            <Text style={[styles.totalValue, { color: accentColor }]}>
                                {cartTotals.totalPrice.toLocaleString()} сом
                            </Text>
                        </View>
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
                </ScrollView>

                {/* Кнопка подтверждения */}
                <View style={[styles.footer, { borderTopColor: colors.border.normal }]}>
                    <TouchableOpacity
                        style={[styles.confirmButton, { backgroundColor: accentColor }]}
                        onPress={handleConfirm}
                        activeOpacity={0.8}
                    >
                        <Text style={styles.confirmButtonText}>Оформить продажу</Text>
                        <Ionicons name="checkmark-circle" size={22} color="white" />
                    </TouchableOpacity>
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
                                        placeholder="+992 XXX XX XX XX"
                                        placeholderTextColor={colors.text.muted}
                                        value={newClientPhone}
                                        onChangeText={setNewClientPhone}
                                        keyboardType="phone-pad"
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
                                    <TextInput
                                        style={[styles.textInput, {
                                            backgroundColor: colors.background.card,
                                            color: colors.text.normal,
                                            borderColor: colors.border.normal
                                        }]}
                                        placeholder="ДД.ММ.ГГГГ"
                                        placeholderTextColor={colors.text.muted}
                                        value={newClientBirthday}
                                        onChangeText={setNewClientBirthday}
                                    />
                                </View>
                            </ScrollView>
                        </SafeAreaView>
                    </KeyboardAvoidingView>
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
});

export default CheckoutScreen;
