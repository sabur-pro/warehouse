// src/screens/CartScreen.tsx
import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    Image,
    Alert,
    TextInput,
    Modal,
    Pressable,
    ActivityIndicator,
    Animated,
    PanResponder,
    Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useCart, CartItem } from '../contexts/CartContext';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../../constants/theme';
import { QRScanner } from '../../components/QRScanner';
import ItemDetailsModal from '../../components/ItemDetailsModal';
import { getItemById, getItemsPage, processSaleTransaction, PaymentInfo } from '../../database/database';
import { Item, SizeQuantity } from '../../database/types';
import { Toast } from '../components/Toast';
import CheckoutScreen, { SaleData } from './CheckoutScreen';

// Компонент карточки товара со свайпом
interface SwipeableCartItemProps {
    item: CartItem;
    isDark: boolean;
    colors: ReturnType<typeof getThemeColors>;
    accentColor: string;
    updateQuantity: (id: number, qty: number) => void;
    removeFromCart: (id: number) => void;
}

const SwipeableCartItem: React.FC<SwipeableCartItemProps> = ({
    item,
    isDark,
    colors,
    accentColor,
    updateQuantity,
    removeFromCart,
}) => {
    const displayPrice = item.recommendedPrice || item.price;
    const totalItemPrice = displayPrice * item.quantity;

    // Создаём анимированное значение для свайпа
    const translateX = useRef(new Animated.Value(0)).current;
    const DELETE_THRESHOLD = -80;
    const HINT_OFFSET = -60;

    // Подсказка при нажатии на "-" когда количество = 1
    const showDeleteHint = () => {
        Animated.sequence([
            Animated.timing(translateX, {
                toValue: HINT_OFFSET,
                duration: 200,
                useNativeDriver: true,
            }),
            Animated.delay(1000),
            Animated.timing(translateX, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
            }),
        ]).start();
    };

    const handleDecreaseQuantity = () => {
        if (item.quantity <= 1) {
            showDeleteHint();
        } else {
            updateQuantity(item.id, item.quantity - 1);
        }
    };

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => false,
            onMoveShouldSetPanResponder: (_, gestureState) => {
                return Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dy) < 10;
            },
            onPanResponderMove: (_, gestureState) => {
                if (gestureState.dx < 0) {
                    translateX.setValue(Math.max(gestureState.dx, DELETE_THRESHOLD));
                }
            },
            onPanResponderRelease: (_, gestureState) => {
                if (gestureState.dx < DELETE_THRESHOLD / 2) {
                    Animated.spring(translateX, {
                        toValue: DELETE_THRESHOLD,
                        useNativeDriver: true,
                        friction: 8,
                        tension: 40,
                    }).start();
                } else {
                    Animated.spring(translateX, {
                        toValue: 0,
                        useNativeDriver: true,
                        friction: 8,
                        tension: 40,
                    }).start();
                }
            },
        })
    ).current;

    const handleDelete = () => {
        Animated.timing(translateX, {
            toValue: -500,
            duration: 300,
            useNativeDriver: true,
        }).start(() => {
            removeFromCart(item.id);
        });
    };

    const resetPosition = () => {
        Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            friction: 8,
            tension: 40,
        }).start();
    };

    return (
        <View style={styles.swipeContainer}>
            <TouchableOpacity
                style={styles.deleteBackground}
                onPress={handleDelete}
                activeOpacity={0.8}
            >
                <View style={styles.deleteButtonInner}>
                    <Ionicons name="trash" size={24} color="white" />
                    <Text style={styles.deleteButtonText}>Удалить</Text>
                </View>
            </TouchableOpacity>

            <Animated.View
                style={[
                    styles.cartItem,
                    {
                        backgroundColor: colors.background.card,
                        borderColor: colors.border.normal,
                        transform: [{ translateX }]
                    }
                ]}
                {...panResponder.panHandlers}
            >
                <TouchableOpacity onPress={resetPosition} activeOpacity={1} style={styles.imageContainer}>
                    {item.item.imageUri ? (
                        <Image source={{ uri: item.item.imageUri }} style={styles.itemImage} resizeMode="cover" />
                    ) : (
                        <View style={[styles.imagePlaceholder, { backgroundColor: isDark ? colors.background.light : '#f3f4f6' }]}>
                            <Ionicons name="image-outline" size={24} color={colors.text.muted} />
                        </View>
                    )}
                </TouchableOpacity>

                <TouchableOpacity onPress={resetPosition} activeOpacity={1} style={styles.itemInfo}>
                    <Text style={[styles.itemName, { color: colors.text.normal }]} numberOfLines={2}>
                        {item.item.name}
                    </Text>
                    <View style={styles.itemDetails}>
                        <Text style={[styles.detailText, { color: colors.text.muted }]}>
                            Размер: {item.size}
                        </Text>
                        <Text style={[styles.detailText, { color: colors.text.muted }]}>
                            Кор. {item.boxIndex + 1}
                        </Text>
                    </View>
                    <Text style={[styles.priceText, { color: accentColor }]}>
                        {displayPrice.toLocaleString()} сом × {item.quantity} = {totalItemPrice.toLocaleString()} сом
                    </Text>
                </TouchableOpacity>

                <View style={styles.quantityControlsOnly}>
                    <TouchableOpacity
                        style={[styles.quantityButton, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#f3f4f6' }]}
                        onPress={handleDecreaseQuantity}
                        activeOpacity={0.7}
                    >
                        <Ionicons name="remove" size={18} color={item.quantity <= 1 ? '#dc2626' : accentColor} />
                    </TouchableOpacity>

                    <Text style={[styles.quantityText, { color: colors.text.normal }]}>
                        {item.quantity}
                    </Text>

                    <TouchableOpacity
                        style={[styles.quantityButton, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#f3f4f6' }]}
                        onPress={() => updateQuantity(item.id, item.quantity + 1)}
                        disabled={item.quantity >= item.maxQuantity}
                        activeOpacity={0.7}
                    >
                        <Ionicons name="add" size={18} color={item.quantity >= item.maxQuantity ? colors.text.muted : accentColor} />
                    </TouchableOpacity>
                </View>
            </Animated.View>
        </View>
    );
};

const CartScreen: React.FC = () => {
    const { isDark } = useTheme();
    const colors = getThemeColors(isDark);
    const { cartItems, removeFromCart, updateQuantity, clearCart, getCartTotal, addToCart } = useCart();

    const accentColor = isDark ? colors.primary.gold : colors.primary.blue;
    const totals = useMemo(() => getCartTotal(), [getCartTotal]);

    // QR Scanner state
    const [scannerVisible, setScannerVisible] = useState(false);

    // Checkout screen state
    const [checkoutVisible, setCheckoutVisible] = useState(false);

    // ItemDetailsModal state
    const [selectedItem, setSelectedItem] = useState<Item | null>(null);
    const [itemDetailsVisible, setItemDetailsVisible] = useState(false);

    // Toast state
    const [toastVisible, setToastVisible] = useState(false);
    const [toastMessage, setToastMessage] = useState('');
    const [toastType, setToastType] = useState<'success' | 'error' | 'warning' | 'info'>('success');

    const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'success') => {
        setToastMessage(message);
        setToastType(type);
        setToastVisible(true);
    };

    // Поиск товаров
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<Item[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showSearchResults, setShowSearchResults] = useState(false);

    // Меню троеточие
    const [menuVisible, setMenuVisible] = useState(false);

    // Количество для добавления из поиска
    const [addQuantities, setAddQuantities] = useState<Record<number, number>>({});

    // Поиск товаров с debounce
    useEffect(() => {
        if (searchQuery.trim().length < 2) {
            setSearchResults([]);
            setShowSearchResults(false);
            return;
        }

        const timeoutId = setTimeout(async () => {
            setIsSearching(true);
            try {
                const results = await getItemsPage(50, 0, searchQuery.trim(), 'Все', 'all');
                setSearchResults(results.items);
                setShowSearchResults(true);
                // Инициализируем количества для добавления
                const quantities: Record<number, number> = {};
                results.items.forEach(item => {
                    quantities[item.id] = 1;
                });
                setAddQuantities(quantities);
            } catch (error) {
                console.error('Search error:', error);
            } finally {
                setIsSearching(false);
            }
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [searchQuery]);

    // Добавить товар из поиска в корзину (открывает модалку для выбора размера)
    const handleAddFromSearch = useCallback((item: Item) => {
        setSelectedItem(item);
        setItemDetailsVisible(true);
        setShowSearchResults(false);
        setSearchQuery('');
    }, []);

    // Увеличить количество для добавления
    const increaseAddQuantity = (itemId: number, maxQty: number) => {
        setAddQuantities(prev => ({
            ...prev,
            [itemId]: Math.min((prev[itemId] || 1) + 1, maxQty)
        }));
    };

    // Уменьшить количество для добавления
    const decreaseAddQuantity = (itemId: number) => {
        setAddQuantities(prev => ({
            ...prev,
            [itemId]: Math.max((prev[itemId] || 1) - 1, 1)
        }));
    };

    // Обработка сканирования QR-кода
    const handleQRScanned = useCallback(async (data: string) => {
        try {
            const parsedData = JSON.parse(data);
            const { itemId, boxIndex, size } = parsedData;

            // Получаем товар из БД
            const item = await getItemById(itemId);

            if (!item) {
                Alert.alert('Ошибка', 'Товар не найден в базе данных');
                return;
            }

            // Парсим boxSizeQuantities
            const boxes: SizeQuantity[][] = JSON.parse(item.boxSizeQuantities || '[]');

            // Если есть размер (per_item QR) → добавляем в корзину автоматически
            if (size !== undefined) {
                const targetBoxIndex = boxIndex ?? 0;
                const box = boxes[targetBoxIndex];

                if (!box) {
                    Alert.alert('Ошибка', 'Коробка не найдена');
                    return;
                }

                const sizeIndex = box.findIndex(sq => String(sq.size) === String(size));
                const sizeQty = box[sizeIndex];

                if (sizeQty && sizeQty.quantity > 0) {
                    addToCart(
                        item,
                        targetBoxIndex,
                        sizeIndex,
                        size,
                        1,
                        sizeQty.price || 0,
                        sizeQty.recommendedSellingPrice,
                        sizeQty.quantity
                    );
                    showToast(`${item.name} (размер ${size}) добавлен в корзину`, 'success');
                } else {
                    Alert.alert('Ошибка', 'Товар данного размера недоступен на складе');
                }
            } else {
                // Если только boxIndex (per_box QR) или без boxIndex → открываем ItemDetailsModal
                setSelectedItem(item);
                setItemDetailsVisible(true);
            }
        } catch (error) {
            console.error('Error processing QR data:', error);
            Alert.alert('Ошибка', 'Не удалось обработать QR-код');
        }
    }, [addToCart]);

    const handleItemUpdated = useCallback((updatedItem?: Item) => {
        // Обновляем selectedItem если он был изменён
        if (updatedItem) {
            setSelectedItem(updatedItem);
        }
    }, []);

    const handleItemDeleted = useCallback((itemId: number) => {
        // Закрываем модалку если товар был удалён
        setItemDetailsVisible(false);
        setSelectedItem(null);
    }, []);

    const handleRemoveItem = (cartItemId: number, itemName: string) => {
        Alert.alert(
            'Удалить товар',
            `Удалить "${itemName}" из корзины?`,
            [
                { text: 'Отмена', style: 'cancel' },
                {
                    text: 'Удалить',
                    style: 'destructive',
                    onPress: () => removeFromCart(cartItemId),
                },
            ]
        );
    };

    const handleClearCart = () => {
        if (cartItems.length === 0) return;
        Alert.alert(
            'Очистить корзину',
            'Удалить все товары из корзины?',
            [
                { text: 'Отмена', style: 'cancel' },
                {
                    text: 'Очистить',
                    style: 'destructive',
                    onPress: () => clearCart(),
                },
            ]
        );
    };

    const renderCartItem = ({ item }: { item: CartItem }) => (
        <SwipeableCartItem
            item={item}
            isDark={isDark}
            colors={colors}
            accentColor={accentColor}
            updateQuantity={updateQuantity}
            removeFromCart={removeFromCart}
        />
    );

    const renderEmptyCart = () => (
        <View style={styles.emptyContainer}>
            <Ionicons name="cart-outline" size={80} color={colors.text.muted} />
            <Text style={[styles.emptyTitle, { color: colors.text.normal }]}>Корзина пуста</Text>
            <Text style={[styles.emptySubtitle, { color: colors.text.muted }]}>
                Добавьте товары из каталога или сканируйте QR-код или используйте функцию поиска
            </Text>
        </View>
    );

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background.screen }]} edges={['top']}>
            {/* Хедер с поиском */}
            <View style={[styles.header, { backgroundColor: colors.background.card, borderBottomColor: colors.border.normal }]}>
                {/* Поле поиска */}
                <View style={[styles.searchContainer, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#f3f4f6' }]}>
                    <Ionicons name="search" size={20} color={colors.text.muted} />
                    <TextInput
                        style={[styles.searchInput, { color: colors.text.normal }]}
                        placeholder="Поиск товаров..."
                        placeholderTextColor={colors.text.muted}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        returnKeyType="search"
                    />
                    {isSearching && <ActivityIndicator size="small" color={accentColor} />}
                    {searchQuery.length > 0 && !isSearching && (
                        <TouchableOpacity onPress={() => { setSearchQuery(''); setShowSearchResults(false); }}>
                            <Ionicons name="close-circle" size={20} color={colors.text.muted} />
                        </TouchableOpacity>
                    )}
                </View>

                {/* Badge количества товаров в корзине */}
                {cartItems.length > 0 && (
                    <View style={[styles.cartBadge, { backgroundColor: accentColor }]}>
                        <Ionicons name="cart" size={16} color="white" />
                        <Text style={styles.cartBadgeText}>{totals.totalItems}</Text>
                    </View>
                )}

                {/* Меню троеточие */}
                <TouchableOpacity
                    style={styles.menuButton}
                    onPress={() => setMenuVisible(true)}
                    activeOpacity={0.7}
                >
                    <Ionicons name="ellipsis-vertical" size={24} color={colors.text.normal} />
                </TouchableOpacity>
            </View>

            {/* Результаты поиска */}
            {showSearchResults && searchResults.length > 0 && (
                <View style={[styles.searchResultsContainer, { backgroundColor: colors.background.card }]}>
                    <FlatList
                        data={searchResults}
                        keyExtractor={(item) => `search-${item.id}`}
                        style={styles.searchResultsList}
                        renderItem={({ item }) => (
                            <TouchableOpacity
                                style={[styles.searchResultItem, { borderBottomColor: colors.border.normal }]}
                                onPress={() => handleAddFromSearch(item)}
                                activeOpacity={0.7}
                            >
                                {/* Изображение */}
                                <View style={styles.searchResultImage}>
                                    {item.imageUri ? (
                                        <Image source={{ uri: item.imageUri }} style={styles.searchItemImage} resizeMode="cover" />
                                    ) : (
                                        <View style={[styles.searchImagePlaceholder, { backgroundColor: isDark ? colors.background.light : '#f3f4f6' }]}>
                                            <Ionicons name="image-outline" size={20} color={colors.text.muted} />
                                        </View>
                                    )}
                                </View>

                                {/* Информация */}
                                <View style={styles.searchResultInfo}>
                                    <Text style={[styles.searchResultName, { color: colors.text.normal }]} numberOfLines={1}>
                                        {item.name}
                                    </Text>
                                    <Text style={[styles.searchResultStock, { color: colors.text.muted }]}>
                                        В наличии: {item.totalQuantity} шт.
                                    </Text>
                                </View>

                                {/* Кнопка добавления */}
                                <View style={[styles.addButtonContainer, { backgroundColor: accentColor }]}>
                                    <Ionicons name="add" size={20} color="white" />
                                </View>
                            </TouchableOpacity>
                        )}
                    />
                </View>
            )}

            {/* Нет результатов поиска */}
            {showSearchResults && searchResults.length === 0 && !isSearching && (
                <View style={[styles.noResultsContainer, { backgroundColor: colors.background.card }]}>
                    <Text style={{ color: colors.text.muted }}>Товары не найдены</Text>
                </View>
            )}

            {/* Список товаров корзины */}
            {!showSearchResults && (
                <FlatList
                    data={cartItems}
                    renderItem={renderCartItem}
                    keyExtractor={(item) => `cart-${item.id}`}
                    contentContainerStyle={cartItems.length === 0 ? styles.emptyList : styles.list}
                    ListEmptyComponent={renderEmptyCart}
                />
            )}

            {/* Кнопка "Далее" - floating справа */}
            {!showSearchResults && cartItems.length > 0 && (
                <TouchableOpacity
                    style={[styles.nextButton, {
                        backgroundColor: accentColor,
                        shadowColor: accentColor,
                    }]}
                    onPress={() => setCheckoutVisible(true)}
                    activeOpacity={0.8}
                >
                    <Ionicons name="checkmark" size={22} color="white" />
                    <Text style={styles.nextButtonText}>Далее</Text>
                </TouchableOpacity>
            )}

            {/* Кнопка QR сканера - СЛЕВА */}
            <TouchableOpacity
                style={[styles.scanButton, {
                    backgroundColor: accentColor,
                    shadowColor: accentColor,
                }]}
                onPress={() => setScannerVisible(true)}
                activeOpacity={0.8}
            >
                <Ionicons name="scan" size={28} color="white" />
            </TouchableOpacity>

            {/* Меню троеточие - Modal */}
            <Modal
                visible={menuVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setMenuVisible(false)}
            >
                <Pressable style={styles.menuOverlay} onPress={() => setMenuVisible(false)}>
                    <View style={[styles.menuContainer, { backgroundColor: colors.background.card }]}>
                        <TouchableOpacity
                            style={styles.menuItem}
                            onPress={() => {
                                setMenuVisible(false);
                                handleClearCart();
                            }}
                            disabled={cartItems.length === 0}
                        >
                            <Ionicons name="trash-outline" size={20} color={cartItems.length === 0 ? colors.text.muted : '#dc2626'} />
                            <Text style={[styles.menuItemText, { color: cartItems.length === 0 ? colors.text.muted : '#dc2626' }]}>
                                Очистить корзину
                            </Text>
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Modal>

            {/* QR Сканер */}
            <QRScanner
                visible={scannerVisible}
                onClose={() => setScannerVisible(false)}
                onScan={handleQRScanned}
            />

            {/* Модалка деталей товара */}
            {selectedItem && (
                <ItemDetailsModal
                    item={selectedItem}
                    visible={itemDetailsVisible}
                    onClose={() => {
                        setItemDetailsVisible(false);
                        setSelectedItem(null);
                    }}
                    onItemUpdated={handleItemUpdated}
                    onItemDeleted={handleItemDeleted}
                />
            )}

            {/* Экран оформления заказа */}
            <CheckoutScreen
                visible={checkoutVisible}
                onClose={() => setCheckoutVisible(false)}
                onConfirm={async (saleData: SaleData) => {
                    try {
                        // Генерируем уникальный ID для группировки товаров одной продажи
                        const saleId = `sale_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

                        // Формируем PaymentInfo для каждой транзакции
                        const paymentInfo: PaymentInfo = {
                            method: saleData.paymentMethod,
                            bank: saleData.bank,
                            cashAmount: saleData.cashAmount,
                            cardAmount: saleData.cardAmount,
                        };

                        // Обрабатываем продажу для каждого товара в корзине
                        for (const cartItem of cartItems) {
                            await processSaleTransaction(
                                cartItem.item.id,
                                cartItem.boxIndex,
                                cartItem.sizeIndex,
                                cartItem.size,
                                cartItem.quantity,
                                cartItem.price, // costPrice
                                cartItem.recommendedPrice || cartItem.price, // salePrice
                                paymentInfo,
                                saleData.clientId,
                                saleData.discount,
                                saleId // Общий ID продажи для группировки
                            );
                        }

                        setCheckoutVisible(false);
                        clearCart();
                        showToast('Продажа оформлена!', 'success');
                    } catch (error) {
                        console.error('Error processing sale:', error);
                        showToast('Ошибка при оформлении продажи', 'error');
                    }
                }}
            />

            {/* Toast уведомления */}
            <Toast
                visible={toastVisible}
                message={toastMessage}
                type={toastType}
                onHide={() => setToastVisible(false)}
            />
        </SafeAreaView>
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
    headerContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        marginLeft: 8,
    },
    badge: {
        marginLeft: 8,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
    },
    badgeText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: 'bold',
    },
    clearButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
    },
    clearButtonText: {
        color: '#dc2626',
        fontSize: 13,
        marginLeft: 4,
    },
    list: {
        padding: 12,
    },
    emptyList: {
        flex: 1,
    },
    cartItem: {
        flexDirection: 'row',
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 12,
    },
    imageContainer: {
        width: 70,
        height: 70,
        borderRadius: 8,
        overflow: 'hidden',
    },
    itemImage: {
        width: '100%',
        height: '100%',
    },
    imagePlaceholder: {
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    itemInfo: {
        flex: 1,
        marginLeft: 12,
        justifyContent: 'center',
    },
    itemName: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 4,
    },
    itemDetails: {
        flexDirection: 'row',
        marginBottom: 4,
    },
    detailText: {
        fontSize: 12,
        marginRight: 12,
    },
    priceText: {
        fontSize: 13,
        fontWeight: '600',
    },
    controlsContainer: {
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: 8,
    },
    deleteButton: {
        padding: 8,
        borderRadius: 8,
        marginBottom: 8,
    },
    quantityControls: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    quantityButton: {
        width: 30,
        height: 30,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    quantityText: {
        fontSize: 16,
        fontWeight: '600',
        marginHorizontal: 12,
        minWidth: 24,
        textAlign: 'center',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    emptyTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        marginTop: 16,
    },
    emptySubtitle: {
        fontSize: 14,
        marginTop: 8,
        textAlign: 'center',
    },
    footer: {
        padding: 16,
        borderTopWidth: 1,
    },
    totalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    totalLabel: {
        fontSize: 14,
    },
    totalValue: {
        fontSize: 14,
        fontWeight: '500',
    },
    grandTotalRow: {
        marginTop: 8,
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: 'rgba(128,128,128,0.2)',
    },
    grandTotalLabel: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    grandTotalValue: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    scanButton: {
        position: 'absolute',
        bottom: 24,
        left: 24,
        width: 56,
        height: 56,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
    },
    // Стили поиска
    searchContainer: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
        marginRight: 12,
    },
    searchInput: {
        flex: 1,
        marginLeft: 8,
        fontSize: 16,
        paddingVertical: 4,
    },
    menuButton: {
        padding: 8,
    },
    // Результаты поиска
    searchResultsContainer: {
        flex: 1,
        borderTopWidth: 1,
    },
    searchResultsList: {
        flex: 1,
    },
    searchResultItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderBottomWidth: 1,
    },
    searchResultImage: {
        width: 50,
        height: 50,
        borderRadius: 8,
        overflow: 'hidden',
    },
    searchItemImage: {
        width: '100%',
        height: '100%',
    },
    searchImagePlaceholder: {
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 8,
    },
    searchResultInfo: {
        flex: 1,
        marginLeft: 12,
    },
    searchResultName: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 2,
    },
    searchResultStock: {
        fontSize: 12,
    },
    addButtonContainer: {
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 12,
    },
    noResultsContainer: {
        padding: 20,
        alignItems: 'center',
    },
    // Меню
    menuOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-start',
        alignItems: 'flex-end',
        paddingTop: 60,
        paddingRight: 16,
    },
    menuContainer: {
        borderRadius: 12,
        paddingVertical: 8,
        minWidth: 180,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 5,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
    },
    menuItemText: {
        fontSize: 16,
        marginLeft: 12,
    },
    // Badge корзины
    cartBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 16,
        marginRight: 8,
    },
    cartBadgeText: {
        color: 'white',
        fontSize: 14,
        fontWeight: 'bold',
        marginLeft: 4,
    },
    // Свайп контейнер
    swipeContainer: {
        marginBottom: 12,
        position: 'relative',
    },
    deleteBackground: {
        position: 'absolute',
        top: 1,
        right: 1,
        bottom: 1,
        width: 80,
        height: '88%',
        backgroundColor: '#dc2626',
        justifyContent: 'center',
        alignItems: 'center',
        borderTopRightRadius: 11,
        borderBottomRightRadius: 11,
    },
    deleteButtonInner: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    deleteButtonText: {
        color: 'white',
        fontSize: 12,
        fontWeight: '600',
        marginTop: 4,
    },
    quantityControlsOnly: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingLeft: 8,
    },
    // Кнопка Далее (floating справа)
    nextButton: {
        position: 'absolute',
        bottom: 24,
        right: 24,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderRadius: 28,
        gap: 8,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
    },
    nextButtonText: {
        color: 'white',
        fontSize: 15,
        fontWeight: '600',
    },
});

export default CartScreen;
