import React, { useState, useEffect, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    FlatList,
    TextInput,
    ActivityIndicator,
    Alert,
    ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ProfileStackParamList } from '../types/navigation';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../../constants/theme';
import { getAllClients, getAllTransactions } from '../../database/database';
import { Client, Transaction } from '../../database/types';

type FilterType = 'all' | 'birthday_today' | 'has_purchases' | 'no_purchases' | 'by_birthday';

export default function ClientsScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
    const { isDark } = useTheme();
    const colors = getThemeColors(isDark);

    const [clients, setClients] = useState<Client[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState<FilterType>('all');
    const [purchaseCounts, setPurchaseCounts] = useState<Record<number, number>>({});

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
            computePurchaseCounts(loadedClients, loadedTransactions);
        } catch (error) {
            console.error('Error loading clients data:', error);
            Alert.alert('Ошибка', 'Не удалось загрузить данные клиентов');
        } finally {
            setLoading(false);
        }
    };

    const computePurchaseCounts = (clientsList: Client[], txList: Transaction[]) => {
        const counts: Record<number, number> = {};
        clientsList.forEach(c => { counts[c.id] = 0; });

        txList.forEach(tx => {
            if (tx.details) {
                try {
                    const det = JSON.parse(tx.details);
                    if (det.type === 'sale' && det.sale) {
                        // Match by clientUuid first, then clientId
                        let matched = false;
                        for (const cl of clientsList) {
                            if (det.clientUuid && cl.uuid && det.clientUuid === cl.uuid) {
                                counts[cl.id] = (counts[cl.id] || 0) + 1;
                                matched = true;
                                break;
                            }
                        }
                        if (!matched && det.clientId != null) {
                            const cid = typeof det.clientId === 'string' ? parseInt(det.clientId, 10) : det.clientId;
                            if (counts[cid] !== undefined) {
                                counts[cid] = (counts[cid] || 0) + 1;
                            }
                        }
                    }
                } catch (e) { /* ignore */ }
            }
        });

        setPurchaseCounts(counts);
    };

    // Helper: check if client's birthday is today
    const isBirthdayToday = (birthday: string | null | undefined): boolean => {
        if (!birthday) return false;
        const today = new Date();
        const todayDD = String(today.getDate()).padStart(2, '0');
        const todayMM = String(today.getMonth() + 1).padStart(2, '0');

        // Support formats: DD.MM.YYYY or DD.MM or YYYY-MM-DD
        const parts = birthday.includes('-') ? birthday.split('-') : birthday.split('.');
        let dd: string, mm: string;
        if (birthday.includes('-')) {
            // YYYY-MM-DD
            mm = parts[1];
            dd = parts[2];
        } else {
            // DD.MM.YYYY or DD.MM
            dd = parts[0];
            mm = parts[1];
        }
        if (!dd || !mm) return false;
        return dd.padStart(2, '0') === todayDD && mm.padStart(2, '0') === todayMM;
    };

    // Helper: get birthday as sortable month-day number (for sorting by upcoming)
    const getBirthdayDayOfYear = (birthday: string | null | undefined): number => {
        if (!birthday) return 9999;
        const parts = birthday.includes('-') ? birthday.split('-') : birthday.split('.');
        let dd: number, mm: number;
        if (birthday.includes('-')) {
            mm = parseInt(parts[1], 10);
            dd = parseInt(parts[2], 10);
        } else {
            dd = parseInt(parts[0], 10);
            mm = parseInt(parts[1], 10);
        }
        if (isNaN(dd) || isNaN(mm)) return 9999;

        const today = new Date();
        const todayDoy = today.getMonth() * 31 + today.getDate();
        const bdayDoy = (mm - 1) * 31 + dd;
        // Return days until birthday (wrapping around year)
        return bdayDoy >= todayDoy ? bdayDoy - todayDoy : (365 + bdayDoy - todayDoy);
    };

    const filteredClients = useMemo(() => {
        let result = clients;

        // Apply text search
        if (searchQuery) {
            const lowerQuery = searchQuery.toLowerCase();
            result = result.filter(client =>
                client.name.toLowerCase().includes(lowerQuery) ||
                (client.phone && client.phone.includes(searchQuery))
            );
        }

        // Apply filter
        switch (activeFilter) {
            case 'birthday_today':
                result = result.filter(c => isBirthdayToday(c.birthday));
                break;
            case 'has_purchases':
                result = result.filter(c => (purchaseCounts[c.id] || 0) > 0);
                break;
            case 'no_purchases':
                result = result.filter(c => (purchaseCounts[c.id] || 0) === 0);
                break;
            case 'by_birthday':
                result = result.filter(c => !!c.birthday);
                result = [...result].sort((a, b) => getBirthdayDayOfYear(a.birthday) - getBirthdayDayOfYear(b.birthday));
                break;
        }

        return result;
    }, [clients, searchQuery, activeFilter, purchaseCounts]);

    // Count birthdays today for badge
    const birthdayTodayCount = useMemo(() => {
        return clients.filter(c => isBirthdayToday(c.birthday)).length;
    }, [clients]);

    const filters: { key: FilterType; label: string; icon: string }[] = [
        { key: 'all', label: 'Все', icon: 'people-outline' },
        { key: 'birthday_today', label: `ДР сегодня${birthdayTodayCount > 0 ? ` (${birthdayTodayCount})` : ''}`, icon: 'gift-outline' },
        { key: 'has_purchases', label: 'С покупками', icon: 'cart-outline' },
        { key: 'no_purchases', label: 'Без покупок', icon: 'close-circle-outline' },
        { key: 'by_birthday', label: 'По ДР', icon: 'calendar-outline' },
    ];

    const renderClientItem = ({ item }: { item: Client }) => {
        const count = purchaseCounts[item.id] || 0;
        const isBdayToday = isBirthdayToday(item.birthday);

        return (
            <TouchableOpacity
                style={[
                    styles.clientCard,
                    { backgroundColor: colors.background.card, borderColor: isBdayToday ? '#f59e0b' : colors.border.light },
                    isBdayToday && styles.birthdayCard
                ]}
                onPress={() => navigation.navigate('ClientDetails', { client: item })}
                activeOpacity={0.7}
            >
                <View style={styles.clientHeader}>
                    <View style={styles.clientInfo}>
                        <View style={styles.nameRow}>
                            <Text style={[styles.clientName, { color: colors.text.normal }]}>{item.name}</Text>
                            {isBdayToday && (
                                <Text style={styles.birthdayEmoji}>🎂</Text>
                            )}
                        </View>
                        {item.phone && (
                            <Text style={[styles.clientPhone, { color: colors.text.muted }]}>{item.phone}</Text>
                        )}
                    </View>
                    <View style={styles.rightSection}>
                        {count > 0 && (
                            <View style={[styles.purchaseBadge, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.1)' }]}>
                                <Ionicons name="cart" size={12} color={colors.primary.blue} />
                                <Text style={[styles.purchaseCount, { color: colors.primary.blue }]}>{count}</Text>
                            </View>
                        )}
                        <View style={[styles.avatar, { backgroundColor: isDark ? 'rgba(212, 175, 55, 0.2)' : 'rgba(59, 130, 246, 0.1)' }]}>
                            <Text style={[styles.avatarText, { color: colors.primary.blue }]}>
                                {item.name.charAt(0).toUpperCase()}
                            </Text>
                        </View>
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
                                <Ionicons name="gift-outline" size={16} color={isBdayToday ? '#f59e0b' : colors.text.muted} />
                                <Text style={[styles.detailText, { color: isBdayToday ? '#f59e0b' : colors.text.muted }]}>{item.birthday}</Text>
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
            </TouchableOpacity>
        );
    };

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

            {/* Client Count */}
            <View style={styles.countContainer}>
                <Text style={[styles.countText, { color: colors.text.muted }]}>
                    Всего: {filteredClients.length} клиент(ов)
                    {activeFilter !== 'all' ? ` из ${clients.length}` : ''}
                </Text>
            </View>

            {/* Filter Chips Container */}
            <View style={styles.filtersWrapper}>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.filtersContainer}
                    style={styles.filtersScroll}
                >
                    {filters.map(f => {
                        const isActive = activeFilter === f.key;
                        const count = f.key === 'birthday_today' ? clients.filter(c => isBirthdayToday(c.birthday)).length : null;

                        return (
                            <TouchableOpacity
                                key={f.key}
                                onPress={() => setActiveFilter(isActive && f.key !== 'all' ? 'all' : f.key)}
                                style={[
                                    styles.filterChip,
                                    {
                                        backgroundColor: isActive
                                            ? (isDark ? '#d4af37' : '#3b82f6')
                                            : (isDark ? '#2a2a2e' : '#ffffff'),
                                        borderColor: isActive
                                            ? 'transparent'
                                            : (isDark ? '#444' : '#d1d5db'),
                                        shadowColor: isActive ? (isDark ? '#d4af37' : '#3b82f6') : '#000',
                                        shadowOpacity: isActive ? 0.3 : 0.08,
                                        shadowOffset: { width: 0, height: 2 },
                                        shadowRadius: isActive ? 6 : 3,
                                        elevation: isActive ? 4 : 2,
                                    }
                                ]}
                                activeOpacity={0.7}
                            >
                                <Ionicons
                                    name={f.icon as any}
                                    size={16}
                                    color={isActive ? '#fff' : (isDark ? '#ccc' : '#555')}
                                />
                                <Text style={[
                                    styles.filterChipText,
                                    { color: isActive ? '#fff' : (isDark ? '#e0e0e0' : '#374151') }
                                ]}>
                                    {f.label}
                                </Text>
                                {count !== null && count > 0 && (
                                    <View style={[styles.filterBadge, { backgroundColor: isDark ? '#b8860b' : '#2563eb' }]}>
                                        <Text style={styles.filterBadgeText}>{count}</Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
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
                                {searchQuery ? 'Ничего не найдено' :
                                    activeFilter === 'birthday_today' ? 'Нет именинников сегодня' :
                                        activeFilter === 'has_purchases' ? 'Нет клиентов с покупками' :
                                            activeFilter === 'no_purchases' ? 'Нет клиентов без покупок' :
                                                'Список клиентов пуст'}
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
        marginHorizontal: 16,
        marginTop: 16,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 12,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
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
    countContainer: {
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 4,
    },
    countText: {
        fontSize: 13,
        fontWeight: '500',
    },
    filtersWrapper: {
        height: 64,
        zIndex: 10, // Ensure it's above the list if they somehow touch
    },
    filtersScroll: {
        flex: 1,
    },
    filtersContainer: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        gap: 8,
        alignItems: 'center',
    },
    filterChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 20,
        borderWidth: 1,
        gap: 6,
    },
    filterChipText: {
        fontSize: 13,
        fontWeight: '600',
    },
    listContent: {
        padding: 16,
        paddingTop: 24,
    },
    filterBadge: {
        marginLeft: 4,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 10,
        minWidth: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    filterBadgeText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: 'bold',
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
    birthdayCard: {
        borderWidth: 2,
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
    nameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    clientName: {
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 4,
    },
    birthdayEmoji: {
        fontSize: 16,
        marginBottom: 4,
    },
    clientPhone: {
        fontSize: 14,
    },
    rightSection: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    purchaseBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        gap: 4,
    },
    purchaseCount: {
        fontSize: 12,
        fontWeight: '600',
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
