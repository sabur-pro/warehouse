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
import { useCurrency } from '../contexts/CurrencyContext';
import { getThemeColors } from '../../constants/theme';
import { useScanLauncher } from '../hooks/useScanLauncher';
import ItemDetailsModal from '../../components/ItemDetailsModal';
import { getItemsPage, processSaleTransaction, PaymentInfo, healQRCodesForItem } from '../../database/database';
import ItemLookupService from '../services/ItemLookupService';
import { Item, SizeQuantity, isWeightPriceUnit } from '../../database/types';
import { formatWeight, gramsPerPriceUnit, priceUnitLabel, sanitizePriceText, parsePriceText } from '../../utils/priceInput';
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

interface SwipeableCartItemPropsExt extends SwipeableCartItemProps {
    onEditWeight?: (cartItem: CartItem) => void;
}

const SwipeableCartItem: React.FC<SwipeableCartItemPropsExt> = ({
    item,
    isDark,
    colors,
    accentColor,
    updateQuantity,
    removeFromCart,
    onEditWeight,
}) => {
    const { label: currencyShort, formatCurrency } = useCurrency();
    const displayPrice = item.recommendedPrice || item.price;
    const totalItemPrice = displayPrice * item.quantity;
    const isWeight = isWeightPriceUnit(item.priceUnit);
    const perUnitGrams = isWeight ? gramsPerPriceUnit(item.priceUnit) : 0;
    const grams = isWeight ? item.quantity * perUnitGrams : 0;

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
                        {isWeight
                            ? `${displayPrice.toFixed(2)} ${currencyShort}/${priceUnitLabel(item.priceUnit)} × ${formatWeight(grams)} = ${formatCurrency(totalItemPrice)}`
                            : `${formatCurrency(displayPrice)} × ${item.quantity} = ${formatCurrency(totalItemPrice)}`}
                    </Text>
                </TouchableOpacity>

                {isWeight ? (
                    // Для весовых товаров +/- по 1 кг бесполезны — даём кнопку редактирования веса.
                    <TouchableOpacity
                        style={{
                            paddingHorizontal: 12,
                            paddingVertical: 8,
                            borderRadius: 16,
                            backgroundColor: isDark ? 'rgba(212, 175, 55, 0.18)' : 'rgba(34, 197, 94, 0.12)',
                            borderWidth: 1,
                            borderColor: accentColor,
                            flexDirection: 'row',
                            alignItems: 'center',
                        }}
                        onPress={() => onEditWeight?.(item)}
                        activeOpacity={0.7}
                    >
                        <Ionicons name="create-outline" size={16} color={accentColor} />
                        <Text style={{ marginLeft: 6, color: accentColor, fontWeight: '700' }}>
                            {formatWeight(grams)}
                        </Text>
                    </TouchableOpacity>
                ) : (
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
                )}
            </Animated.View>
        </View>
    );
};

