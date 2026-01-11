// components/AddToCartModal.tsx
import React, { useState, useMemo, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    ScrollView,
    Image,
    Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Item, SizeQuantity } from '../database/types';
import { useCart } from '../src/contexts/CartContext';
import { useTheme } from '../src/contexts/ThemeContext';
import { getThemeColors } from '../constants/theme';

interface AddToCartModalProps {
    visible: boolean;
    item: Item | null;
    onClose: () => void;
}

export const AddToCartModal: React.FC<AddToCartModalProps> = ({ visible, item, onClose }) => {
    const { isDark } = useTheme();
    const colors = getThemeColors(isDark);
    const { addToCart } = useCart();

    const accentColor = isDark ? colors.primary.gold : colors.primary.blue;

    // Парсим размеры из товара
    const boxSizeQuantities = useMemo(() => {
        if (!item) return [];
        try {
            return JSON.parse(item.boxSizeQuantities || '[]') as SizeQuantity[][];
        } catch {
            return [];
        }
    }, [item]);

    // Состояние выбора
    const [selectedBoxIndex, setSelectedBoxIndex] = useState<number | null>(null);
    const [selectedSizeIndex, setSelectedSizeIndex] = useState<number | null>(null);
    const [quantity, setQuantity] = useState(1);

    // Сбрасываем состояние при открытии модалки
    useEffect(() => {
        if (visible) {
            setSelectedBoxIndex(null);
            setSelectedSizeIndex(null);
            setQuantity(1);
        }
    }, [visible]);

    // Получаем выбранный размер
    const selectedSize = useMemo(() => {
        if (selectedBoxIndex === null || selectedSizeIndex === null) return null;
        const box = boxSizeQuantities[selectedBoxIndex];
        if (!box) return null;
        return box[selectedSizeIndex];
    }, [boxSizeQuantities, selectedBoxIndex, selectedSizeIndex]);

    // Максимальное количество
    const maxQuantity = selectedSize?.quantity || 0;

    // Обработка добавления в корзину
    const handleAddToCart = () => {
        if (!item || selectedBoxIndex === null || selectedSizeIndex === null || !selectedSize) {
            Alert.alert('Ошибка', 'Выберите размер для добавления в корзину');
            return;
        }

        addToCart(
            item,
            selectedBoxIndex,
            selectedSizeIndex,
            selectedSize.size,
            quantity,
            selectedSize.price,
            selectedSize.recommendedSellingPrice,
            selectedSize.quantity
        );

        onClose();
    };

    if (!item) return null;

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <View style={[styles.container, { backgroundColor: colors.background.card }]}>
                    {/* Заголовок */}
                    <View style={[styles.header, { borderBottomColor: colors.border.normal }]}>
                        <Text style={[styles.title, { color: colors.text.normal }]}>Добавить в корзину</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                            <Ionicons name="close" size={24} color={colors.text.muted} />
                        </TouchableOpacity>
                    </View>

                    {/* Товар */}
                    <View style={styles.itemInfo}>
                        {item.imageUri ? (
                            <Image source={{ uri: item.imageUri }} style={styles.itemImage} resizeMode="cover" />
                        ) : (
                            <View style={[styles.imagePlaceholder, { backgroundColor: isDark ? colors.background.light : '#f3f4f6' }]}>
                                <Ionicons name="image-outline" size={32} color={colors.text.muted} />
                            </View>
                        )}
                        <View style={styles.itemDetails}>
                            <Text style={[styles.itemName, { color: colors.text.normal }]} numberOfLines={2}>
                                {item.name}
                            </Text>
                            <Text style={[styles.itemCode, { color: colors.text.muted }]}>
                                Код: {item.code}
                            </Text>
                        </View>
                    </View>

                    {/* Выбор коробки и размера */}
                    <ScrollView style={styles.sizeList}>
                        {boxSizeQuantities.map((box, boxIndex) => (
                            <View key={boxIndex} style={styles.boxSection}>
                                <Text style={[styles.boxTitle, { color: colors.text.normal }]}>
                                    Коробка {boxIndex + 1}
                                </Text>
                                <View style={styles.sizesRow}>
                                    {box.filter(sq => sq.quantity > 0).map((sizeQty, sizeIndex) => {
                                        const isSelected = selectedBoxIndex === boxIndex && selectedSizeIndex === sizeIndex;
                                        const realSizeIndex = box.findIndex(s => s.size === sizeQty.size && s.quantity === sizeQty.quantity);
                                        return (
                                            <TouchableOpacity
                                                key={`${boxIndex}-${sizeIndex}`}
                                                style={[
                                                    styles.sizeButton,
                                                    {
                                                        borderColor: isSelected ? accentColor : colors.border.normal,
                                                        backgroundColor: isSelected ? `${accentColor}20` : 'transparent',
                                                    },
                                                ]}
                                                onPress={() => {
                                                    setSelectedBoxIndex(boxIndex);
                                                    setSelectedSizeIndex(realSizeIndex);
                                                    setQuantity(1);
                                                }}
                                                activeOpacity={0.7}
                                            >
                                                <Text style={[styles.sizeText, { color: isSelected ? accentColor : colors.text.normal }]}>
                                                    {sizeQty.size}
                                                </Text>
                                                <Text style={[styles.sizeQty, { color: colors.text.muted }]}>
                                                    ({sizeQty.quantity} шт)
                                                </Text>
                                                {sizeQty.recommendedSellingPrice && (
                                                    <Text style={[styles.sizePrice, { color: accentColor }]}>
                                                        {sizeQty.recommendedSellingPrice} сом
                                                    </Text>
                                                )}
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </View>
                        ))}
                    </ScrollView>

                    {/* Выбор количества */}
                    {selectedSize && (
                        <View style={[styles.quantitySection, { borderTopColor: colors.border.normal }]}>
                            <Text style={[styles.quantityLabel, { color: colors.text.normal }]}>Количество:</Text>
                            <View style={styles.quantityControls}>
                                <TouchableOpacity
                                    style={[styles.qtyButton, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#f3f4f6' }]}
                                    onPress={() => setQuantity(Math.max(1, quantity - 1))}
                                    disabled={quantity <= 1}
                                    activeOpacity={0.7}
                                >
                                    <Ionicons name="remove" size={20} color={quantity <= 1 ? colors.text.muted : accentColor} />
                                </TouchableOpacity>
                                <Text style={[styles.qtyText, { color: colors.text.normal }]}>{quantity}</Text>
                                <TouchableOpacity
                                    style={[styles.qtyButton, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#f3f4f6' }]}
                                    onPress={() => setQuantity(Math.min(maxQuantity, quantity + 1))}
                                    disabled={quantity >= maxQuantity}
                                    activeOpacity={0.7}
                                >
                                    <Ionicons name="add" size={20} color={quantity >= maxQuantity ? colors.text.muted : accentColor} />
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}

                    {/* Итого и кнопка добавления */}
                    {selectedSize && (
                        <View style={styles.footer}>
                            <View style={styles.totalInfo}>
                                <Text style={[styles.totalLabel, { color: colors.text.muted }]}>Итого:</Text>
                                <Text style={[styles.totalValue, { color: accentColor }]}>
                                    {((selectedSize.recommendedSellingPrice || selectedSize.price) * quantity).toLocaleString()} сом
                                </Text>
                            </View>
                            <TouchableOpacity
                                style={[styles.addButton, { backgroundColor: accentColor }]}
                                onPress={handleAddToCart}
                                activeOpacity={0.8}
                            >
                                <Ionicons name="cart" size={20} color="#fff" />
                                <Text style={styles.addButtonText}>Добавить</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    container: {
        maxHeight: '80%',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingBottom: 24,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    closeButton: {
        padding: 4,
    },
    itemInfo: {
        flexDirection: 'row',
        padding: 16,
    },
    itemImage: {
        width: 70,
        height: 70,
        borderRadius: 8,
    },
    imagePlaceholder: {
        width: 70,
        height: 70,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    itemDetails: {
        flex: 1,
        marginLeft: 12,
        justifyContent: 'center',
    },
    itemName: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 4,
    },
    itemCode: {
        fontSize: 13,
    },
    sizeList: {
        maxHeight: 200,
        paddingHorizontal: 16,
    },
    boxSection: {
        marginBottom: 16,
    },
    boxTitle: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 8,
    },
    sizesRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    sizeButton: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
        borderWidth: 1,
        alignItems: 'center',
        minWidth: 60,
    },
    sizeText: {
        fontSize: 14,
        fontWeight: '600',
    },
    sizeQty: {
        fontSize: 11,
        marginTop: 2,
    },
    sizePrice: {
        fontSize: 10,
        marginTop: 2,
        fontWeight: '500',
    },
    quantitySection: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderTopWidth: 1,
    },
    quantityLabel: {
        fontSize: 16,
        fontWeight: '500',
    },
    quantityControls: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    qtyButton: {
        width: 36,
        height: 36,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    qtyText: {
        fontSize: 18,
        fontWeight: '600',
        marginHorizontal: 16,
        minWidth: 32,
        textAlign: 'center',
    },
    footer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 12,
    },
    totalInfo: {
        flex: 1,
    },
    totalLabel: {
        fontSize: 13,
    },
    totalValue: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    addButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 12,
    },
    addButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
        marginLeft: 8,
    },
});
