// src/components/sync/IncompleteDataAlert.tsx
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DataQualityReport } from '../../services/SyncService';

interface IncompleteDataAlertProps {
    report: DataQualityReport | null;
    onDismiss: () => void;
    visible: boolean;
}

/**
 * Компонент для отображения уведомления о неполных данных после синхронизации.
 * Показывается когда есть товары без рекомендованной цены или QR-кодов.
 */
export const IncompleteDataAlert: React.FC<IncompleteDataAlertProps> = ({
    report,
    onDismiss,
    visible,
}) => {
    if (!visible || !report || report.issues.length === 0) {
        return null;
    }

    const handleShowDetails = () => {
        Alert.alert(
            'Неполные данные',
            `Всего товаров: ${report.totalItems}\n\n` +
            `Проблемы:\n${report.issues.map(issue => `• ${issue}`).join('\n')}\n\n` +
            'Рекомендуем дополнить данные товаров для корректной работы приложения.',
            [{ text: 'Понятно', style: 'default' }]
        );
    };

    return (
        <View style={styles.container}>
            <View style={styles.iconContainer}>
                <Ionicons name="warning" size={24} color="#f59e0b" />
            </View>
            <View style={styles.textContainer}>
                <Text style={styles.title}>Неполные данные</Text>
                <Text style={styles.message} numberOfLines={2}>
                    {report.issues.join(', ')}
                </Text>
            </View>
            <View style={styles.actionsContainer}>
                <TouchableOpacity onPress={handleShowDetails} style={styles.detailsButton}>
                    <Ionicons name="information-circle" size={20} color="#3b82f6" />
                </TouchableOpacity>
                <TouchableOpacity onPress={onDismiss} style={styles.dismissButton}>
                    <Ionicons name="close" size={20} color="#6b7280" />
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fef3c7',
        borderRadius: 12,
        padding: 12,
        marginHorizontal: 16,
        marginVertical: 8,
        borderWidth: 1,
        borderColor: '#fcd34d',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    iconContainer: {
        marginRight: 12,
    },
    textContainer: {
        flex: 1,
    },
    title: {
        fontSize: 14,
        fontWeight: '600',
        color: '#92400e',
        marginBottom: 2,
    },
    message: {
        fontSize: 12,
        color: '#b45309',
    },
    actionsContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    detailsButton: {
        padding: 4,
    },
    dismissButton: {
        padding: 4,
    },
});

export default IncompleteDataAlert;
