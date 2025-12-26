// src/screens/PendingActionsScreen.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    Alert,
    ActivityIndicator,
    RefreshControl,
    Modal,
    TextInput,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../../constants/theme';
import SyncService from '../services/SyncService';

interface PendingAction {
    id: number;
    actionType: 'UPDATE_ITEM' | 'DELETE_ITEM' | 'DELETE_TRANSACTION';
    status: string;
    itemId?: number;
    transactionId?: number;
    oldData: string;
    newData: string;
    reason?: string;
    createdAt: string;
    expiresAt: string;
}

export default function PendingActionsScreen() {
    const navigation = useNavigation();
    const { isDark } = useTheme();
    const colors = getThemeColors(isDark);

    const [actions, setActions] = useState<PendingAction[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [processingId, setProcessingId] = useState<number | null>(null);

    // Modal for comment
    const [showCommentModal, setShowCommentModal] = useState(false);
    const [selectedAction, setSelectedAction] = useState<PendingAction | null>(null);
    const [actionMode, setActionMode] = useState<'approve' | 'reject'>('approve');
    const [comment, setComment] = useState('');

    const loadActions = useCallback(async () => {
        try {
            const data = await SyncService.getPendingActions();
            setActions(data);
        } catch (error) {
            console.error('Error loading pending actions:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadActions();
    }, [loadActions]);

    const onRefresh = async () => {
        setRefreshing(true);
        await loadActions();
        setRefreshing(false);
    };

    const handleApprove = (action: PendingAction) => {
        setSelectedAction(action);
        setActionMode('approve');
        setComment('');
        setShowCommentModal(true);
    };

    const handleReject = (action: PendingAction) => {
        setSelectedAction(action);
        setActionMode('reject');
        setComment('');
        setShowCommentModal(true);
    };

    const confirmAction = async () => {
        if (!selectedAction) return;

        setShowCommentModal(false);
        setProcessingId(selectedAction.id);

        try {
            if (actionMode === 'approve') {
                await SyncService.approveAction(selectedAction.id, comment || undefined);
                Alert.alert('Успех', 'Заявка одобрена');
            } else {
                await SyncService.rejectAction(selectedAction.id, comment || undefined);
                Alert.alert('Успех', 'Заявка отклонена');
            }

            // Remove from list
            setActions(prev => prev.filter(a => a.id !== selectedAction.id));
        } catch (error: any) {
            const message = error.response?.data?.message || error.message || 'Ошибка';
            Alert.alert('Ошибка', message);
        } finally {
            setProcessingId(null);
            setSelectedAction(null);
        }
    };

    const getActionTypeLabel = (type: string) => {
        switch (type) {
            case 'UPDATE_ITEM':
                return 'Изменение товара';
            case 'DELETE_ITEM':
                return 'Удаление товара';
            case 'DELETE_TRANSACTION':
                return 'Удаление транзакции';
            default:
                return type;
        }
    };

    const getActionTypeIcon = (type: string): keyof typeof MaterialIcons.glyphMap => {
        switch (type) {
            case 'UPDATE_ITEM':
                return 'edit';
            case 'DELETE_ITEM':
                return 'delete';
            case 'DELETE_TRANSACTION':
                return 'remove-circle';
            default:
                return 'help';
        }
    };

    const getActionTypeColor = (type: string) => {
        switch (type) {
            case 'UPDATE_ITEM':
                return '#3b82f6';
            case 'DELETE_ITEM':
                return '#ef4444';
            case 'DELETE_TRANSACTION':
                return '#f59e0b';
            default:
                return colors.text.muted;
        }
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString('ru-RU', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const getFieldLabel = (field: string): string => {
        const labels: { [key: string]: string } = {
            name: 'Название',
            code: 'Артикул',
            warehouse: 'Склад',
            numberOfBoxes: 'Кол-во коробок',
            row: 'Ряд',
            position: 'Позиция',
            side: 'Сторона',
            totalQuantity: 'Общее кол-во',
            totalValue: 'Общая стоимость',
            totalRecommendedValue: 'Рекомендованная цена',
            boxSizeQuantities: 'Размеры/количества',
            imageUri: 'Фото',
        };
        return labels[field] || field;
    };

    const formatValue = (value: any, field: string): string => {
        if (value === null || value === undefined || value === '') {
            return '—';
        }
        if (field === 'boxSizeQuantities') {
            // Попробуем распарсить и показать краткую сводку
            try {
                const boxes = typeof value === 'string' ? JSON.parse(value) : value;
                if (Array.isArray(boxes)) {
                    let totalQty = 0;
                    let sizeCount = 0;
                    boxes.forEach((box: any[]) => {
                        if (Array.isArray(box)) {
                            box.forEach((item: any) => {
                                if (item && typeof item.quantity === 'number') {
                                    totalQty += item.quantity;
                                    sizeCount++;
                                }
                            });
                        }
                    });
                    return `${boxes.length} кор., ${sizeCount} разм., ${totalQty} шт.`;
                }
            } catch {
                // Если не удалось распарсить
            }
            return 'изменено';
        }
        if (field === 'totalValue' || field === 'totalRecommendedValue') {
            return `${Number(value).toLocaleString('ru-RU')} ₽`;
        }
        if (typeof value === 'number') {
            return String(value);
        }
        if (typeof value === 'object') {
            // Для объектов показываем краткую сводку
            try {
                const keys = Object.keys(value);
                return `объект (${keys.length} полей)`;
            } catch {
                return 'объект';
            }
        }
        const str = String(value);
        return str.length > 25 ? str.substring(0, 25) + '...' : str;
    };

    const parseChanges = (oldData: string, newData: string) => {
        try {
            const oldObj = JSON.parse(oldData);
            const newObj = JSON.parse(newData);

            const changes: { field: string; label: string; old: any; new: any }[] = [];

            // Поля которые не нужно показывать
            const hiddenFields = ['id', 'serverId', 'createdAt', 'updatedAt', 'version', 'isDeleted', 'needsSync', 'syncedAt', 'imageNeedsUpload', 'serverImageUrl'];

            for (const key of Object.keys(newObj)) {
                if (hiddenFields.includes(key)) continue;
                if (JSON.stringify(oldObj[key]) !== JSON.stringify(newObj[key])) {
                    changes.push({
                        field: key,
                        label: getFieldLabel(key),
                        old: oldObj[key],
                        new: newObj[key],
                    });
                }
            }

            return changes;
        } catch {
            return [];
        }
    };

    const getItemName = (action: PendingAction) => {
        try {
            const data = JSON.parse(action.oldData);
            return data.name || `Товар #${action.itemId}`;
        } catch {
            return `Товар #${action.itemId}`;
        }
    };

    const renderActionItem = ({ item }: { item: PendingAction }) => {
        const isProcessing = processingId === item.id;
        const changes = item.actionType === 'UPDATE_ITEM' ? parseChanges(item.oldData, item.newData) : [];

        return (
            <View style={[styles.actionCard, { backgroundColor: colors.background.card }]}>
                <View style={styles.actionHeader}>
                    <View style={[styles.iconContainer, { backgroundColor: `${getActionTypeColor(item.actionType)}20` }]}>
                        <MaterialIcons
                            name={getActionTypeIcon(item.actionType)}
                            size={24}
                            color={getActionTypeColor(item.actionType)}
                        />
                    </View>
                    <View style={styles.actionInfo}>
                        <Text style={[styles.actionType, { color: colors.text.normal }]}>
                            {getActionTypeLabel(item.actionType)}
                        </Text>
                        <Text style={[styles.itemName, { color: colors.text.muted }]}>
                            {getItemName(item)}
                        </Text>
                    </View>
                    <Text style={[styles.actionDate, { color: colors.text.muted }]}>
                        {formatDate(item.createdAt)}
                    </Text>
                </View>

                {item.reason && (
                    <View style={[styles.reasonContainer, { backgroundColor: colors.background.screen }]}>
                        <Text style={[styles.reasonLabel, { color: colors.text.muted }]}>Причина:</Text>
                        <Text style={[styles.reasonText, { color: colors.text.normal }]}>{item.reason}</Text>
                    </View>
                )}

                {changes.length > 0 && (
                    <View style={[styles.changesContainer, { backgroundColor: colors.background.screen }]}>
                        <Text style={[styles.changesLabel, { color: colors.text.muted }]}>Изменения:</Text>
                        {changes.map((change, index) => (
                            <View key={index} style={styles.changeRow}>
                                <Text style={[styles.changeField, { color: colors.text.muted }]}>{change.label}:</Text>
                                <Text style={[styles.changeOld, { color: '#ef4444' }]}>
                                    {formatValue(change.old, change.field)}
                                </Text>
                                <MaterialIcons name="arrow-forward" size={14} color={colors.text.muted} />
                                <Text style={[styles.changeNew, { color: '#22c55e' }]}>
                                    {formatValue(change.new, change.field)}
                                </Text>
                            </View>
                        ))}
                    </View>
                )}

                <View style={styles.actionButtons}>
                    <TouchableOpacity
                        style={[styles.rejectButton, { backgroundColor: '#fef2f2', borderColor: '#ef4444' }]}
                        onPress={() => handleReject(item)}
                        disabled={isProcessing}
                    >
                        {isProcessing && actionMode === 'reject' ? (
                            <ActivityIndicator size="small" color="#ef4444" />
                        ) : (
                            <>
                                <MaterialIcons name="close" size={18} color="#ef4444" />
                                <Text style={styles.rejectButtonText}>Отклонить</Text>
                            </>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.approveButton, { backgroundColor: '#22c55e' }]}
                        onPress={() => handleApprove(item)}
                        disabled={isProcessing}
                    >
                        {isProcessing && actionMode === 'approve' ? (
                            <ActivityIndicator size="small" color="#fff" />
                        ) : (
                            <>
                                <MaterialIcons name="check" size={18} color="#fff" />
                                <Text style={styles.approveButtonText}>Одобрить</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    const renderEmptyState = () => (
        <View style={styles.emptyContainer}>
            <MaterialIcons name="inbox" size={64} color={colors.text.muted} />
            <Text style={[styles.emptyTitle, { color: colors.text.normal }]}>Нет заявок</Text>
            <Text style={[styles.emptySubtitle, { color: colors.text.muted }]}>
                Все заявки от ассистентов обработаны
            </Text>
        </View>
    );

    return (
        <View style={[styles.container, { backgroundColor: colors.background.screen }]}>
            <LinearGradient
                colors={isDark ? colors.gradients.accent : colors.gradients.main}
                style={styles.header}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
            >
                <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
                    <MaterialIcons name="arrow-back" size={24} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Заявки</Text>
                <View style={styles.badgeContainer}>
                    {actions.length > 0 && (
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>{actions.length}</Text>
                        </View>
                    )}
                </View>
            </LinearGradient>

            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={isDark ? colors.primary.gold : colors.primary.blue} />
                </View>
            ) : (
                <FlatList
                    data={actions}
                    renderItem={renderActionItem}
                    keyExtractor={(item) => item.id.toString()}
                    contentContainerStyle={styles.listContent}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor={colors.primary.blue}
                        />
                    }
                    ListEmptyComponent={renderEmptyState}
                />
            )}

            {/* Comment Modal */}
            <Modal
                visible={showCommentModal}
                transparent
                animationType="fade"
                onRequestClose={() => setShowCommentModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: colors.background.card }]}>
                        <Text style={[styles.modalTitle, { color: colors.text.normal }]}>
                            {actionMode === 'approve' ? 'Одобрить заявку' : 'Отклонить заявку'}
                        </Text>

                        <TextInput
                            style={[styles.commentInput, {
                                backgroundColor: colors.background.screen,
                                color: colors.text.normal,
                                borderColor: colors.border.normal
                            }]}
                            placeholder="Комментарий (необязательно)"
                            placeholderTextColor={colors.text.muted}
                            value={comment}
                            onChangeText={setComment}
                            multiline
                            numberOfLines={3}
                        />

                        <View style={styles.modalButtons}>
                            <TouchableOpacity
                                style={[styles.modalCancelButton, { borderColor: colors.border.normal }]}
                                onPress={() => setShowCommentModal(false)}
                            >
                                <Text style={[styles.modalCancelText, { color: colors.text.normal }]}>Отмена</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[
                                    styles.modalConfirmButton,
                                    { backgroundColor: actionMode === 'approve' ? '#22c55e' : '#ef4444' }
                                ]}
                                onPress={confirmAction}
                            >
                                <Text style={styles.modalConfirmText}>
                                    {actionMode === 'approve' ? 'Одобрить' : 'Отклонить'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: 60,
        paddingBottom: 20,
        paddingHorizontal: 16,
    },
    backButton: {
        padding: 8,
        marginRight: 8,
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#fff',
        flex: 1,
    },
    badgeContainer: {
        width: 40,
        alignItems: 'flex-end',
    },
    badge: {
        backgroundColor: '#ef4444',
        borderRadius: 12,
        minWidth: 24,
        height: 24,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 8,
    },
    badgeText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: 'bold',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    listContent: {
        padding: 16,
        paddingBottom: 32,
    },
    actionCard: {
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    actionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    iconContainer: {
        width: 44,
        height: 44,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    actionInfo: {
        flex: 1,
    },
    actionType: {
        fontSize: 16,
        fontWeight: '600',
    },
    itemName: {
        fontSize: 14,
        marginTop: 2,
    },
    actionDate: {
        fontSize: 12,
    },
    reasonContainer: {
        borderRadius: 8,
        padding: 10,
        marginBottom: 12,
    },
    reasonLabel: {
        fontSize: 12,
        marginBottom: 4,
    },
    reasonText: {
        fontSize: 14,
    },
    changesContainer: {
        borderRadius: 8,
        padding: 10,
        marginBottom: 12,
    },
    changesLabel: {
        fontSize: 12,
        marginBottom: 6,
    },
    changeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
        flexWrap: 'wrap',
    },
    changeField: {
        fontSize: 12,
        marginRight: 4,
    },
    changeOld: {
        fontSize: 12,
        textDecorationLine: 'line-through',
        marginRight: 4,
    },
    changeNew: {
        fontSize: 12,
        marginLeft: 4,
    },
    moreChanges: {
        fontSize: 12,
        fontStyle: 'italic',
        marginTop: 4,
    },
    actionButtons: {
        flexDirection: 'row',
        gap: 12,
    },
    rejectButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        borderRadius: 10,
        borderWidth: 1,
        gap: 6,
    },
    rejectButtonText: {
        color: '#ef4444',
        fontWeight: '600',
    },
    approveButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        borderRadius: 10,
        gap: 6,
    },
    approveButtonText: {
        color: '#fff',
        fontWeight: '600',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: 100,
    },
    emptyTitle: {
        fontSize: 20,
        fontWeight: '600',
        marginTop: 16,
    },
    emptySubtitle: {
        fontSize: 14,
        marginTop: 8,
        textAlign: 'center',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    modalContent: {
        width: '100%',
        borderRadius: 16,
        padding: 20,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 16,
        textAlign: 'center',
    },
    commentInput: {
        borderRadius: 10,
        borderWidth: 1,
        padding: 12,
        fontSize: 14,
        minHeight: 80,
        textAlignVertical: 'top',
    },
    modalButtons: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 16,
    },
    modalCancelButton: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 10,
        borderWidth: 1,
        alignItems: 'center',
    },
    modalCancelText: {
        fontWeight: '600',
    },
    modalConfirmButton: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 10,
        alignItems: 'center',
    },
    modalConfirmText: {
        color: '#fff',
        fontWeight: '600',
    },
});
