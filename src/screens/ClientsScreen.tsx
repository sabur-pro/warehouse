import React, { useState, useEffect, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    FlatList,
    TextInput,
    ActivityIndicator,
    Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../../constants/theme';
import { getAllClients, getAllTransactions } from '../../database/database';
import { Client, Transaction } from '../../database/types';

export default function ClientsScreen() {
    const navigation = useNavigation();
    const { isDark } = useTheme();
    const colors = getThemeColors(isDark);

    const [clients, setClients] = useState<Client[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [stats, setStats] = useState<Record<string, { totalSpent: number, transactionsCount: number }>>({});

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            const [loadedClients, loadedTransactions] = await Promise.all([
                getAllClients(),
                getAllTransactions()
            ]);
            setClients(loadedClients);
            setTransactions(loadedTransactions);
            calculateStats(loadedClients, loadedTransactions);
        } catch (error) {
            console.error('Error loading clients data:', error);
            Alert.alert('Ошибка', 'Не удалось загрузить данные клиентов');
        } finally {
            setLoading(false);
        }
    };

    const calculateStats = (clientsList: Client[], transactionsList: Transaction[]) => {
        const statsMap: Record<string, { totalSpent: number, transactionsCount: number }> = {};

        // Инициализируем статистику для всех клиентов
        clientsList.forEach(client => {
            // Используем имя как ключ, так как в транзакциях нет ID клиента, только детали
            // В будущем лучше связывать по ID, но сейчас логика чекаута не сохраняет clientId в транзакции явно в отдельной колонке, 
            // а может сохранять в details. Для первой версии используем упрощенную логику или покажем только список.
            // TODO: Улучшить связь транзакций и клиентов.
            // Покажем просто список клиентов без статистики транзакций, если нет явной связи.
            // Или если checkout сохраняет имя клиента в details, можно попробовать распарсить.
        });

        // В текущей реализации checkout сохраняет детали транзакции. 
        // Связь клиента и транзакции пока не явная в БД (нет clientId в transactions). 
        // Поэтому покажем просто список клиентов.
        setStats(statsMap);
    };

    const filteredClients = useMemo(() => {
        if (!searchQuery) return clients;
        const lowerQuery = searchQuery.toLowerCase();
        return clients.filter(client =>
            client.name.toLowerCase().includes(lowerQuery) ||
            (client.phone && client.phone.includes(searchQuery))
        );
    }, [clients, searchQuery]);

    const renderClientItem = ({ item }: { item: Client }) => (
        <View style={[styles.clientCard, { backgroundColor: colors.background.card, borderColor: colors.border.light }]}>
            <View style={styles.clientHeader}>
                <View style={styles.clientInfo}>
                    <Text style={[styles.clientName, { color: colors.text.normal }]}>{item.name}</Text>
                    {item.phone && (
                        <Text style={[styles.clientPhone, { color: colors.text.muted }]}>{item.phone}</Text>
                    )}
                </View>
                <View style={[styles.avatar, { backgroundColor: isDark ? 'rgba(212, 175, 55, 0.2)' : 'rgba(59, 130, 246, 0.1)' }]}>
                    <Text style={[styles.avatarText, { color: colors.primary.blue }]}>
                        {item.name.charAt(0).toUpperCase()}
                    </Text>
                </View>
            </View>

            {(item.address || item.birthday || item.notes) && (
                <View style={[styles.clientDetails, { borderTopColor: colors.border.light }]}>
                    {item.address && (
                        <View style={styles.detailRow}>
                            <Ionicons name="location-outline" size={16} color={colors.text.muted} />
                            <Text style={[styles.detailText, { color: colors.text.muted }]}>{item.address}</Text>
                        </View>
                    )}
                    {item.birthday && (
                        <View style={styles.detailRow}>
                            <Ionicons name="gift-outline" size={16} color={colors.text.muted} />
                            <Text style={[styles.detailText, { color: colors.text.muted }]}>{item.birthday}</Text>
                        </View>
                    )}
                    {item.notes && (
                        <View style={styles.detailRow}>
                            <Ionicons name="document-text-outline" size={16} color={colors.text.muted} />
                            <Text style={[styles.detailText, { color: colors.text.muted }]}>{item.notes}</Text>
                        </View>
                    )}
                </View>
            )}
        </View>
    );

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background.screen }]} edges={['top']}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border.normal }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={colors.text.normal} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.text.normal }]}>Клиенты</Text>
                <View style={{ width: 40 }} />
            </View>

            {/* Search */}
            <View style={[styles.searchContainer, { backgroundColor: colors.background.card }]}>
                <Ionicons name="search" size={20} color={colors.text.muted} style={styles.searchIcon} />
                <TextInput
                    style={[styles.searchInput, { color: colors.text.normal }]}
                    placeholder="Поиск клиентов..."
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

            {/* List */}
            {loading ? (
                <View style={styles.centered}>
                    <ActivityIndicator size="large" color={colors.primary.blue} />
                </View>
            ) : (
                <FlatList
                    data={filteredClients}
                    renderItem={renderClientItem}
                    keyExtractor={item => item.id?.toString() || item.uuid || Math.random().toString()}
                    contentContainerStyle={styles.listContent}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Ionicons name="people-outline" size={64} color={colors.text.muted} />
                            <Text style={[styles.emptyText, { color: colors.text.muted }]}>
                                {searchQuery ? 'Ничего не найдено' : 'Список клиентов пуст'}
                            </Text>
                        </View>
                    }
                />
            )}
        </SafeAreaView>
    );
}

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
        marginLeft: -8,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        margin: 16,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 12,
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.05,
        shadowRadius: 3.84,
        elevation: 2,
    },
    searchIcon: {
        marginRight: 10,
    },
    searchInput: {
        flex: 1,
        fontSize: 16,
    },
    listContent: {
        padding: 16,
        paddingTop: 0,
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    clientCard: {
        borderRadius: 16,
        marginBottom: 12,
        borderWidth: 1,
        overflow: 'hidden',
    },
    clientHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
    },
    clientInfo: {
        flex: 1,
        marginRight: 12,
    },
    clientName: {
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 4,
    },
    clientPhone: {
        fontSize: 14,
    },
    avatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        fontSize: 20,
        fontWeight: 'bold',
    },
    clientDetails: {
        padding: 16,
        paddingTop: 12,
        borderTopWidth: 1,
    },
    detailRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 6,
    },
    detailText: {
        marginLeft: 8,
        fontSize: 14,
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 60,
    },
    emptyText: {
        marginTop: 16,
        fontSize: 16,
    }
});
