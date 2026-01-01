import { TouchableOpacity, Text, Image, View, ActivityIndicator, Animated } from 'react-native';
import { Item, SizeQuantity } from '../database/types';
import { useMemo, useState, useEffect, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/contexts/ThemeContext';
import { getThemeColors } from '../constants/theme';

interface ItemGridProps {
  item: Item & { sizeText?: string; parsedBoxSizeQuantities?: unknown };
  onPress: () => void;
  searchTerm: string;
}

export const ItemGrid = ({ item, onPress, searchTerm }: ItemGridProps) => {
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);
  const { sizeText: providedSizeText } = item as any;

  // Анимация появления
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const parsedAndSizeText = useMemo(() => {
    if (providedSizeText) return providedSizeText;

    let boxSizeQuantities: SizeQuantity[][] = [];
    try {
      boxSizeQuantities = JSON.parse(item.boxSizeQuantities || '[]');
    } catch (error) {
      console.error('Error parsing box sizes in ItemGrid (fallback):', error);
    }

    const allSizes = boxSizeQuantities.flatMap(box =>
      box.filter(sizeQty => (sizeQty && typeof sizeQty.quantity === 'number') ? sizeQty.quantity > 0 : false)
        .map(sizeQty => sizeQty.size)
    );

    // Умная сортировка: числа сортируем как числа, строки как строки
    const uniqueSizes = [...new Set(allSizes)].sort((a, b) => {
      const aIsNumber = typeof a === 'number';
      const bIsNumber = typeof b === 'number';

      // Если оба числа - сравниваем как числа
      if (aIsNumber && bIsNumber) return a - b;

      // Если один число, другой строка - числа идут первыми
      if (aIsNumber && !bIsNumber) return -1;
      if (!aIsNumber && bIsNumber) return 1;

      // Если оба строки - сравниваем лексикографически
      return String(a).localeCompare(String(b));
    });

    const sizeText = uniqueSizes.join(', ') || 'Нет размеров';
    return sizeText;

  }, [item.boxSizeQuantities, providedSizeText]);

  const highlightColor = isDark ? colors.primary.gold : '#22c55e';

  const HighlightedText = ({ text, highlight }: { text: string; highlight: string }) => {
    if (!highlight || !highlight.trim()) {
      return <Text>{text}</Text>;
    }
    try {
      const regex = new RegExp(`(${highlight})`, 'gi');
      const parts = text.split(regex);
      return (
        <Text>
          {parts.map((part, i) => (
            <Text key={i} style={part.toLowerCase() === highlight.toLowerCase() ? { color: highlightColor, fontWeight: 'bold' } : {}}>
              {part}
            </Text>
          ))}
        </Text>
      );
    } catch {
      return <Text>{text}</Text>;
    }
  };

  // image placeholder handling
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  // Проверяем нужна ли красная рамка (товары без цены)
  const needsPricing = item.totalValue === -1 || item.totalValue < 0;

  // Проверяем неполные данные (из старых версий)
  const isIncomplete = !item.code || !item.warehouse || !item.sizeType ||
    item.boxSizeQuantities === '[]' || !item.boxSizeQuantities;

  // Определяем цвет рамки: красный для товаров без цены (приоритет), желтый для неполных данных
  const borderColor = needsPricing ? '#ef4444' :
    isIncomplete ? '#eab308' : colors.border.normal;

  const accentColor1 = isDark ? colors.primary.gold : '#3b82f6';
  const accentColor2 = isDark ? '#4ade80' : '#22c55e';

  return (
    <Animated.View
      style={{
        opacity: fadeAnim,
        transform: [{ scale: scaleAnim }],
        flex: 1,
        maxWidth: '50%',
        margin: 4,
      }}
    >
      <TouchableOpacity
        style={{
          backgroundColor: colors.background.card,
          borderRadius: 12,
          padding: 8,
          borderWidth: needsPricing || isIncomplete ? 2 : 1,
          borderColor: borderColor,
          height: 240, // Увеличена высота для комфортного размещения всех элементов
          overflow: 'hidden', // Обрезаем всё что выходит за границы
        }}
        onPress={onPress}
        activeOpacity={0.7}
      >
        {/* Изображение - фиксированный блок 90px */}
        {item.imageUri ? (
          <View style={{ width: '100%', height: 90, marginBottom: 6 }}>
            {!imgLoaded && !imgError && (
              <View style={{ width: '100%', height: 90, borderRadius: 8, backgroundColor: isDark ? colors.background.light : '#eee', justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="small" color={accentColor1} />
              </View>
            )}
            {imgError && (
              <View style={{ width: '100%', height: 90, borderRadius: 8, backgroundColor: isDark ? colors.background.light : '#f6f6f6', justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ fontSize: 11, color: colors.text.muted }}>Ошибка</Text>
              </View>
            )}
            <Image
              source={{ uri: item.imageUri }}
              style={{
                width: '100%',
                height: 90,
                borderRadius: 8,
                position: imgLoaded ? 'relative' : 'absolute',
                top: 0,
                left: 0,
              }}
              resizeMode="cover"
              onLoad={() => setImgLoaded(true)}
              onError={() => { setImgError(true); setImgLoaded(false); }}
            />
          </View>
        ) : (
          <View style={{ width: '100%', height: 90, borderRadius: 8, backgroundColor: isDark ? colors.background.light : '#f6f6f6', marginBottom: 6 }} />
        )}

        {/* Название - максимум 2 строки, высота 32px */}
        <View style={{ height: 32, marginBottom: 4 }}>
          <Text
            style={{ fontWeight: '700', fontSize: 12, lineHeight: 16, color: colors.text.normal }}
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            <HighlightedText text={item.name} highlight={searchTerm} />
          </Text>
        </View>

        {/* Код - 1 строка, высота 16px */}
        <View style={{ flexDirection: 'row', alignItems: 'center', height: 16, marginBottom: 2 }}>
          <Ionicons name="barcode-outline" size={11} color={colors.text.muted} style={{ marginRight: 3 }} />
          <Text style={{ fontSize: 9, color: colors.text.muted, marginRight: 2 }}>Код:</Text>
          <Text style={{ fontSize: 9, color: colors.text.muted, flex: 1 }} numberOfLines={1} ellipsizeMode="tail">
            <HighlightedText text={item.code} highlight={searchTerm} />
          </Text>
        </View>

        {/* Склад - 1 строка, высота 16px */}
        <View style={{ flexDirection: 'row', alignItems: 'center', height: 16, marginBottom: 2 }}>
          <Ionicons name="business-outline" size={11} color={colors.text.muted} style={{ marginRight: 3 }} />
          <Text style={{ fontSize: 9, color: colors.text.muted, flex: 1 }} numberOfLines={1} ellipsizeMode="tail">
            {item.warehouse}
          </Text>
        </View>

        {/* Размеры - максимум 2 строки, высота 28px */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', height: 28, marginBottom: 4 }}>
          <Ionicons name="resize-outline" size={11} color={colors.text.muted} style={{ marginRight: 3, marginTop: 1 }} />
          <Text
            style={{ fontSize: 9, color: colors.text.muted, flex: 1, lineHeight: 14 }}
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {providedSizeText ?? parsedAndSizeText}
          </Text>
        </View>

        {/* Количество коробок и товаров - фиксированная высота 28px */}
        <View style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          height: 28,
          paddingTop: 4,
          marginBottom: 4,
          borderTopWidth: 1,
          borderTopColor: isDark ? colors.background.light : '#f3f4f6',
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="cube-outline" size={12} color={accentColor1} style={{ marginRight: 3 }} />
            <Text style={{ fontSize: 10, color: accentColor1, fontWeight: '600' }}>{item.numberOfBoxes}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="layers-outline" size={12} color={accentColor2} style={{ marginRight: 3 }} />
            <Text style={{ fontSize: 10, color: accentColor2, fontWeight: '600' }}>{item.totalQuantity}</Text>
          </View>
        </View>

        {/* Предупреждения - фиксированная высота 22px (всегда резервируем место) */}
        <View style={{ height: 22, justifyContent: 'center' }}>
          {needsPricing && (
            <View style={{
              paddingVertical: 2,
              paddingHorizontal: 6,
              backgroundColor: '#fee2e2',
              borderRadius: 6,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Ionicons name="warning-outline" size={10} color="#dc2626" style={{ marginRight: 3 }} />
              <Text style={{ fontSize: 9, color: '#dc2626', fontWeight: '700' }} numberOfLines={1}>
                Нужна цена!
              </Text>
            </View>
          )}

          {!needsPricing && isIncomplete && (
            <View style={{
              paddingVertical: 2,
              paddingHorizontal: 6,
              backgroundColor: '#fef3c7',
              borderRadius: 6,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Ionicons name="alert-circle-outline" size={10} color="#d97706" style={{ marginRight: 3 }} />
              <Text style={{ fontSize: 9, color: '#d97706', fontWeight: '700' }} numberOfLines={1}>
                Неполные данные
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};