const CartScreen: React.FC = () => {
    const { isDark } = useTheme();
    const colors = getThemeColors(isDark);
    const { cartItems, removeFromCart, updateQuantity, clearCart, getCartTotal, addToCart } = useCart();
    const { label: currencyShort, formatCurrency } = useCurrency();

    const accentColor = isDark ? colors.primary.gold : colors.primary.blue;
    const totals = useMemo(() => getCartTotal(), [getCartTotal]);

    // Checkout screen state
    const [checkoutVisible, setCheckoutVisible] = useState(false);

    // ItemDetailsModal state
    const [selectedItem, setSelectedItem] = useState<Item | null>(null);
    const [itemDetailsVisible, setItemDetailsVisible] = useState(false);

    // Toast state
    const [toastVisible, setToastVisible] = useState(false);
    const [toastMessage, setToastMessage] = useState('');
    const [toastType, setToastType] = useState<'success' | 'error' | 'warning' | 'info'>('success');

    // Стейт мини-модалки редактирования веса в корзине (для весовых товаров)
    const [editWeightCart, setEditWeightCart] = useState<CartItem | null>(null);
    const [editWeightText, setEditWeightText] = useState('');

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
            console.log('📷 ============ QR SCAN START ============');
            console.log('📷 raw data length=', data?.length, 'preview=', data?.slice(0, 120));

            let parsedData: any;
            try {
                parsedData = JSON.parse(data);
            } catch (parseErr) {
                console.error('📷 QR: not valid JSON', parseErr);
                Alert.alert('Ошибка', 'QR-код имеет неверный формат (не JSON).');
                return;
            }
            const { itemId, itemUuid, itemName, boxIndex, size } = parsedData;
            console.log('📷 QR parsed: itemId=', itemId, 'itemUuid=', itemUuid?.slice(0, 8), 'name=', itemName, 'box=', boxIndex, 'size=', size);

            // Локальный поиск + серверный fallback по uuid (без поиска по name/code — это даёт ложные совпадения)
            const lookup = await ItemLookupService.findForScan({ itemId, itemUuid, itemName });

            if (!lookup.item) {
                console.warn('📷 QR: item NOT FOUND. reason=', lookup.reason);
                let msg = 'Товар не найден.';
                switch (lookup.reason) {
                    case 'no_uuid':
                        msg = 'QR-код устаревшего формата (без UUID). Перевыпустите QR для этого товара.';
                        break;
                    case 'not_authenticated':
                        msg = 'Локально товара нет, а серверный поиск недоступен — войдите в аккаунт.';
                        break;
                    case 'server_404':
                        msg = 'Товар не найден ни локально, ни на сервере. Возможно, он удалён.';
                        break;
                    case 'server_error':
                        msg = 'Ошибка сервера при поиске товара. Попробуйте ещё раз.';
                        break;
                    case 'network':
                        msg = 'Локально товара нет, а сервер недоступен. Проверьте интернет.';
                        break;
                }
                Alert.alert('Ошибка', msg);
                return;
            }

            const item = lookup.item;
            console.log('📷 QR: resolved via', lookup.source, '→ id=', item.id, 'uuid=', item.uuid?.slice(0, 8));

            // Авто-починка старого QR: если в QR не было uuid (или он расходится с актуальным),
            // переписываем qrCodes у товара с правильным uuid+id, чтобы при следующем скане
            // сработал быстрый поиск по uuid и QR ушёл на сервер с needsSync=1.
            try {
                const healed = await healQRCodesForItem(item, itemUuid);
                if (healed) {
                    console.log('📷 QR: auto-healed legacy QR for item', item.id);
                }
            } catch (healErr) {
                console.warn('📷 QR: heal failed (non-fatal)', healErr);
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

    // Сканирование штрих-кода в корзине: ищем товар по `code` локально → серверный fallback,
    // и открываем карточку для добавления в корзину. Без специфики "размер/коробка" —
    // штрих-код товара адресует ТОЛЬКО товар целиком, выбор размера сделает юзер вручную.
    const handleBarcodeScanned = useCallback(async (code: string) => {
        console.log('🛒 CartScreen.handleBarcodeScanned: code=', code);
        const lookup = await ItemLookupService.findByBarcode(code);

        if (lookup.item) {
            console.log('🛒 barcode resolved via', lookup.source, '→ id=', lookup.item.id);
            setSelectedItem(lookup.item);
            setItemDetailsVisible(true);
            return;
        }

        let msg = `Товар со штрих-кодом "${code}" не найден.`;
        switch (lookup.reason) {
            case 'no_code':
                msg = 'Пустой штрих-код.';
                break;
            case 'not_authenticated':
                msg = 'Локально товара нет, серверный поиск недоступен — войдите в аккаунт.';
                break;
            case 'server_404':
                msg = `Штрих-код "${code}" не найден ни локально, ни на сервере.`;
                break;
            case 'server_error':
                msg = 'Ошибка сервера при поиске товара.';
                break;
            case 'network':
                msg = 'Локально товара нет, а сервер недоступен. Проверьте интернет.';
                break;
        }
        Alert.alert('Не найдено', msg);
    }, []);

    // start() — открывает либо HID-оверлей, либо камеру, в зависимости от
    // настроек сканера. Глобальной подписки на HID нет, чтобы случайные
    // сканы не дёргали корзину.
    const { start: startBarcodeScan, modals: barcodeScanModals } = useScanLauncher(handleBarcodeScanned);
    const { start: startQRScan, modals: qrScanModals } = useScanLauncher(handleQRScanned, { cameraType: 'qr' });

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

    const openEditWeight = useCallback((cartItem: CartItem) => {
        const perUnit = gramsPerPriceUnit(cartItem.priceUnit);
        const grams = perUnit > 0 ? Math.round(cartItem.quantity * perUnit) : 0;
        setEditWeightText(grams > 0 ? String(grams) : '');
        setEditWeightCart(cartItem);
    }, []);

    const confirmEditWeight = useCallback(() => {
        if (!editWeightCart) return;
        const perUnit = gramsPerPriceUnit(editWeightCart.priceUnit);
        if (perUnit <= 0) return;
        const grams = parsePriceText(editWeightText);
        if (grams <= 0) {
            Alert.alert('Введите вес', 'Укажите вес больше нуля (в граммах).');
            return;
        }
        const newQty = grams / perUnit;
        const maxQty = editWeightCart.maxQuantity;
        if (newQty > maxQty + 1e-9) {
            const maxGrams = Math.round(maxQty * perUnit);
            Alert.alert('Превышен остаток', `На складе только ${formatWeight(maxGrams)}.`);
            return;
        }
        updateQuantity(editWeightCart.id, newQty);
        setEditWeightCart(null);
        setEditWeightText('');
    }, [editWeightCart, editWeightText, updateQuantity]);

    const renderCartItem = ({ item }: { item: CartItem }) => (
        <SwipeableCartItem
            item={item}
            isDark={isDark}
            colors={colors}
            accentColor={accentColor}
            updateQuantity={updateQuantity}
            removeFromCart={removeFromCart}
            onEditWeight={openEditWeight}
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

            {/* Кнопка "Оформить" - floating справа */}
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
                    <Text style={styles.nextButtonText}>Оформить</Text>
                </TouchableOpacity>
            )}

            {/* Кнопка QR сканера - СЛЕВА. HID-сканер или камера по настройкам. */}
            <TouchableOpacity
                style={[styles.scanButton, {
                    backgroundColor: accentColor,
                    shadowColor: accentColor,
                }]}
                onPress={startQRScan}
                activeOpacity={0.8}
                accessibilityLabel="Сканировать QR-код"
            >
                <Ionicons name="scan" size={28} color="white" />
            </TouchableOpacity>

            {/* Кнопка сканера штрих-кода — справа от QR. Если в настройках
                выбран внешний сканер, тап покажет «Ждём сканер…» и откроет
                карточку по физическому скану; иначе откроется камера. */}
            <TouchableOpacity
                style={[styles.barcodeButton, {
                    backgroundColor: isDark ? colors.primary.purple : colors.primary.gold,
                    shadowColor: isDark ? colors.primary.purple : colors.primary.gold,
                }]}
                onPress={startBarcodeScan}
                activeOpacity={0.8}
                accessibilityLabel="Сканировать штрих-код"
            >
                <Ionicons name="barcode-outline" size={28} color="white" />
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

            {/* QR-сканер: камера + HID-оверлей через useScanLauncher */}
            {qrScanModals}

            {/* Камера + HID-оверлей штрихкода — оба из useScanLauncher */}
            {barcodeScanModals}

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

                        // Рассчитываем общую скидку
                        let totalDiscount = 0;
                        if (saleData.discount && saleData.discount.value > 0) {
                            if (saleData.discount.mode === 'percent') {
                                totalDiscount = Math.round(totals.totalRecommendedPrice * saleData.discount.value / 100);
                            } else {
                                totalDiscount = saleData.discount.value;
                            }
                        }

                        // Распределяем скидку пропорционально стоимости каждого товара
                        let discountDistributed = 0;
                        const itemDiscounts: number[] = [];

                        for (let i = 0; i < cartItems.length; i++) {
                            const cartItem = cartItems[i];
                            const itemTotal = (cartItem.recommendedPrice || cartItem.price) * cartItem.quantity;

                            if (i === cartItems.length - 1) {
                                // Последний товар получает остаток скидки (для избежания ошибок округления)
                                itemDiscounts.push(totalDiscount - discountDistributed);
                            } else {
                                // Пропорциональная доля скидки
                                const itemShare = totals.totalRecommendedPrice > 0
                                    ? itemTotal / totals.totalRecommendedPrice
                                    : 0;
                                const itemDiscount = Math.round(totalDiscount * itemShare);
                                itemDiscounts.push(itemDiscount);
                                discountDistributed += itemDiscount;
                            }
                        }

                        // Обрабатываем продажу для каждого товара в корзине
                        for (let i = 0; i < cartItems.length; i++) {
                            const cartItem = cartItems[i];
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
                                saleId, // Общий ID продажи для группировки
                                itemDiscounts[i], // Распределённая скидка для этого товара
                                saleData.clientUuid // UUID клиента для синхронизации
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

            {/* Мини-модалка редактирования веса для весовых товаров в корзине */}
            {editWeightCart && (() => {
                const perUnit = gramsPerPriceUnit(editWeightCart.priceUnit);
                const stockGrams = perUnit > 0 ? Math.round(editWeightCart.maxQuantity * perUnit) : 0;
                const enteredGrams = parsePriceText(editWeightText);
                const computedTotal = perUnit > 0
                    ? (enteredGrams / perUnit) * (editWeightCart.recommendedPrice || editWeightCart.price)
                    : 0;
                const isOverStock = enteredGrams > stockGrams + 1e-6;
                const isEmpty = enteredGrams <= 0;
                const unitPrice = editWeightCart.recommendedPrice || editWeightCart.price;
                return (
                    <Pressable
                        style={{
                            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                            backgroundColor: 'rgba(0,0,0,0.6)',
                            justifyContent: 'center', alignItems: 'center',
                            padding: 16, zIndex: 9999,
                        }}
                        onPress={() => { setEditWeightCart(null); setEditWeightText(''); }}
                    >
                        <Pressable
                            style={{
                                backgroundColor: colors.background.screen,
                                borderRadius: 16,
                                padding: 20,
                                width: '100%',
                                maxWidth: 360,
                            }}
                            onPress={(e) => e.stopPropagation()}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                                <Ionicons name="scale-outline" size={22} color={accentColor} />
                                <Text style={{ marginLeft: 8, color: colors.text.normal, fontSize: 18, fontWeight: '700' }}>
                                    Изменить вес
                                </Text>
                            </View>
                            <Text style={{ color: colors.text.muted, marginBottom: 4 }} numberOfLines={1}>
                                {editWeightCart.item.name}
                            </Text>
                            <Text style={{ color: colors.text.muted, marginBottom: 4 }}>
                                Цена: <Text style={{ color: colors.text.normal, fontWeight: '600' }}>{formatCurrency(unitPrice)} за {priceUnitLabel(editWeightCart.priceUnit)}</Text>
                            </Text>
                            <Text style={{ color: colors.text.muted, marginBottom: 12 }}>
                                Доступно на складе: <Text style={{ color: colors.text.normal, fontWeight: '600' }}>{formatWeight(stockGrams)}</Text>
                            </Text>
                            <Text style={{ color: colors.text.muted, marginBottom: 6, fontSize: 13 }}>Вес, г</Text>
                            <TextInput
                                style={{
                                    borderWidth: 1.5,
                                    borderColor: isOverStock ? '#ef4444' : accentColor,
                                    backgroundColor: colors.background.card,
                                    color: colors.text.normal,
                                    borderRadius: 10,
                                    paddingHorizontal: 14,
                                    paddingVertical: 12,
                                    fontSize: 18,
                                    fontWeight: '600',
                                    marginBottom: 12,
                                }}
                                value={editWeightText}
                                onChangeText={(t) => setEditWeightText(sanitizePriceText(t, 0))}
                                keyboardType="number-pad"
                                placeholder="например, 878"
                                placeholderTextColor={colors.text.muted}
                                autoFocus
                            />
                            <View style={{
                                backgroundColor: isDark ? 'rgba(34, 197, 94, 0.12)' : '#f0fdf4',
                                borderColor: isDark ? 'rgba(34, 197, 94, 0.4)' : '#86efac',
                                borderWidth: 1,
                                borderRadius: 10,
                                padding: 12,
                                marginBottom: 12,
                            }}>
                                {isEmpty ? (
                                    <Text style={{ color: colors.text.muted, fontStyle: 'italic' }}>
                                        Введите вес чтобы увидеть сумму
                                    </Text>
                                ) : (
                                    <Text style={{ color: colors.text.normal, fontSize: 15 }}>
                                        {formatWeight(enteredGrams)} × {unitPrice.toFixed(2)} {currencyShort}/{priceUnitLabel(editWeightCart.priceUnit)} ={' '}
                                        <Text style={{ color: isDark ? colors.primary.gold : '#16a34a', fontSize: 18, fontWeight: '800' }}>
                                            {formatCurrency(computedTotal)}
                                        </Text>
                                    </Text>
                                )}
                                {isOverStock && (
                                    <Text style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>
                                        Превышен остаток ({formatWeight(stockGrams)})
                                    </Text>
                                )}
                            </View>
                            <View style={{ flexDirection: 'row', gap: 10 }}>
                                <TouchableOpacity
                                    onPress={() => { setEditWeightCart(null); setEditWeightText(''); }}
                                    style={{
                                        flex: 1,
                                        backgroundColor: colors.background.card,
                                        paddingVertical: 12,
                                        borderRadius: 10,
                                        alignItems: 'center',
                                        borderWidth: 1,
                                        borderColor: colors.border.normal,
                                    }}
                                >
                                    <Text style={{ color: colors.text.normal, fontWeight: '600' }}>Отмена</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={confirmEditWeight}
                                    disabled={isEmpty || isOverStock}
                                    style={{
                                        flex: 1.4,
                                        backgroundColor: accentColor,
                                        paddingVertical: 12,
                                        borderRadius: 10,
                                        alignItems: 'center',
                                        opacity: (isEmpty || isOverStock) ? 0.5 : 1,
                                    }}
                                >
                                    <Text style={{ color: '#fff', fontWeight: '700' }}>Сохранить</Text>
                                </TouchableOpacity>
                            </View>
                        </Pressable>
                    </Pressable>
                );
            })()}

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
    barcodeButton: {
        position: 'absolute',
        bottom: 24,
        left: 92, // правее кнопки QR
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
    // Кнопка Оформить (floating справа)
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
