import React, { useState, useEffect, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    FlatList,
    ActivityIndicator,
    Alert,
    ScrollView,
    Modal,
    TextInput
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { getThemeColors } from '../../constants/theme';
import { getTransactionsByClient, updateClient } from '../../database/database';
import { Client, Transaction } from '../../database/types';

type ParamList = {
    ClientDetails: { client: Client };
};

export default function ClientDetailsScreen() {
    const navigation = useNavigation();
    const route = useRoute<RouteProp<ParamList, 'ClientDetails'>>();
    const { client: initialClient } = route.params;
    const { isDark } = useTheme();
    const colors = getThemeColors(isDark);
    const { isAdmin, isAssistant } = useAuth();

    const [client, setClient] = useState<Client>(initialClient);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ totalSpent: 0, totalProfit: 0, totalItems: 0 });

    // Edit State
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(client.name);
    const [editPhone, setEditPhone] = useState(client.phone || '');
    const [editAddress, setEditAddress] = useState(client.address || '');
    const [editNotes, setEditNotes] = useState(client.notes || '');
    const [editBirthday, setEditBirthday] = useState(client.birthday || '');

    useEffect(() => {
        loadData();
    }, [client.id]);

    const loadData = async () => {
        try {
            setLoading(true);
            const txs = await getTransactionsByClient(client);
            setTransactions(txs);
            calculateStats(txs);
        } catch (error) {
            console.error('Error loading client history:', error);
            Alert.alert('Ошибка', 'Не удалось загрузить историю покупок');
        } finally {
            setLoading(false);
        }
    };

    const calculateStats = (history: Transaction[]) => {
        let totalSpent = 0;
        let totalProfit = 0;
        let totalItems = 0;

        history.forEach(tx => {
            if (tx.details) {
                try {
                    const details = JSON.parse(tx.details);
                    // Check if it's a sale transaction
                    if (details.type === 'sale' && details.sale) {
                        const {
                            quantity = 0,
                            actualSaleAmount,
                            salePrice,
                            price, // legacy
                            profit,
                            costPrice,
                            cost // legacy
                        } = details.sale;

                        // Determine Sale Amount
                        const finalSaleAmount = (actualSaleAmount !== undefined && actualSaleAmount !== null) ? actualSaleAmount
                            : ((salePrice ? salePrice * quantity : 0) || (price ? price * quantity : 0));

                        // Determine Cost Amount
                        const finalCostAmount = ((costPrice !== undefined && costPrice !== null) ? costPrice : (cost || 0)) * quantity;

                        // Determine Profit
                        const finalProfit = (profit !== undefined && profit !== null) ? profit : (finalSaleAmount - finalCostAmount);

                        totalSpent += finalSaleAmount;
                        totalProfit += finalProfit;
                        totalItems += quantity;
                    }
                } catch (e) {
                    console.log('Error parsing transaction details:', e);
                }
            }
        });

        setStats({ totalSpent, totalProfit, totalItems });
    };
    const handleSaveClient = async () => {
        if (!editName.trim()) {
            Alert.alert('Ошибка', 'Имя не может быть пустым');
            return;
        }

        try {
            const updatedClient = {
                ...client,
                name: editName.trim(),
                phone: editPhone.trim() || null,
                address: editAddress.trim() || null,
                notes: editNotes.trim() || null,
                birthday: editBirthday.trim() || null,
                needsSync: 1
            };

            await updateClient(client.id, updatedClient);
            setClient(updatedClient);
            setIsEditing(false);
            Alert.alert('Успех', 'Данные клиента обновлены');
        } catch (error) {
            console.error('Error updating client:', error);
            Alert.alert('Ошибка', 'Не удалось сохранить изменения');
        }
    };

    const groupedTransactions = useMemo(() => {
        const grouped: Record<string, Transaction[]> = {};
        transactions.forEach(tx => {
            const date = new Date(tx.timestamp * 1000);
            const key = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
            if (!grouped[key]) {
                grouped[key] = [];
            }
            grouped[key].push(tx);
        });
        return grouped;
    }, [transactions]);
    const renderTransactionItem = ({ item }: { item: Transaction }) => {
        let details: any = {};
        try {
            details = JSON.parse(item.details || '{}');
        } catch (e) { }

        if (details.type !== 'sale' || !details.sale) return null;

        const { itemName } = item;
        const {
            quantity = 0,
            actualSaleAmount,
            salePrice,
            price,
            profit,
            costPrice,
            cost
        } = details.sale;

        // Fallbacks for display
        const displayPrice = (actualSaleAmount !== undefined && actualSaleAmount !== null) ? actualSaleAmount
            : ((salePrice ? salePrice * quantity : 0) || (price ? price * quantity : 0));
        const displayCost = ((costPrice !== undefined && costPrice !== null) ? costPrice : (cost || 0)) * quantity;
        const displayProfit = (profit !== undefined && profit !== null) ? profit : (displayPrice - displayCost);

        return (
            <View style={[styles.transactionCard, { backgroundColor: colors.background.card, borderColor: colors.border.light }]}>
                <View style={styles.transactionHeader}>
                    <Text style={[styles.productName, { color: colors.text.normal }]}>{itemName}</Text>
                    <Text style={[styles.transactionDate, { color: colors.text.muted }]}>
                        {new Date(item.timestamp * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                </View>

                <View style={styles.transactionDetails}>
                    <View style={styles.detailItem}>
                        <Text style={[styles.detailLabel, { color: colors.text.muted }]}>Кол-во:</Text>
                        <Text style={[styles.detailValue, { color: colors.text.normal }]}>{quantity} шт.</Text>
                    </View>

                    <View style={styles.detailItem}>
                        <Text style={[styles.detailLabel, { color: colors.text.muted }]}>Цена:</Text>
                        <Text style={[styles.detailValue, { color: colors.primary.blue }]}>
                            {displayPrice.toLocaleString()} с.
                        </Text>
                    </View>

                    {isAdmin() && (
                        <View style={styles.detailItem}>
                            <Text style={[styles.detailLabel, { color: colors.text.muted }]}>Прибыль:</Text>
                            <Text style={[styles.detailValue, { color: displayProfit >= 0 ? '#10B981' : '#EF4444' }]}>
                                {displayProfit.toLocaleString()} с.
                            </Text>
                        </View>
                    )}
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background.screen }]} edges={['top']}>
            <View style={[styles.header, { borderBottomColor: colors.border.normal }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={colors.text.normal} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.text.normal }]}>{client.name}</Text>
                {isAssistant() ? (
                    <TouchableOpacity onPress={() => setIsEditing(true)} style={styles.editButton}>
                        <Ionicons name="pencil" size={24} color={colors.primary.blue} />
                    </TouchableOpacity>
                ) : (
                    <View style={{ width: 40 }} />
                )}
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Client Info Card */}
                <View style={[styles.infoCard, { backgroundColor: colors.background.card, borderColor: colors.border.normal }]}>
                    <View style={styles.infoRow}>
                        <Ionicons name="call-outline" size={20} color={colors.text.muted} />
                        <Text style={[styles.infoText, { color: colors.text.normal }]}>{client.phone || 'Нет телефона'}</Text>
                    </View>
                    {client.address && (
                        <View style={styles.infoRow}>
                            <Ionicons name="location-outline" size={20} color={colors.text.muted} />
                            <Text style={[styles.infoText, { color: colors.text.normal }]}>{client.address}</Text>
                        </View>
                    )}
                    {client.birthday && (
                        <View style={styles.infoRow}>
                            <Ionicons name="gift-outline" size={20} color={colors.text.muted} />
                            <Text style={[styles.infoText, { color: colors.text.normal }]}>{client.birthday}</Text>
                        </View>
                    )}
                    {client.notes && (
                        <View style={styles.infoRow}>
                            <Ionicons name="document-text-outline" size={20} color={colors.text.muted} />
                            <Text style={[styles.infoText, { color: colors.text.normal }]}>{client.notes}</Text>
                        </View>
                    )}
                </View>

                {/* Stats */}
                <View style={styles.statsContainer}>
                    <View style={[styles.statCard, { backgroundColor: colors.background.card }]}>
                        <Text style={[styles.statLabel, { color: colors.text.muted }]}>Покупок</Text>
                        <Text style={[styles.statValue, { color: colors.text.normal }]}>{stats.totalItems}</Text>
                    </View>
                    <View style={[styles.statCard, { backgroundColor: colors.background.card }]}>
                        <Text style={[styles.statLabel, { color: colors.text.muted }]}>Сумма</Text>
                        <Text style={[styles.statValue, { color: colors.primary.blue }]}>{stats.totalSpent.toLocaleString()}</Text>
                    </View>
                    {isAdmin() && (
                        <View style={[styles.statCard, { backgroundColor: colors.background.card }]}>
                            <Text style={[styles.statLabel, { color: colors.text.muted }]}>Прибыль</Text>
                            <Text style={[styles.statValue, { color: '#10B981' }]}>{stats.totalProfit.toLocaleString()}</Text>
                        </View>
                    )}
                </View>

                {/* History */}
                <Text style={[styles.sectionTitle, { color: colors.text.normal }]}>История покупок</Text>
                {loading ? (
                    <ActivityIndicator size="large" color={colors.primary.blue} style={{ marginTop: 20 }} />
                ) : (
                    Object.entries(groupedTransactions).map(([date, txs]) => (
                        <View key={date} style={styles.dateGroup}>
                            <Text style={[styles.dateHeader, { color: colors.text.muted, backgroundColor: colors.background.screen }]}>
                                {date}
                            </Text>
                            {txs.map(tx => (
                                <View key={tx.id}>
                                    {renderTransactionItem({ item: tx })}
                                </View>
                            ))}
                        </View>
                    ))
                )}
                {!loading && transactions.length === 0 && (
                    <Text style={[styles.emptyText, { color: colors.text.muted }]}>Нет покупок</Text>
                )}
            </ScrollView>

            {/* Edit Modal */}
            <Modal
                visible={isEditing}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => setIsEditing(false)}
            >
                <SafeAreaView style={[styles.modalContainer, { backgroundColor: colors.background.screen }]}>
                    <View style={[styles.header, { borderBottomColor: colors.border.normal }]}>
                        <TouchableOpacity onPress={() => setIsEditing(false)} style={styles.backButton}>
                            <Text style={{ color: colors.primary.blue, fontSize: 16 }}>Отмена</Text>
                        </TouchableOpacity>
                        <Text style={[styles.headerTitle, { color: colors.text.normal }]}>Редактирование</Text>
                        <TouchableOpacity onPress={handleSaveClient} style={styles.editButton}>
                            <Text style={{ color: colors.primary.blue, fontSize: 16, fontWeight: 'bold' }}>Сохранить</Text>
                        </TouchableOpacity>
                    </View>

                    <ScrollView contentContainerStyle={styles.modalContent}>
                        <View style={styles.inputGroup}>
                            <Text style={[styles.label, { color: colors.text.muted }]}>Имя *</Text>
                            <TextInput
                                style={[styles.input, { backgroundColor: colors.background.card, color: colors.text.normal, borderColor: colors.border.normal }]}
                                value={editName}
                                onChangeText={setEditName}
                                placeholder="Имя клиента"
                                placeholderTextColor={colors.text.muted}
                            />
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={[styles.label, { color: colors.text.muted }]}>Телефон</Text>
                            <TextInput
                                style={[styles.input, { backgroundColor: colors.background.card, color: colors.text.normal, borderColor: colors.border.normal }]}
                                value={editPhone}
                                onChangeText={setEditPhone}
                                placeholder="Телефон"
                                placeholderTextColor={colors.text.muted}
                                keyboardType="phone-pad"
                            />
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={[styles.label, { color: colors.text.muted }]}>Адрес</Text>
                            <TextInput
                                style={[styles.input, { backgroundColor: colors.background.card, color: colors.text.normal, borderColor: colors.border.normal }]}
                                value={editAddress}
                                onChangeText={setEditAddress}
                                placeholder="Адрес"
                                placeholderTextColor={colors.text.muted}
                            />
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={[styles.label, { color: colors.text.muted }]}>День рождения</Text>
                            <TextInput
                                style={[styles.input, { backgroundColor: colors.background.card, color: colors.text.normal, borderColor: colors.border.normal }]}
                                value={editBirthday}
                                onChangeText={setEditBirthday}
                                placeholder="ДД.ММ.ГГГГ"
                                placeholderTextColor={colors.text.muted}
                            />
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={[styles.label, { color: colors.text.muted }]}>Заметки</Text>
                            <TextInput
                                style={[styles.input, { backgroundColor: colors.background.card, color: colors.text.normal, borderColor: colors.border.normal, height: 100 }]}
                                value={editNotes}
                                onChangeText={setEditNotes}
                                placeholder="Дополнительная информация"
                                placeholderTextColor={colors.text.muted}
                                multiline
                                textAlignVertical="top"
                            />
                        </View>
                    </ScrollView>
                </SafeAreaView>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    backButton: { padding: 8, marginLeft: -8 },
    editButton: { padding: 8, marginRight: -8 },
    headerTitle: { fontSize: 18, fontWeight: 'bold' },
    scrollContent: { padding: 16 },
    infoCard: {
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        marginBottom: 20,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    infoText: {
        marginLeft: 10,
        fontSize: 16,
    },
    statsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 24,
    },
    statCard: {
        flex: 1,
        borderRadius: 12,
        padding: 12,
        alignItems: 'center',
        marginHorizontal: 4,
        elevation: 2,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
    },
    statLabel: { fontSize: 12, marginBottom: 4 },
    statValue: { fontSize: 16, fontWeight: 'bold' },
    sectionTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 16 },
    dateGroup: { marginBottom: 20 },
    dateHeader: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 8,
        paddingVertical: 4,
        opacity: 0.8
    },
    transactionCard: {
        borderRadius: 12,
        padding: 12,
        borderWidth: 1,
        marginBottom: 8,
    },
    transactionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    productName: { fontSize: 16, fontWeight: '600', flex: 1 },
    transactionDate: { fontSize: 12 },
    transactionDetails: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
    detailItem: { alignItems: 'flex-start' },
    detailLabel: { fontSize: 12, marginBottom: 2 },
    detailValue: { fontSize: 14, fontWeight: '500' },
    emptyText: { textAlign: 'center', marginTop: 40, fontSize: 16 },
    modalContainer: { flex: 1 },
    modalContent: { padding: 20 },
    inputGroup: { marginBottom: 20 },
    label: { marginBottom: 8, fontSize: 14 },
    input: {
        borderWidth: 1,
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
    },
});
