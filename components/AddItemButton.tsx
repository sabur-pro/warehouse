// components/AddItemButton.tsx
import { useState, useEffect, useMemo } from 'react';
import {
  TouchableOpacity,
  Text,
  Modal,
  View,
  TextInput,
  Alert,
  ScrollView,
  Image,
  ActivityIndicator,
  Animated,
  KeyboardTypeOptions,
  DeviceEventEmitter,
  Platform
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useDatabase } from '../hooks/useDatabase';
import { SizeRange, SizeQuantity, ItemType, QRCodeType } from '../database/types';
import { useCatalogs } from '../src/contexts/CatalogsContext';
import { compressImage, showCompressionDialog, getRecommendedProfile, formatFileSize } from '../utils/imageCompression';
import { createQRCodesForItem } from '../utils/qrCodeUtils';
import * as FileSystem from 'expo-file-system';
import { useTheme } from '../src/contexts/ThemeContext';
import { getThemeColors, colors as defaultColors } from '../constants/theme';

const FloatingTextInput = ({ label, value, onChangeText, error, editable, placeholder, keyboardType, isDark, colors }: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
  editable?: boolean;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  isDark: boolean;
  colors: any;
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [heightAnim] = useState(new Animated.Value(value ? 1 : 0));

  const accentColor = isDark ? colors.primary.gold : colors.primary.blue;

  useEffect(() => {
    Animated.timing(heightAnim, {
      toValue: value || isFocused ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [value, isFocused]);

  return (
    <View className="mb-3 relative">
      <Animated.View
        style={{
          position: 'absolute',
          top: heightAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [12, -8],
          }),
          left: 12,
          zIndex: 1,
          backgroundColor: colors.background.card,
          paddingHorizontal: 4,
        }}
      >
        <Text style={{
          fontSize: 14,
          color: isFocused || value ? accentColor : colors.text.muted
        }}>
          {label}
        </Text>
      </Animated.View>
      <TextInput
        style={{
          borderWidth: 1,
          borderColor: error ? '#ef4444' : (isFocused ? accentColor : colors.border.normal),
          backgroundColor: colors.background.card,
          color: colors.text.normal,
          padding: 12,
          borderRadius: 8,
          fontSize: 16,
        }}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        editable={editable}
        placeholder={placeholder}
        placeholderTextColor={colors.text.muted}
        keyboardType={keyboardType}
      />
      {error && <Text style={{ color: '#ef4444', marginTop: 4, fontSize: 12 }}>{error}</Text>}
    </View>
  );
};

export const AddItemButton = () => {
  const { isDark } = useTheme();
  const themeColors = getThemeColors(isDark);

  const { enabledCatalogs } = useCatalogs();
  const [modalVisible, setModalVisible] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [numberOfBoxes, setNumberOfBoxes] = useState(1);
  const initialCatalog = enabledCatalogs[0];
  const [itemType, setItemType] = useState<ItemType>(initialCatalog?.name ?? '');
  const [sizeType, setSizeType] = useState<string>(initialCatalog?.sizeTypes[0]?.name ?? '');
  const [boxSizeQuantities, setBoxSizeQuantities] = useState<SizeQuantity[][]>([]);
  const [row, setRow] = useState('');
  const [position, setPosition] = useState('');
  const [side, setSide] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [priceValue, setPriceValue] = useState(0);
  const [recommendedSellingPrice, setRecommendedSellingPrice] = useState(0);
  const [priceMode, setPriceMode] = useState<'per_pair' | 'per_box'>('per_pair');
  const [qrCodeType, setQrCodeType] = useState<QRCodeType>('none');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const { addItem } = useDatabase();

  const accentColor = isDark ? themeColors.primary.gold : themeColors.primary.blue;

  // Активный каталог
  const activeCatalog = useMemo(
    () => enabledCatalogs.find((c) => c.name === itemType) ?? enabledCatalogs[0],
    [enabledCatalogs, itemType],
  );

  // Размерные ряды текущего каталога
  const sizeRanges = useMemo<Record<string, SizeRange>>(() => {
    if (!activeCatalog) return {};
    return Object.fromEntries(
      activeCatalog.sizeTypes.map((st) => [st.name, { type: st.name, sizes: st.sizes }]),
    );
  }, [activeCatalog]);

  // Валидный sizeType
  const validSizeType = useMemo(() => {
    if (sizeRanges[sizeType]) return sizeType;
    return Object.keys(sizeRanges)[0] ?? '';
  }, [sizeType, sizeRanges]);

  // Если itemType не валиден (каталог удалён/выключен) — синхронизируем
  useEffect(() => {
    if (!activeCatalog) return;
    if (itemType !== activeCatalog.name) {
      setItemType(activeCatalog.name);
    }
  }, [activeCatalog, itemType]);

  // Синхронизируем sizeType при смене itemType
  useEffect(() => {
    const firstSizeType = Object.keys(sizeRanges)[0];
    if (firstSizeType && !sizeRanges[sizeType]) {
      setSizeType(firstSizeType);
    }
  }, [itemType, sizeRanges, sizeType]);

  useEffect(() => {
    const currentSizeRange = sizeRanges[validSizeType];
    if (!currentSizeRange) {
      setBoxSizeQuantities([]);
      return;
    }
    const sizes = currentSizeRange.sizes;
    const initialQuantities = sizes.map((size) => ({ size, quantity: 0, price: 0, recommendedSellingPrice: 0 }));
    const boxesArray = Array(numberOfBoxes).fill(null).map(() => [...initialQuantities]);
    setBoxSizeQuantities(boxesArray);
  }, [validSizeType, numberOfBoxes, sizeRanges]);

  // Вычисляем общее количество товара
  const totalItems = boxSizeQuantities.reduce((total, box) => {
    return total + box.reduce((sum, item) => sum + item.quantity, 0);
  }, 0);

  // Вычисляем общую стоимость
  const totalValue = boxSizeQuantities.reduce((total, box) => {
    const totalInBox = box.reduce((sum, item) => sum + item.quantity, 0);
    if (totalInBox > 0 && priceValue > 0) {
      if (priceMode === 'per_pair') {
        return total + (totalInBox * priceValue);
      } else {
        return total + priceValue;
      }
    }
    return total;
  }, 0);

  const pickImage = async (useCamera: boolean) => {
    try {
      const permissionResult = useCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissionResult.granted) {
        Alert.alert('Требуется разрешение', 'Пожалуйста, предоставьте разрешение для доступа к камере и галерее');
        return;
      }

      const result = useCamera
        ? await ImagePicker.launchCameraAsync({
          allowsEditing: true,
          aspect: [1, 1], // Квадратное соотношение для сохранения пропорций при сжатии
          quality: 1.0, // Высокое качество для последующего сжатия
          cameraType: ImagePicker.CameraType.back, // Задняя камера для товаров
        })
        : await ImagePicker.launchImageLibraryAsync({
          allowsEditing: true,
          aspect: [1, 1], // Квадратное соотношение для сохранения пропорций
          quality: 1.0, // Высокое качество для последующего сжатия
        });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const selectedImageUri = result.assets[0].uri;
        await handleImageCompression(selectedImageUri);
      }
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось выбрать изображение');
    }
  };

  const handleImageCompression = async (selectedImageUri: string) => {
    try {
      // Получаем информацию о размере файла
      const fileInfo = await FileSystem.getInfoAsync(selectedImageUri);
      const fileSize = (fileInfo as any).size || 0;

      // Если файл маленький (< 500KB), используем без сжатия
      if (fileSize < 500 * 1024) {
        setImageUri(selectedImageUri);
        return;
      }

      // Определяем рекомендуемый профиль сжатия
      const profile = getRecommendedProfile(fileSize);

      // Примерно оцениваем размер после сжатия
      const estimatedCompressedSize = fileSize * 0.3; // Примерно 30% от оригинала

      // Показываем диалог пользователю
      showCompressionDialog(
        fileSize,
        estimatedCompressedSize,
        async () => {
          // Пользователь согласился на сжатие
          try {
            const compressedResult = await compressImage(selectedImageUri, profile);
            console.log(`Изображение сжато: ${formatFileSize(compressedResult.originalSize)} → ${formatFileSize(compressedResult.compressedSize)}`);
            setImageUri(compressedResult.uri);
          } catch (error) {
            console.error('Ошибка сжатия:', error);
            Alert.alert('Предупреждение', 'Не удалось сжать изображение. Будет использован оригинал.');
            setImageUri(selectedImageUri);
          }
        },
        () => {
          // Пользователь отказался от сжатия
          setImageUri(selectedImageUri);
        }
      );
    } catch (error) {
      console.error('Ошибка обработки изображения:', error);
      // В случае ошибки используем оригинал
      setImageUri(selectedImageUri);
    }
  };

  const updateSizeQuantity = (boxIndex: number, size: number | string, change: number) => {
    setBoxSizeQuantities(prev =>
      prev.map((box, idx) =>
        idx === boxIndex
          ? box.map(item =>
            item.size === size
              ? { ...item, quantity: Math.max(0, item.quantity + change) }
              : item
          )
          : box
      )
    );
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) newErrors.name = 'Название обязательно';
    if (!code.trim()) newErrors.code = 'Код обязателен';
    if (!warehouse.trim()) newErrors.warehouse = 'Склад обязателен';

    // Проверяем, что хотя бы в одной коробке есть товары
    const hasItems = boxSizeQuantities.some(box =>
      box.some(item => item.quantity > 0)
    );
    if (!hasItems) newErrors.sizes = 'Добавьте хотя бы один товар в коробки';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setIsSaving(true);

    try {
      // Копируем boxSizeQuantities для модификации
      const modifiedBoxSizeQuantities = boxSizeQuantities.map(box => [...box]);

      // Вычисляем цены для каждой коробки
      let computedTotalValue = 0;
      modifiedBoxSizeQuantities.forEach((box) => {
        const totalInBox = box.reduce((sum, item) => sum + item.quantity, 0);
        let pricePerPair = 0;
        let recommendedPricePerPair = 0;

        if (totalInBox > 0 && priceValue > 0) {
          if (priceMode === 'per_box') {
            pricePerPair = priceValue / totalInBox;
          } else {
            pricePerPair = priceValue;
          }
        }

        if (totalInBox > 0 && recommendedSellingPrice > 0) {
          if (priceMode === 'per_box') {
            recommendedPricePerPair = recommendedSellingPrice / totalInBox;
          } else {
            recommendedPricePerPair = recommendedSellingPrice;
          }
        }

        box.forEach((item) => {
          item.price = pricePerPair;
          item.recommendedSellingPrice = recommendedPricePerPair;
          computedTotalValue += item.quantity * pricePerPair;
        });
      });

      // Преобразуем данные о коробках в JSON строку
      const boxesDataString = JSON.stringify(modifiedBoxSizeQuantities);

      // Генерируем QR-коды (используем временный ID 0 и undefined для UUID, они обновятся после вставки)
      const qrCodes = createQRCodesForItem(0, name, code, undefined, qrCodeType, numberOfBoxes, boxesDataString);
      const qrCodesString = qrCodes.length > 0 ? JSON.stringify(qrCodes) : null;

      await addItem({
        name,
        code,
        warehouse,
        numberOfBoxes,
        boxSizeQuantities: boxesDataString,
        sizeType,
        itemType,
        row: row || null,
        position: position || null,
        side: side || null,
        imageUri,
        totalQuantity: totalItems,
        totalValue: computedTotalValue,
        qrCodeType,
        qrCodes: qrCodesString,
      });

      // ПОСЛЕ УСПЕШНОГО ДОБАВЛЕНИЯ — эмитим событие, чтобы другие части UI могли обновиться
      try {
        DeviceEventEmitter.emit('itemAdded');
      } catch (e) {
        console.warn('Failed to emit itemAdded event', e);
      }

      setModalVisible(false);
      resetForm();
      Alert.alert('Успех', 'Товар успешно добавлен');
    } catch (error) {
      console.error('Save error:', error);
      Alert.alert('Ошибка', 'Не удалось сохранить товар. Попробуйте еще раз.');
    } finally {
      setIsSaving(false);
    }
  };

  const resetForm = () => {
    setName('');
    setCode('');
    setWarehouse('');
    setNumberOfBoxes(1);
    const firstCatalog = enabledCatalogs[0];
    setItemType(firstCatalog?.name ?? '');
    const firstSizeType = firstCatalog?.sizeTypes[0];
    setSizeType(firstSizeType?.name ?? '');
    if (firstSizeType) {
      const initialQuantities = firstSizeType.sizes.map((size) => ({ size, quantity: 0, price: 0, recommendedSellingPrice: 0 }));
      setBoxSizeQuantities([[...initialQuantities]]);
    } else {
      setBoxSizeQuantities([]);
    }
    setRow('');
    setPosition('');
    setSide('');
    setImageUri(null);
    setPriceValue(0);
    setRecommendedSellingPrice(0);
    setPriceMode('per_pair');
    setQrCodeType('none');
    setErrors({});
  };

  const handleCancel = () => {
    setModalVisible(false);
    resetForm();
  };

  return (
    <>
      <TouchableOpacity
        style={{
          position: 'absolute',
          bottom: 24,
          right: 24,
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: accentColor,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: accentColor,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
          elevation: 8,
        }}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={32} color="white" />
      </TouchableOpacity>

      <Modal
        animationType="slide"
        transparent={false}
        visible={modalVisible}
        onRequestClose={handleCancel}
        presentationStyle="fullScreen"
        statusBarTranslucent={true}
      >
        <View style={{
          flex: 1,
          backgroundColor: themeColors.background.screen,
        }}>
          {/* Шапка модального окна */}
          <View style={{
            backgroundColor: isDark ? themeColors.background.card : '#fff',
            paddingTop: Platform.OS === 'ios' ? 54 : 44,
            paddingBottom: 16,
            paddingHorizontal: 16,
            borderBottomWidth: 1,
            borderBottomColor: themeColors.border.normal,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <TouchableOpacity
                onPress={handleCancel}
                disabled={isSaving}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <Ionicons name="close" size={24} color={themeColors.text.normal} />
              </TouchableOpacity>

              <Text style={{
                flex: 1,
                marginHorizontal: 12,
                fontSize: 17,
                fontWeight: '600',
                color: themeColors.text.normal,
                textAlign: 'center',
              }}>
                Новый товар
              </Text>

              {/* Пустой View для баланса */}
              <View style={{ width: 40 }} />
            </View>
          </View>

          <ScrollView
            style={{ flex: 1, paddingHorizontal: 24 }}
            contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Основная информация */}
            <View style={{ marginBottom: 24 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <Ionicons name="information-circle" size={20} color={accentColor} />
                <Text style={{ fontSize: 16, fontWeight: '600', color: themeColors.text.normal, marginLeft: 8 }}>Основная информация</Text>
              </View>

              <FloatingTextInput
                label="Название *"
                value={name}
                onChangeText={setName}
                error={errors.name}
                editable={!isSaving}
                isDark={isDark}
                colors={themeColors}
              />

              <FloatingTextInput
                label="Код *"
                value={code}
                onChangeText={setCode}
                error={errors.code}
                editable={!isSaving}
                isDark={isDark}
                colors={themeColors}
              />

              <FloatingTextInput
                label="Склад *"
                value={warehouse}
                onChangeText={setWarehouse}
                error={errors.warehouse}
                editable={!isSaving}
                isDark={isDark}
                colors={themeColors}
              />
            </View>

            {/* Тип товара (каталог) */}
            <View style={{ marginBottom: 24 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <Ionicons name="shirt" size={20} color={isDark ? themeColors.primary.gold : defaultColors.primary.purple} />
                <Text style={{ fontSize: 16, fontWeight: '600', color: themeColors.text.normal, marginLeft: 8 }}>Каталог *</Text>
              </View>

              {enabledCatalogs.length === 0 ? (
                <View style={{
                  padding: 16,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: themeColors.border.normal,
                  backgroundColor: themeColors.background.card,
                }}>
                  <Text style={{ color: themeColors.text.muted, textAlign: 'center' }}>
                    Нет доступных каталогов. Создайте каталог в Настройки → Каталоги товаров.
                  </Text>
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                  {enabledCatalogs.map((cat) => {
                    const selected = itemType === cat.name;
                    return (
                      <TouchableOpacity
                        key={cat.id}
                        style={{
                          minWidth: 110,
                          padding: 14,
                          borderRadius: 12,
                          backgroundColor: selected ? (isDark ? 'rgba(212, 175, 55, 0.2)' : 'rgba(42, 171, 238, 0.12)') : themeColors.background.card,
                          borderWidth: 2,
                          borderColor: selected ? accentColor : themeColors.border.normal,
                          alignItems: 'center',
                        }}
                        onPress={() => setItemType(cat.name)}
                        disabled={isSaving}
                      >
                        <Text style={{ fontSize: 28 }}>{cat.icon || '📦'}</Text>
                        <Text style={{
                          marginTop: 6,
                          fontWeight: '600',
                          color: selected ? accentColor : themeColors.text.muted,
                          textAlign: 'center',
                        }}>
                          {cat.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
            </View>

            {/* Размерный ряд */}
            <View style={{ marginBottom: 24 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <Ionicons name="resize" size={20} color={isDark ? themeColors.primary.gold : defaultColors.primary.violet} />
                <Text style={{ fontSize: 16, fontWeight: '600', color: themeColors.text.normal, marginLeft: 8 }}>Размерный ряд *</Text>
              </View>

              <View style={{
                borderWidth: 2,
                borderColor: themeColors.border.normal,
                borderRadius: 12,
                overflow: 'hidden',
                backgroundColor: themeColors.background.card
              }}>
                <Picker
                  key={`picker-${itemType}-${validSizeType}`}
                  selectedValue={validSizeType}
                  onValueChange={(itemValue: string) => setSizeType(itemValue)}
                  enabled={!isSaving && Object.keys(sizeRanges).length > 0}
                  style={{ color: themeColors.text.normal }}
                  dropdownIconColor={themeColors.text.normal}
                >
                  {Object.values(sizeRanges).map((range) => (
                    <Picker.Item
                      key={range.type}
                      label={`${range.type} (${range.sizes.slice(0, 4).join(', ')}${range.sizes.length > 4 ? '…' : ''})`}
                      value={range.type}
                      color={isDark ? '#fff' : '#000'}
                    />
                  ))}
                </Picker>
              </View>
            </View>

            {/* Количество и цена */}
            <View style={{ marginBottom: 24 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <Ionicons name="pricetag" size={20} color={accentColor} />
                <Text style={{ fontSize: 16, fontWeight: '600', color: themeColors.text.normal, marginLeft: 8 }}>Количество и цена</Text>
              </View>

              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 14, color: themeColors.text.muted, marginBottom: 8, fontWeight: '500' }}>Количество коробок *</Text>
                <View style={{
                  borderWidth: 2,
                  borderColor: themeColors.border.normal,
                  borderRadius: 12,
                  overflow: 'hidden',
                  backgroundColor: themeColors.background.card
                }}>
                  <Picker
                    selectedValue={numberOfBoxes}
                    onValueChange={(itemValue: number) => setNumberOfBoxes(itemValue)}
                    enabled={!isSaving}
                    style={{ color: themeColors.text.normal }}
                    dropdownIconColor={themeColors.text.normal}
                  >
                    {Array.from({ length: 20 }, (_, i) => i + 1).map(num => (
                      <Picker.Item key={num} label={`${num} ${num === 1 ? 'коробка' : num < 5 ? 'коробки' : 'коробок'}`} value={num} color={isDark ? '#fff' : '#000'} />
                    ))}
                  </Picker>
                </View>
              </View>

              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 14, color: themeColors.text.muted, marginBottom: 8, fontWeight: '500' }}>Тип цены *</Text>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      padding: 12,
                      borderRadius: 12,
                      backgroundColor: priceMode === 'per_pair' ? (isDark ? 'rgba(212, 175, 55, 0.2)' : 'rgba(42, 171, 238, 0.12)') : themeColors.background.card,
                      borderWidth: 2,
                      borderColor: priceMode === 'per_pair' ? accentColor : themeColors.border.normal,
                    }}
                    onPress={() => setPriceMode('per_pair')}
                    disabled={isSaving}
                  >
                    <View style={{ alignItems: 'center' }}>
                      <Ionicons
                        name="cash-outline"
                        size={24}
                        color={priceMode === 'per_pair' ? accentColor : themeColors.text.muted}
                      />
                      <Text style={{
                        marginTop: 4,
                        fontSize: 12,
                        fontWeight: '600',
                        color: priceMode === 'per_pair' ? accentColor : themeColors.text.muted
                      }}>
                        За пару
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={{
                      flex: 1,
                      padding: 12,
                      borderRadius: 12,
                      backgroundColor: priceMode === 'per_box' ? (isDark ? 'rgba(212, 175, 55, 0.2)' : 'rgba(42, 171, 238, 0.12)') : themeColors.background.card,
                      borderWidth: 2,
                      borderColor: priceMode === 'per_box' ? accentColor : themeColors.border.normal,
                    }}
                    onPress={() => setPriceMode('per_box')}
                    disabled={isSaving}
                  >
                    <View style={{ alignItems: 'center' }}>
                      <Ionicons
                        name="cube-outline"
                        size={24}
                        color={priceMode === 'per_box' ? accentColor : themeColors.text.muted}
                      />
                      <Text style={{
                        marginTop: 4,
                        fontSize: 12,
                        fontWeight: '600',
                        color: priceMode === 'per_box' ? accentColor : themeColors.text.muted
                      }}>
                        За коробку
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </View>

              <FloatingTextInput
                label={priceMode === 'per_pair' ? "Цена за пару (сомонӣ)" : "Цена за коробку (сомонӣ)"}
                value={priceValue.toString()}
                onChangeText={(text) => setPriceValue(parseFloat(text) || 0)}
                editable={!isSaving}
                placeholder="0"
                keyboardType="numeric"
                isDark={isDark}
                colors={themeColors}
              />

              <FloatingTextInput
                label={priceMode === 'per_pair' ? "Рекомендуемая цена продажи" : "Рекомендуемая цена продажи"}
                value={recommendedSellingPrice.toString()}
                onChangeText={(text) => setRecommendedSellingPrice(parseFloat(text) || 0)}
                editable={!isSaving}
                placeholder="0"
                keyboardType="numeric"
                isDark={isDark}
                colors={themeColors}
              />
            </View>

            {/* Тип QR-кода */}
            <View style={{ marginBottom: 24 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <Ionicons name="qr-code" size={20} color={isDark ? themeColors.primary.gold : defaultColors.primary.purple} />
                <Text style={{ fontSize: 16, fontWeight: '600', color: themeColors.text.normal, marginLeft: 8 }}>QR-коды</Text>
              </View>

              <View style={{ flexDirection: 'row', marginBottom: 16, gap: 12 }}>
                <TouchableOpacity
                  style={{
                    flex: 1,
                    padding: 12,
                    borderRadius: 12,
                    backgroundColor: qrCodeType === 'none' ? (isDark ? 'rgba(212, 175, 55, 0.2)' : 'rgba(42, 171, 238, 0.12)') : themeColors.background.card,
                    borderWidth: 2,
                    borderColor: qrCodeType === 'none' ? accentColor : themeColors.border.normal,
                  }}
                  onPress={() => setQrCodeType('none')}
                  disabled={isSaving}
                >
                  <View style={{ alignItems: 'center' }}>
                    <Ionicons
                      name="close-circle-outline"
                      size={28}
                      color={qrCodeType === 'none' ? accentColor : themeColors.text.muted}
                    />
                    <Text style={{
                      marginTop: 4,
                      fontSize: 12,
                      fontWeight: '600',
                      color: qrCodeType === 'none' ? accentColor : themeColors.text.muted
                    }}>
                      Без QR
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    flex: 1,
                    padding: 12,
                    borderRadius: 12,
                    backgroundColor: qrCodeType === 'per_box' ? (isDark ? 'rgba(212, 175, 55, 0.2)' : 'rgba(42, 171, 238, 0.12)') : themeColors.background.card,
                    borderWidth: 2,
                    borderColor: qrCodeType === 'per_box' ? accentColor : themeColors.border.normal,
                  }}
                  onPress={() => setQrCodeType('per_box')}
                  disabled={isSaving}
                >
                  <View style={{ alignItems: 'center' }}>
                    <Ionicons
                      name="cube-outline"
                      size={28}
                      color={qrCodeType === 'per_box' ? accentColor : themeColors.text.muted}
                    />
                    <Text style={{
                      marginTop: 4,
                      fontSize: 12,
                      fontWeight: '600',
                      color: qrCodeType === 'per_box' ? accentColor : themeColors.text.muted
                    }}>
                      На коробку
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    flex: 1,
                    padding: 12,
                    borderRadius: 12,
                    backgroundColor: qrCodeType === 'per_item' ? (isDark ? 'rgba(212, 175, 55, 0.2)' : 'rgba(42, 171, 238, 0.12)') : themeColors.background.card,
                    borderWidth: 2,
                    borderColor: qrCodeType === 'per_item' ? accentColor : themeColors.border.normal,
                  }}
                  onPress={() => setQrCodeType('per_item')}
                  disabled={isSaving}
                >
                  <View style={{ alignItems: 'center' }}>
                    <Ionicons
                      name="pricetags-outline"
                      size={28}
                      color={qrCodeType === 'per_item' ? accentColor : themeColors.text.muted}
                    />
                    <Text style={{
                      marginTop: 4,
                      fontSize: 12,
                      fontWeight: '600',
                      color: qrCodeType === 'per_item' ? accentColor : themeColors.text.muted
                    }}>
                      На товар
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>

            {/* Размеры по коробкам */}
            <View style={{ marginBottom: 24 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <Ionicons name="grid" size={20} color={accentColor} />
                <Text style={{ fontSize: 16, fontWeight: '600', color: themeColors.text.normal, marginLeft: 8 }}>Размеры по коробкам *</Text>
              </View>
              {errors.sizes && (
                <View style={{
                  backgroundColor: '#fef2f2',
                  borderLeftWidth: 4,
                  borderLeftColor: '#ef4444',
                  padding: 12,
                  borderRadius: 8,
                  marginBottom: 12
                }}>
                  <Text style={{ color: '#dc2626', fontSize: 14, fontWeight: '500' }}>{errors.sizes}</Text>
                </View>
              )}

              {boxSizeQuantities.map((box, boxIndex) => {
                const totalInBox = box.reduce((sum, item) => sum + item.quantity, 0);
                let pricePerPair = 0;
                let boxTotalPrice = 0;
                if (totalInBox > 0 && priceValue > 0) {
                  if (priceMode === 'per_box') {
                    pricePerPair = priceValue / totalInBox;
                    boxTotalPrice = priceValue;
                  } else {
                    pricePerPair = priceValue;
                    boxTotalPrice = priceValue * totalInBox;
                  }
                }
                return (
                  <View key={boxIndex} style={{
                    backgroundColor: isDark ? themeColors.background.light : 'rgba(240, 246, 252, 1)',
                    marginBottom: 16,
                    borderRadius: 16,
                    padding: 16,
                    borderWidth: 1,
                    borderColor: isDark ? themeColors.border.normal : '#bfdbfe',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.1,
                    shadowRadius: 2,
                    elevation: 2,
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View style={{
                          backgroundColor: accentColor,
                          width: 32,
                          height: 32,
                          borderRadius: 16,
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginRight: 8
                        }}>
                          <Text style={{ color: '#fff', fontWeight: 'bold' }}>{boxIndex + 1}</Text>
                        </View>
                        <Text style={{ color: themeColors.text.normal, fontWeight: 'bold', fontSize: 16 }}>Коробка {boxIndex + 1}</Text>
                      </View>
                      <View style={{
                        backgroundColor: isDark ? 'rgba(212, 175, 55, 0.2)' : 'rgba(42, 171, 238, 0.15)',
                        paddingHorizontal: 12,
                        paddingVertical: 4,
                        borderRadius: 20
                      }}>
                        <Text style={{ color: accentColor, fontWeight: '600', fontSize: 12 }}>{totalInBox} шт</Text>
                      </View>
                    </View>

                    <View style={{ gap: 8 }}>
                      {box.map((item, sizeIndex) => (
                        <View key={sizeIndex} style={{
                          backgroundColor: themeColors.background.card,
                          borderRadius: 12,
                          padding: 12,
                          borderWidth: 1,
                          borderColor: themeColors.border.light,
                          shadowColor: '#000',
                          shadowOffset: { width: 0, height: 1 },
                          shadowOpacity: 0.05,
                          shadowRadius: 2,
                          elevation: 1,
                        }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                              <View style={{
                                backgroundColor: isDark ? 'rgba(212, 175, 55, 0.2)' : 'rgba(42, 171, 238, 0.15)',
                                paddingHorizontal: 12,
                                paddingVertical: 4,
                                borderRadius: 8,
                                marginRight: 8
                              }}>
                                <Text style={{ color: accentColor, fontWeight: 'bold' }}>{item.size}</Text>
                              </View>
                              {item.quantity > 0 && (
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                  <Text style={{ color: themeColors.text.muted, fontSize: 11 }}>
                                    {priceMode === 'per_pair' ? priceValue.toFixed(0) : (priceValue / (box.reduce((s, i) => s + i.quantity, 0) || 1)).toFixed(0)}с × {item.quantity} =
                                  </Text>
                                  <Text style={{ color: isDark ? themeColors.primary.gold : '#22c55e', fontWeight: '600', fontSize: 12, marginLeft: 2 }}>
                                    {(priceMode === 'per_pair' ? priceValue * item.quantity : (priceValue / (box.reduce((s, i) => s + i.quantity, 0) || 1)) * item.quantity).toFixed(0)}с
                                  </Text>
                                </View>
                              )}
                            </View>

                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                              <TouchableOpacity
                                style={{
                                  backgroundColor: '#ef4444',
                                  width: 36,
                                  height: 36,
                                  borderRadius: 12,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  shadowColor: '#000',
                                  shadowOffset: { width: 0, height: 1 },
                                  shadowOpacity: 0.1,
                                  shadowRadius: 2,
                                  elevation: 1,
                                }}
                                onPress={() => updateSizeQuantity(boxIndex, item.size, -1)}
                                disabled={isSaving}
                              >
                                <Ionicons name="remove" size={20} color="white" />
                              </TouchableOpacity>

                              <View style={{ marginHorizontal: 12, minWidth: 40, alignItems: 'center' }}>
                                <Text style={{ fontSize: 18, fontWeight: 'bold', color: themeColors.text.normal }}>{item.quantity}</Text>
                              </View>

                              <TouchableOpacity
                                style={{
                                  backgroundColor: '#22c55e',
                                  width: 36,
                                  height: 36,
                                  borderRadius: 12,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  shadowColor: '#000',
                                  shadowOffset: { width: 0, height: 1 },
                                  shadowOpacity: 0.1,
                                  shadowRadius: 2,
                                  elevation: 1,
                                }}
                                onPress={() => updateSizeQuantity(boxIndex, item.size, 1)}
                                disabled={isSaving}
                              >
                                <Ionicons name="add" size={20} color="white" />
                              </TouchableOpacity>
                            </View>
                          </View>

                        </View>
                      ))}
                    </View>

                    {totalInBox > 0 && (
                      <View style={{
                        backgroundColor: isDark ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.1)',
                        marginTop: 12,
                        padding: 12,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: isDark ? 'rgba(34, 197, 94, 0.3)' : '#86efac'
                      }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text style={{ fontSize: 14, color: themeColors.text.normal, fontWeight: '500' }}>Итого в коробке:</Text>
                          <Text style={{ color: '#22c55e', fontSize: 14, fontWeight: 'bold' }}>{boxTotalPrice.toFixed(2)} сомонӣ</Text>
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}

              {/* Общая сводка */}
              <LinearGradient
                colors={isDark ? themeColors.gradients.accent : defaultColors.gradients.main}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ marginTop: 16, padding: 20, borderRadius: 16 }}
                className="shadow-lg"
              >
                <View className="flex-row items-center mb-3">
                  <Ionicons name="stats-chart" size={24} color="white" />
                  <Text className="text-white font-bold text-lg ml-2">Общая сводка</Text>
                </View>
                <View className="space-y-2">
                  <View className="flex-row justify-between items-center">
                    <View className="flex-row items-center">
                      <Ionicons name="cube-outline" size={18} color="white" />
                      <Text className="text-white ml-2">Коробок:</Text>
                    </View>
                    <Text className="text-white font-bold text-lg">{numberOfBoxes}</Text>
                  </View>
                  <View className="flex-row justify-between items-center">
                    <View className="flex-row items-center">
                      <Ionicons name="layers-outline" size={18} color="white" />
                      <Text className="text-white ml-2">Товаров:</Text>
                    </View>
                    <Text className="text-white font-bold text-lg">{totalItems}</Text>
                  </View>
                  <View className="h-px bg-white my-2"></View>
                  <View className="flex-row justify-between items-center">
                    <View className="flex-row items-center">
                      <Ionicons name="cash" size={18} color="white" />
                      <Text className="text-white ml-2">Общая стоимость:</Text>
                    </View>
                    <Text className="text-white font-bold text-xl">{totalValue.toFixed(2)} сомонӣ</Text>
                  </View>
                </View>
              </LinearGradient>
            </View>

            {/* Дополнительная информация */}
            <View style={{ marginBottom: 24 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <Ionicons name="location" size={20} color={isDark ? themeColors.primary.gold : defaultColors.primary.purple} />
                <Text style={{ fontSize: 16, fontWeight: '600', color: themeColors.text.normal, marginLeft: 8 }}>Местоположение (необязательно)</Text>
              </View>

              <View style={{ gap: 12 }}>
                <FloatingTextInput
                  label="Ряд"
                  value={row}
                  onChangeText={setRow}
                  editable={!isSaving}
                  isDark={isDark}
                  colors={themeColors}
                />

                <FloatingTextInput
                  label="Позиция"
                  value={position}
                  onChangeText={setPosition}
                  editable={!isSaving}
                  isDark={isDark}
                  colors={themeColors}
                />

                <FloatingTextInput
                  label="Сторона"
                  value={side}
                  onChangeText={setSide}
                  editable={!isSaving}
                  isDark={isDark}
                  colors={themeColors}
                />
              </View>
            </View>

            {/* Изображение */}
            <View style={{ marginBottom: 24 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <Ionicons name="images" size={20} color={accentColor} />
                <Text style={{ fontSize: 16, fontWeight: '600', color: themeColors.text.normal, marginLeft: 8 }}>Фотография товара</Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity
                  style={{
                    backgroundColor: accentColor,
                    flex: 1,
                    padding: 16,
                    borderRadius: 12,
                    alignItems: 'center',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.1,
                    shadowRadius: 2,
                    elevation: 1,
                  }}
                  onPress={() => pickImage(true)}
                  disabled={isSaving}
                >
                  <Ionicons name="camera" size={28} color="white" />
                  <Text style={{ color: 'white', fontWeight: '600', marginTop: 8 }}>Камера</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{
                    backgroundColor: accentColor,
                    flex: 1,
                    padding: 16,
                    borderRadius: 12,
                    alignItems: 'center',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.1,
                    shadowRadius: 2,
                    elevation: 1,
                  }}
                  onPress={() => pickImage(false)}
                  disabled={isSaving}
                >
                  <Ionicons name="images" size={28} color="white" />
                  <Text style={{ color: 'white', fontWeight: '600', marginTop: 8 }}>Галерея</Text>
                </TouchableOpacity>
              </View>

              {imageUri && (
                <View style={{
                  marginTop: 16,
                  alignItems: 'center',
                  backgroundColor: isDark ? themeColors.background.light : '#f9fafb',
                  padding: 16,
                  borderRadius: 16,
                  borderWidth: 2,
                  borderStyle: 'dashed',
                  borderColor: themeColors.border.normal
                }}>
                  <Image
                    source={{ uri: imageUri }}
                    style={{
                      width: 240,
                      height: 240,
                      borderRadius: 12,
                    }}
                  />
                  <TouchableOpacity
                    style={{
                      marginTop: 12,
                      backgroundColor: '#ef4444',
                      paddingHorizontal: 16,
                      paddingVertical: 8,
                      borderRadius: 20,
                    }}
                    onPress={() => setImageUri(null)}
                    disabled={isSaving}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Ionicons name="trash-outline" size={16} color="white" />
                      <Text style={{ color: 'white', fontWeight: '600', marginLeft: 8 }}>Удалить фото</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Кнопки действий */}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: '#6b7280',
                  padding: 16,
                  borderRadius: 12,
                  alignItems: 'center',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.1,
                  shadowRadius: 2,
                  elevation: 1,
                }}
                onPress={handleCancel}
                disabled={isSaving}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="close-circle" size={24} color="white" />
                  <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16, marginLeft: 8 }}>Отмена</Text>
                </View>
              </TouchableOpacity>

              {isSaving ? (
                <View style={{
                  flex: 1,
                  backgroundColor: accentColor,
                  padding: 16,
                  borderRadius: 12,
                  alignItems: 'center',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.1,
                  shadowRadius: 2,
                  elevation: 1,
                }}>
                  <ActivityIndicator color="white" size="large" />
                </View>
              ) : (
                <TouchableOpacity
                  style={{
                    flex: 1,
                    backgroundColor: accentColor,
                    padding: 16,
                    borderRadius: 12,
                    alignItems: 'center',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.1,
                    shadowRadius: 2,
                    elevation: 1,
                  }}
                  onPress={handleSave}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="checkmark-circle" size={24} color="white" />
                    <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16, marginLeft: 8 }}>Сохранить</Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
};