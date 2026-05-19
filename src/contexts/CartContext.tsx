// src/contexts/CartContext.tsx
import React, { createContext, useContext, useState, ReactNode, useCallback, useMemo } from 'react';
import { Item, SizeQuantity, PriceUnit, isWeightPriceUnit } from '../../database/types';

// Тип для элемента корзины
export interface CartItem {
    id: number;           // уникальный ID элемента корзины
    item: Item;           // исходный товар
    boxIndex: number;     // индекс коробки
    sizeIndex: number;    // индекс размера в коробке
    size: number | string;// размер
    // Для штучных товаров: целое количество (шт.).
    // Для весовых (priceUnit ∈ kg/100g): дробное значение в единицах priceUnit
    //   (например, 0.878 при priceUnit='kg' означает 878 г).
    quantity: number;
    price: number;        // цена за единицу priceUnit (за шт/кг/100г)
    recommendedPrice?: number; // рекомендуемая цена продажи
    maxQuantity: number;  // максимальное доступное количество (в тех же единицах)
    // Единица цены товара на момент добавления в корзину. Нужна чтобы
    // отрисовать вес в граммах вместо "× N шт." и не тащить весь Item.
    priceUnit?: PriceUnit;
}

interface CartContextType {
    cartItems: CartItem[];
    addToCart: (item: Item, boxIndex: number, sizeIndex: number, size: number | string, quantity: number, price: number, recommendedPrice?: number, maxQuantity?: number) => void;
    removeFromCart: (cartItemId: number) => void;
    removeItemFromCart: (itemId: number) => void;
    updateQuantity: (cartItemId: number, newQuantity: number) => void;
    validateCartForItem: (itemId: number, boxSizeQuantities: SizeQuantity[][]) => void;
    clearCart: () => void;
    getCartTotal: () => { totalItems: number; totalPrice: number; totalRecommendedPrice: number };
    getItemQuantityInCart: (itemId: number) => number;
    isItemInCart: (itemId: number) => boolean;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const useCart = () => {
    const context = useContext(CartContext);
    if (!context) {
        throw new Error('useCart must be used within a CartProvider');
    }
    return context;
};

interface CartProviderProps {
    children: ReactNode;
}

export const CartProvider: React.FC<CartProviderProps> = ({ children }) => {
    const [cartItems, setCartItems] = useState<CartItem[]>([]);
    const [nextId, setNextId] = useState(1);

    const addToCart = useCallback((
        item: Item,
        boxIndex: number,
        sizeIndex: number,
        size: number | string,
        quantity: number,
        price: number,
        recommendedPrice?: number,
        maxQuantity?: number
    ) => {
        const priceUnit = (item.priceUnit as PriceUnit | undefined) || 'pair';
        const isWeight = isWeightPriceUnit(priceUnit);

        setCartItems(prev => {
            // Проверяем, есть ли уже такой товар с таким же размером и коробкой
            const existingIndex = prev.findIndex(
                ci => ci.item.id === item.id && ci.boxIndex === boxIndex && ci.sizeIndex === sizeIndex
            );

            if (existingIndex !== -1) {
                const updated = [...prev];
                const existing = updated[existingIndex];
                if (isWeight) {
                    // Для весовых товаров addToCart означает "перезаписать вес",
                    // а не "плюс ещё столько же" — иначе UX становится непредсказуемым
                    // (нажал "добавить" дважды → удвоился вес).
                    const newQuantity = Math.min(quantity, existing.maxQuantity);
                    updated[existingIndex] = { ...existing, quantity: newQuantity, price, recommendedPrice, priceUnit };
                } else {
                    // Штучный режим — старое поведение, прибавляем.
                    const newQuantity = Math.min(existing.quantity + quantity, existing.maxQuantity);
                    updated[existingIndex] = { ...existing, quantity: newQuantity };
                }
                return updated;
            }

            // Добавляем новый элемент
            const newCartItem: CartItem = {
                id: nextId,
                item,
                boxIndex,
                sizeIndex,
                size,
                quantity,
                price,
                recommendedPrice,
                maxQuantity: maxQuantity || quantity,
                priceUnit,
            };

            setNextId(prevId => prevId + 1);
            return [...prev, newCartItem];
        });
    }, [nextId]);

    const removeFromCart = useCallback((cartItemId: number) => {
        setCartItems(prev => prev.filter(ci => ci.id !== cartItemId));
    }, []);

    const updateQuantity = useCallback((cartItemId: number, newQuantity: number) => {
        setCartItems(prev => {
            return prev.map(ci => {
                if (ci.id === cartItemId) {
                    // Для весовых товаров минимум — любое положительное число (даже 0.001 кг),
                    // потому что 1 как минимум означало бы "минимум 1 кг" — это слишком много.
                    const minQty = isWeightPriceUnit(ci.priceUnit) ? 0.001 : 1;
                    const clampedQuantity = Math.max(minQty, Math.min(newQuantity, ci.maxQuantity));
                    return { ...ci, quantity: clampedQuantity };
                }
                return ci;
            });
        });
    }, []);

    // Удаляет все элементы корзины для указанного товара
    const removeItemFromCart = useCallback((itemId: number) => {
        setCartItems(prev => prev.filter(ci => ci.item.id !== itemId));
    }, []);

    // Проверяет и обновляет корзину с актуальными данными о товаре
    const validateCartForItem = useCallback((itemId: number, boxSizeQuantities: SizeQuantity[][]) => {
        setCartItems(prev => {
            return prev.filter(ci => {
                // Пропускаем товары других items
                if (ci.item.id !== itemId) return true;

                // Проверяем существует ли коробка и размер
                const box = boxSizeQuantities[ci.boxIndex];
                if (!box) return false; // Коробка удалена

                const sizeQty = box[ci.sizeIndex];
                if (!sizeQty) return false; // Размер удалён

                // Если на складе 0 - удаляем из корзины
                const actualQuantity = sizeQty.quantity || 0;
                if (actualQuantity <= 0) return false;

                return true;
            }).map(ci => {
                // Обновляем maxQuantity и количество для товаров этого item
                if (ci.item.id !== itemId) return ci;

                const box = boxSizeQuantities[ci.boxIndex];
                const sizeQty = box?.[ci.sizeIndex];
                const actualQuantity = sizeQty?.quantity || 0;

                // Обновляем maxQuantity и корректируем quantity если нужно
                const newMaxQuantity = actualQuantity;
                const newQuantity = Math.min(ci.quantity, newMaxQuantity);

                return {
                    ...ci,
                    maxQuantity: newMaxQuantity,
                    quantity: newQuantity > 0 ? newQuantity : 1,
                };
            });
        });
    }, []);

    const clearCart = useCallback(() => {
        setCartItems([]);
    }, []);

    const getCartTotal = useCallback(() => {
        let totalItems = 0;
        let totalPrice = 0;
        let totalRecommendedPrice = 0;

        cartItems.forEach(ci => {
            totalItems += ci.quantity;
            totalPrice += ci.quantity * ci.price;
            if (ci.recommendedPrice) {
                totalRecommendedPrice += ci.quantity * ci.recommendedPrice;
            }
        });

        return { totalItems, totalPrice, totalRecommendedPrice };
    }, [cartItems]);

    const getItemQuantityInCart = useCallback((itemId: number) => {
        return cartItems
            .filter(ci => ci.item.id === itemId)
            .reduce((sum, ci) => sum + ci.quantity, 0);
    }, [cartItems]);

    const isItemInCart = useCallback((itemId: number) => {
        return cartItems.some(ci => ci.item.id === itemId);
    }, [cartItems]);

    const value = useMemo(() => ({
        cartItems,
        addToCart,
        removeFromCart,
        removeItemFromCart,
        updateQuantity,
        validateCartForItem,
        clearCart,
        getCartTotal,
        getItemQuantityInCart,
        isItemInCart,
    }), [cartItems, addToCart, removeFromCart, removeItemFromCart, updateQuantity, validateCartForItem, clearCart, getCartTotal, getItemQuantityInCart, isItemInCart]);

    return (
        <CartContext.Provider value={value}>
            {children}
        </CartContext.Provider>
    );
};
