// components/ItemDetailsModal.tsx

import { useState, useEffect } from 'react';
import { Modal, View, ScrollView, Text, Image, TouchableOpacity, Alert, ActivityIndicator, TextInput, Pressable, Platform, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { Item, SizeQuantity, PriceUnit, isWeightPriceUnit } from '../database/types';
import {
  sanitizePriceText,
  parsePriceText,
  formatPriceForInput,
  priceUnitLabel,
  gramsToPriceUnits,
  gramsPerPriceUnit,
  formatWeight,
} from '../utils/priceInput';
import { useDatabase } from '../hooks/useDatabase';
import { Picker } from '@react-native-picker/picker';
import { compressImage, showCompressionDialog, getRecommendedProfile, formatFileSize } from '../utils/imageCompression';
import * as FileSystem from 'expo-file-system';
import { useAuth } from '../src/contexts/AuthContext';
import { QRCodeDisplay } from './QRCodeDisplay';
import { BarcodePreview } from './BarcodePreview';
import { CreateQRModal } from './CreateQRModal';
import { useTheme } from '../src/contexts/ThemeContext';
import { useCurrency } from '../src/contexts/CurrencyContext';
import { useCatalogs } from '../src/contexts/CatalogsContext';
import { getThemeColors, colors as defaultColors } from '../constants/theme';
import { createQRCodesForItem } from '../utils/qrCodeUtils';
import SyncService from '../src/services/SyncService';
import NetInfo from '@react-native-community/netinfo';
import ImageService from '../src/services/ImageService';
import AuthService from '../src/services/AuthService';
import { useCart } from '../src/contexts/CartContext';
import { Toast } from '../src/components/Toast';
import { useNavigation } from '@react-navigation/native';
import ItemAttributesEditor, { DraftAttribute, COLOR_SWATCHES } from '../src/components/warehouse/ItemAttributesEditor';
import { CATALOG_TEMPLATES } from '../src/config/catalogTemplates';
import {
  getAttributesForItem,
  replaceAttributesForItem,
} from '../src/services/ItemAttributeService';

interface ItemDetailsModalProps {
  item: Item;
  visible: boolean;
  onClose: () => void;
  onItemUpdated: (updatedItem?: Item) => void;
  onItemDeleted: (itemId: number) => void;
}

const ItemDetailsModal = ({ item, visible, onClose, onItemUpdated, onItemDeleted }: ItemDetailsModalProps) => {
  const { user, isAdmin, isAssistant } = useAuth();
  const { isDark } = useTheme();
  const { label: currencyShort } = useCurrency();
  const colors = getThemeColors(isDark);
  const { catalogs } = useCatalogs();
  const { addToCart, updateQuantity, removeFromCart, validateCartForItem, cartItems } = useCart();
  const navigation = useNavigation<any>();
  const [currentItem, setCurrentItem] = useState<Item>(item);
  const [isLoading, setIsLoading] = useState(false);
  const [boxSizeQuantities, setBoxSizeQuantities] = useState<SizeQuantity[][]>([]);
  const [showSaleModal, setShowSaleModal] = useState(false);
  // Мини-модалка для ввода веса при добавлении весового товара в корзину.
  // Открывается из размерной строки когда currentItem.priceUnit ∈ kg/100g.
  const [weightModal, setWeightModal] = useState<null | {
    boxIndex: number;
    sizeIndex: number;
    sizeQty: SizeQuantity;
  }>(null);
  const [weightGramsText, setWeightGramsText] = useState('');
  const [currentBoxIndex, setCurrentBoxIndex] = useState(0);
  const [currentSize, setCurrentSize] = useState<number | string>(0);
  const [salePrice, setSalePrice] = useState('');

  // Состояния для оптовой продажи
  const [showWholesaleModal, setShowWholesaleModal] = useState(false);
  const [selectedBoxes, setSelectedBoxes] = useState<{ boxIndex: number, price: string, selected: boolean }[]>([]);

  // Состояния для QR-кодов
  const [showCreateQRModal, setShowCreateQRModal] = useState(false);

  // Превью штрих-кода
  const [showBarcodePreview, setShowBarcodePreview] = useState(false);

  // Toast для уведомлений
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error' | 'warning' | 'info'>('info');

  const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') => {
    setToastMessage(message);
    setToastType(type);
    setToastVisible(true);
  };

  const { updateItemQuantity, deleteItem, addTransaction, updateItem, updateItemQRCodes } = useDatabase();

  // Является ли товар "на вес" — определяет UI: для веса вместо +/- кнопок
  // показываем "Ввести вес" и считаем сумму по введённым граммам.
  const itemPriceUnit = (currentItem.priceUnit as PriceUnit | undefined) || 'pair';
  const isWeightItem = isWeightPriceUnit(itemPriceUnit);

  // Открыть мини-модалку ввода веса для конкретного размера + коробки.
  // Если этот размер уже в корзине — подставляем текущий вес (в граммах),
  // чтобы пользователь мог отредактировать, а не вводить с нуля.
  const openWeightModalFor = (boxIndex: number, sizeQty: SizeQuantity) => {
    const sizeIndex = boxSizeQuantities[boxIndex]?.findIndex(
      sq => String(sq.size) === String(sizeQty.size)
    ) ?? -1;
    if (sizeIndex === -1) return;

    const existing = cartItems.find(
      ci => ci.item.id === currentItem.id && ci.boxIndex === boxIndex && ci.sizeIndex === sizeIndex
    );
    const perUnit = gramsPerPriceUnit(itemPriceUnit);
    if (existing && perUnit > 0) {
      // existing.quantity хранится в единицах priceUnit (kg → 0.878),
      // обратно в граммы: quantity * perUnit.
      const grams = Math.round(existing.quantity * perUnit);
      setWeightGramsText(grams > 0 ? String(grams) : '');
    } else {
      setWeightGramsText('');
    }
    setWeightModal({ boxIndex, sizeIndex, sizeQty });
  };

  // Подтверждение веса из мини-модалки → добавление в корзину.
  const confirmWeightAdd = () => {
    if (!weightModal) return;
    const grams = parsePriceText(weightGramsText);
    if (grams <= 0) {
      Alert.alert('Введите вес', 'Укажите вес больше нуля (в граммах).');
      return;
    }
    const { boxIndex, sizeIndex, sizeQty } = weightModal;
    // Количество в "единицах priceUnit" — то что хранится в CartItem.quantity
    // и умножается на price (за priceUnit) чтобы получить сумму.
    const quantityInPriceUnits = gramsToPriceUnits(grams, itemPriceUnit);
    // Максимальный остаток в тех же единицах — sizeQty.quantity уже в priceUnit.
    if (quantityInPriceUnits > (sizeQty.quantity || 0) + 1e-9) {
      const stockGrams = Math.round((sizeQty.quantity || 0) * gramsPerPriceUnit(itemPriceUnit));
      Alert.alert('Недостаточно на складе', `На складе только ${formatWeight(stockGrams)}.`);
      return;
    }

    addToCart(
      currentItem,
      boxIndex,
      sizeIndex,
      sizeQty.size,
      quantityInPriceUnits,
      sizeQty.price || 0,
      sizeQty.recommendedSellingPrice,
      sizeQty.quantity,
    );
    setWeightModal(null);
    setWeightGramsText('');
  };

  // Удалить из корзины из мини-модалки (если был там).
  const removeWeightItem = () => {
    if (!weightModal) return;
    const { boxIndex, sizeIndex } = weightModal;
    const existing = cartItems.find(
      ci => ci.item.id === currentItem.id && ci.boxIndex === boxIndex && ci.sizeIndex === sizeIndex
    );
    if (existing) removeFromCart(existing.id);
    setWeightModal(null);
    setWeightGramsText('');
  };

  // Функция добавления в корзину
  const handleAddToCart = (boxIndex: number, sizeQty: SizeQuantity) => {
    const sizeIndex = boxSizeQuantities[boxIndex]?.findIndex(
      sq => String(sq.size) === String(sizeQty.size)
    ) ?? -1;

    if (sizeIndex === -1) {
      Alert.alert('Ошибка', 'Размер не найден');
      return;
    }

    addToCart(
      currentItem,
      boxIndex,
      sizeIndex,
      sizeQty.size,
      1,
      sizeQty.price || 0,
      sizeQty.recommendedSellingPrice,
      sizeQty.quantity
    );
  };

  // Получить количество в корзине для конкретного размера
  const getCartQuantityForSize = (boxIndex: number, sizeIndex: number): { quantity: number; cartItemId: number | null } => {
    const cartItem = cartItems.find(
      ci => ci.item.id === currentItem.id && ci.boxIndex === boxIndex && ci.sizeIndex === sizeIndex
    );
    return {
      quantity: cartItem?.quantity || 0,
      cartItemId: cartItem?.id || null
    };
  };

  // Увеличить количество в корзине
  const handleIncreaseQuantity = (boxIndex: number, sizeQty: SizeQuantity) => {
    const sizeIndex = boxSizeQuantities[boxIndex]?.findIndex(
      sq => String(sq.size) === String(sizeQty.size)
    ) ?? -1;

    const { quantity, cartItemId } = getCartQuantityForSize(boxIndex, sizeIndex);

    if (cartItemId && quantity < sizeQty.quantity) {
      updateQuantity(cartItemId, quantity + 1);
    } else if (!cartItemId) {
      handleAddToCart(boxIndex, sizeQty);
    }
  };

  // Уменьшить количество в корзине
  const handleDecreaseQuantity = (boxIndex: number, sizeQty: SizeQuantity) => {
    const sizeIndex = boxSizeQuantities[boxIndex]?.findIndex(
      sq => String(sq.size) === String(sizeQty.size)
    ) ?? -1;

    const { quantity, cartItemId } = getCartQuantityForSize(boxIndex, sizeIndex);

    if (cartItemId) {
      if (quantity > 1) {
        updateQuantity(cartItemId, quantity - 1);
      } else {
        removeFromCart(cartItemId);
      }
    }
  };

  // Состояния для редактирования
  const [isEditing, setIsEditing] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [editedName, setEditedName] = useState(item.name || '');
  const [editedCode, setEditedCode] = useState(item.code || '');
  const [editedWarehouse, setEditedWarehouse] = useState(item.warehouse || '');
  const [editedRow, setEditedRow] = useState(item.row || '');
  const [editedPosition, setEditedPosition] = useState(item.position || '');
  const [editedSide, setEditedSide] = useState(item.side || '');
  const [editedImageUri, setEditedImageUri] = useState(item.imageUri);
  const [priceMode, setPriceMode] = useState<'per_pair' | 'per_box' | 'per_weight'>('per_pair');
  const [weightUnit, setWeightUnit] = useState<'kg' | '100g' | 'piece'>('kg');
  // Цены храним как строки чтобы поддержать дробный ввод ("11.", "0.5")
  // и системную запятую с клавиатуры.
  const [priceText, setPriceText] = useState('');
  const [recommendedPriceText, setRecommendedPriceText] = useState('');
  const priceValue = parsePriceText(priceText);
  const recommendedSellingPrice = parsePriceText(recommendedPriceText);
  // Тумблер "Разная цена для размеров" — в режиме редактирования.
  // Авто-определяется при загрузке: если в текущем item цены среди размеров отличаются → true.
  const [perSizePricing, setPerSizePricing] = useState(false);
  const [editedNumberOfBoxes, setEditedNumberOfBoxes] = useState(item.numberOfBoxes || 1);
  const [extraAttributes, setExtraAttributes] = useState<DraftAttribute[]>([]);
  const [savedAttributes, setSavedAttributes] = useState<DraftAttribute[]>([]);

  // Подсказки атрибутов из шаблона активного каталога
  const suggestedAttributes = (() => {
    const itemType = currentItem.itemType || '';
    if (!itemType) return [];
    for (const tpl of CATALOG_TEMPLATES) {
      const found = tpl.catalogs.find((c) => c.name.toLowerCase() === itemType.toLowerCase());
      if (found?.suggestedAttributes) return found.suggestedAttributes;
    }
    return [];
  })();

  // Размерные ряды берутся из активного каталога (динамически, через CatalogsContext)
  const getSizesFromType = (type: string) => {
    const itemType = currentItem.itemType || '';
    const cat = catalogs.find((c) => c.name.toLowerCase() === itemType.toLowerCase());
    if (cat) {
      const exact = cat.sizeTypes.find((st) => st.name.toLowerCase() === type.toLowerCase());
      if (exact) return exact.sizes;
      const fallback = cat.sizeTypes[0];
      if (fallback) {
        console.warn(`SizeType "${type}" not found for catalog "${itemType}", using "${fallback.name}"`);
        return fallback.sizes;
      }
    }

    // Если каталог не найден (legacy/удалён), пытаемся найти в любом каталоге по имени sizeType
    for (const c of catalogs) {
      const st = c.sizeTypes.find((s) => s.name.toLowerCase() === type.toLowerCase());
      if (st) return st.sizes;
    }

    console.warn(`No catalog or size range found for "${itemType}"/"${type}"`);
    return [];
  };

  useEffect(() => {
    if (visible) {
      setCurrentItem(item);
      setEditedName(item.name || '');
      setEditedCode(item.code || '');
      setEditedWarehouse(item.warehouse || '');
      setEditedRow(item.row || '');
      setEditedPosition(item.position || '');
      setEditedSide(item.side || '');
      setEditedImageUri(item.imageUri);
      setEditedNumberOfBoxes(item.numberOfBoxes || 1);
      setIsEditing(false);
      setShowMenu(false);
      try {
        const parsedBoxes = JSON.parse(item.boxSizeQuantities || '[]');
        // Защита от некорректных данных - проверяем что это массив массивов с объектами
        if (Array.isArray(parsedBoxes) && parsedBoxes.length > 0) {
          // Проверяем что каждый элемент это массив с объектами у которых есть size и quantity
          const validBoxes = parsedBoxes.map(box => {
            if (!Array.isArray(box)) return [];
            return box.map(sq => ({
              size: sq.size || 0,
              quantity: sq.quantity || 0,
              price: (sq.price !== undefined && !isNaN(sq.price)) ? sq.price : 0,
              recommendedSellingPrice: (sq.recommendedSellingPrice !== undefined && !isNaN(sq.recommendedSellingPrice)) ? sq.recommendedSellingPrice : 0
            }));
          }).filter(box => box.length > 0);
          setBoxSizeQuantities(validBoxes.length > 0 ? validBoxes : []);
        } else {
          setBoxSizeQuantities([]);
        }
      } catch (error) {
        console.error('Error parsing box sizes:', error);
        setBoxSizeQuantities([]);
      }

      // Загружаем доп. параметры товара
      if (item.uuid) {
        getAttributesForItem(item.uuid)
          .then((rows) => {
            const drafts: DraftAttribute[] = rows.map((r) => ({
              id: r.id,
              name: r.name,
              value: r.value,
              attrType: r.attrType,
              unit: r.unit,
              options: suggestedAttributes.find((s) => s.name.toLowerCase() === r.name.toLowerCase())?.options,
            }));
            setSavedAttributes(drafts);
            setExtraAttributes(drafts);
          })
          .catch((e) => {
            console.warn('Failed to load item attributes:', e);
            setSavedAttributes([]);
            setExtraAttributes([]);
          });
      } else {
        setSavedAttributes([]);
        setExtraAttributes([]);
      }
    }
  }, [item, visible]);

  useEffect(() => {
    if (isEditing) {
      let allPrices: number[] = [];
      let allRecommendedPrices: number[] = [];
      boxSizeQuantities.flatMap(box => box.filter(sq => sq.quantity > 0).map(sq => (sq.price !== undefined && !isNaN(sq.price)) ? sq.price : 0)).forEach(p => allPrices.push(p));
      boxSizeQuantities.flatMap(box => box.filter(sq => sq.quantity > 0).map(sq => (sq.recommendedSellingPrice !== undefined && !isNaN(sq.recommendedSellingPrice)) ? sq.recommendedSellingPrice : 0)).forEach(p => allRecommendedPrices.push(p));

      // Авто-определение perSizePricing: если у позиций с qty>0 разные цены/рек.цены — считаем что включён режим "разная цена".
      const uniquePricesSet = new Set(allPrices.filter(p => p > 0));
      const uniqueRecsSet = new Set(allRecommendedPrices.filter(p => p > 0));
      if (uniquePricesSet.size > 1 || uniqueRecsSet.size > 1) {
        setPerSizePricing(true);
      } else {
        setPerSizePricing(false);
      }

      // Определяем priceMode и значение цены.
      // Если у item есть сохранённый priceUnit ('kg'/'100g'/'piece') — считаем
      // что товар весовой, и подставляем priceMode='per_weight' + единицу.
      const savedUnit = (currentItem.priceUnit as PriceUnit | undefined) || 'pair';
      const isWeightItem = savedUnit === 'kg' || savedUnit === '100g' || savedUnit === 'piece';

      if (allPrices.length > 0) {
        const uniquePrices = [...new Set(allPrices)];
        if (uniquePrices.length === 1) {
          // Одинаковая цена по всем размерам
          if (isWeightItem) {
            setPriceMode('per_weight');
            setWeightUnit(savedUnit as 'kg' | '100g' | 'piece');
          } else if (savedUnit === 'box') {
            setPriceMode('per_box');
          } else {
            setPriceMode('per_pair');
          }
          setPriceText(formatPriceForInput(uniquePrices[0]));
        } else {
          let boxTotals: number[] = boxSizeQuantities.map(box => box.reduce((sum, sq) => {
            const price = (sq.price !== undefined && !isNaN(sq.price)) ? sq.price : 0;
            return sum + (sq.quantity || 0) * price;
          }, 0));
          const uniqueBoxTotals = [...new Set(boxTotals)];
          if (uniqueBoxTotals.length === 1) {
            setPriceMode('per_box');
            setPriceText(formatPriceForInput(uniqueBoxTotals[0]));
          } else {
            setPriceMode('per_pair');
            setPriceText('');
          }
        }
      } else {
        if (isWeightItem) {
          setPriceMode('per_weight');
          setWeightUnit(savedUnit as 'kg' | '100g' | 'piece');
        } else {
          setPriceMode('per_pair');
        }
        setPriceText('');
      }

      // Устанавливаем рекомендуемую цену
      if (allRecommendedPrices.length > 0) {
        const uniqueRecommendedPrices = [...new Set(allRecommendedPrices)];
        if (uniqueRecommendedPrices.length === 1) {
          setRecommendedPriceText(formatPriceForInput(uniqueRecommendedPrices[0]));
        } else {
          setRecommendedPriceText('');
        }
      } else {
        setRecommendedPriceText('');
      }
    }
  }, [isEditing]);

  useEffect(() => {
    if (isEditing) {
      setBoxSizeQuantities(prev => {
        const currentLength = prev.length;
        if (editedNumberOfBoxes > currentLength) {
          const add = editedNumberOfBoxes - currentLength;
          const sizes = getSizesFromType(currentItem.sizeType || '');
          const newBoxes = Array(add).fill(null).map(() => sizes.map(s => ({ size: s, quantity: 0, price: 0, recommendedSellingPrice: 0 })));
          return [...prev, ...newBoxes];
        } else if (editedNumberOfBoxes < currentLength) {
          return prev.slice(0, editedNumberOfBoxes);
        }
        return prev;
      });
    }
  }, [editedNumberOfBoxes, isEditing]);

  const getCurrentQuantity = (boxIndex: number, size: number | string): number => {
    // Используем нестрогое сравнение для поддержки разных типов (number vs string)
    return boxSizeQuantities[boxIndex]?.find(item => String(item.size) === String(size))?.quantity || 0;
  };

  const pickImage = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissionResult.granted) {
        Alert.alert('Требуется разрешение', 'Пожалуйста, предоставьте разрешение для доступа к галерее');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1], // Квадратное соотношение для сохранения пропорций при сжатии
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
        setEditedImageUri(selectedImageUri);
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
            console.log(`Изображение сжато при обновлении: ${formatFileSize(compressedResult.originalSize)} → ${formatFileSize(compressedResult.compressedSize)}`);
            setEditedImageUri(compressedResult.uri);
          } catch (error) {
            console.error('Ошибка сжатия:', error);
            Alert.alert('Предупреждение', 'Не удалось сжать изображение. Будет использован оригинал.');
            setEditedImageUri(selectedImageUri);
          }
        },
        () => {
          // Пользователь отказался от сжатия
          setEditedImageUri(selectedImageUri);
        }
      );
    } catch (error) {
      console.error('Ошибка обработки изображения:', error);
      // В случае ошибки используем оригинал
      setEditedImageUri(selectedImageUri);
    }
  };

  const updateSizeQuantity = (boxIndex: number, size: number | string, change: number) => {
    setBoxSizeQuantities(prev =>
      prev.map((box, idx) =>
        idx === boxIndex
          ? box.map(item =>
            String(item.size) === String(size)
              ? { ...item, quantity: Math.max(0, item.quantity + change) }
              : item
          )
          : box
      )
    );
  };

  // Установка цены для конкретного размера в режиме "разная цена для размеров"
  const updateSizePrice = (
    boxIndex: number,
    size: number | string,
    field: 'price' | 'recommendedSellingPrice',
    value: number,
  ) => {
    setBoxSizeQuantities(prev =>
      prev.map((box, idx) =>
        idx === boxIndex
          ? box.map(item =>
            String(item.size) === String(size)
              ? { ...item, [field]: Math.max(0, value) }
              : item,
          )
          : box,
      ),
    );
  };

  // Helper function to check if quantity changes are only additions (no decreases)
  // Returns true if all size quantities are either the same or increased (never decreased)
  const isOnlyAddingQuantity = (oldBoxes: SizeQuantity[][], newBoxes: SizeQuantity[][]): boolean => {
    // Parse old quantities from currentItem
    let oldParsed: SizeQuantity[][] = [];
    try {
      oldParsed = JSON.parse(currentItem.boxSizeQuantities || '[]');
    } catch {
      oldParsed = [];
    }

    // Check each box and size
    for (let boxIndex = 0; boxIndex < Math.max(oldParsed.length, newBoxes.length); boxIndex++) {
      const oldBox = oldParsed[boxIndex] || [];
      const newBox = newBoxes[boxIndex] || [];

      // Create a map of old quantities by size
      const oldQuantityMap = new Map<string, number>();
      for (const sq of oldBox) {
        oldQuantityMap.set(String(sq.size), sq.quantity || 0);
      }

      // Check each size in new box
      for (const newSq of newBox) {
        const sizeKey = String(newSq.size);
        const oldQty = oldQuantityMap.get(sizeKey) || 0;
        const newQty = newSq.quantity || 0;

        // If any quantity decreased, return false
        if (newQty < oldQty) {
          console.log(`📉 Quantity decreased for size ${sizeKey}: ${oldQty} -> ${newQty}`);
          return false;
        }
      }

      // Also check if any sizes were removed from new box that existed in old box
      for (const oldSq of oldBox) {
        const sizeKey = String(oldSq.size);
        const existsInNew = newBox.some(sq => String(sq.size) === sizeKey);
        if (!existsInNew && (oldSq.quantity || 0) > 0) {
          console.log(`📉 Size ${sizeKey} with quantity ${oldSq.quantity} was removed`);
          return false;
        }
      }
    }

    return true;
  };

  const handleSaveEdit = async () => {
    setIsLoading(true);
    try {
      // priceUnit вычисляется по текущему выбранному режиму редактирования.
      // Если режим — per_weight, сохраняем выбранную единицу веса (kg/100g/piece);
      // если коробка — 'box', иначе legacy 'pair'.
      const resolvedPriceUnit: PriceUnit =
        priceMode === 'per_box'
          ? 'box'
          : priceMode === 'per_weight'
            ? weightUnit
            : 'pair';

      const updatedBasic: Item = {
        ...currentItem,
        name: editedName,
        code: editedCode,
        warehouse: editedWarehouse,
        numberOfBoxes: editedNumberOfBoxes,
        row: editedRow,
        position: editedPosition,
        side: editedSide,
        imageUri: editedImageUri,
        priceUnit: resolvedPriceUnit,
      };

      let newBoxSizeQuantities = boxSizeQuantities.map(box => box.map(sq => ({ ...sq })));
      if (perSizePricing) {
        // В режиме "разная цена" значения уже в позициях — ничего не пересчитываем.
      } else if (priceValue > 0 || recommendedSellingPrice > 0) {
        newBoxSizeQuantities.forEach((box) => {
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
            if (priceValue > 0) item.price = pricePerPair;
            if (recommendedSellingPrice > 0) item.recommendedSellingPrice = recommendedPricePerPair;
          });
        });
      }

      const newTotalQuantity = newBoxSizeQuantities.reduce((total, box) => total + box.reduce((sum, sq) => sum + sq.quantity, 0), 0);
      const newTotalValue = newBoxSizeQuantities.reduce((total, box) => total + box.reduce((sum, sq) => sum + sq.quantity * sq.price, 0), 0);
      const newBoxJson = JSON.stringify(newBoxSizeQuantities);

      // Для ассистентов - проверяем тип изменений
      if (isAssistant()) {
        // Проверяем подключение к интернету
        const netState = await NetInfo.fetch();
        if (!netState.isConnected) {
          Alert.alert('Нет подключения', 'Это действие требует подключения к интернету.');
          return;
        }

        // Проверяем, что товар синхронизирован с сервером
        if (!currentItem.serverId) {
          Alert.alert('Ошибка', 'Товар еще не синхронизирован с сервером. Пожалуйста, дождитесь синхронизации.');
          return;
        }

        // Проверяем, изменилось ли изображение
        const imageChanged = editedImageUri !== currentItem.imageUri;
        let newImageUrl: string | null = currentItem.serverImageUrl || null;

        // Проверяем, изменились ли только количества (добавление товара)
        const onlyAddingQuantities = isOnlyAddingQuantity([], newBoxSizeQuantities);

        // Проверяем, изменились ли другие поля (кроме количеств)
        const otherFieldsChanged =
          editedName !== currentItem.name ||
          editedCode !== currentItem.code ||
          editedWarehouse !== currentItem.warehouse ||
          editedNumberOfBoxes !== currentItem.numberOfBoxes ||
          editedRow !== (currentItem.row || '') ||
          editedPosition !== (currentItem.position || '') ||
          editedSide !== (currentItem.side || '') ||
          imageChanged;

        console.log(`📊 Assistant edit analysis: onlyAddingQuantities=${onlyAddingQuantities}, otherFieldsChanged=${otherFieldsChanged}`);

        // Если только добавляем количества и ничего другого не меняем - обновляем напрямую без одобрения
        if (onlyAddingQuantities && !otherFieldsChanged) {
          console.log('✅ Only adding quantities - updating directly without approval');

          // Если изображение не изменилось, используем существующий URL
          if (imageChanged && editedImageUri) {
            try {
              const accessToken = await AuthService.getAccessToken();
              if (!accessToken) {
                Alert.alert('Ошибка', 'Не удалось получить токен авторизации');
                return;
              }
              newImageUrl = await ImageService.uploadImage(editedImageUri, accessToken);
              console.log('📸 Image uploaded:', newImageUrl);
            } catch (error) {
              console.error('❌ Failed to upload image:', error);
              Alert.alert('Ошибка', 'Не удалось загрузить изображение на сервер');
              return;
            }
          }

          // Обновляем товар напрямую (как админ)
          await updateItem(updatedBasic as Item);
          await updateItemQuantity(currentItem.id, newBoxJson, newTotalQuantity, newTotalValue);

          let finalItem: Item = {
            ...updatedBasic,
            boxSizeQuantities: newBoxJson,
            totalQuantity: newTotalQuantity,
            totalValue: newTotalValue,
          } as Item;

          // Перегенерируем QR-коды если они есть
          if (currentItem.qrCodeType && currentItem.qrCodeType !== 'none') {
            console.log('🔄 Regenerating QR codes after edit...');
            const qrCodes = createQRCodesForItem(
              currentItem.id,
              updatedBasic.name,
              updatedBasic.code,
              currentItem.uuid,
              currentItem.qrCodeType,
              updatedBasic.numberOfBoxes || 1,
              newBoxJson
            );
            const qrCodesString = JSON.stringify(qrCodes);
            await updateItemQRCodes(currentItem.id, currentItem.qrCodeType, qrCodesString);
            finalItem.qrCodes = qrCodesString;
          }

          setCurrentItem(finalItem);
          setBoxSizeQuantities(newBoxSizeQuantities);
          onItemUpdated(finalItem);
          setIsEditing(false);
          Alert.alert('Успех', 'Товар успешно обновлен (добавление количества не требует подтверждения)');
          return;
        }

        // Иначе - отправляем заявку на изменение администратору
        console.log('📝 Other changes detected - sending approval request');

        // Если изображение изменилось, загружаем его на сервер
        if (imageChanged && editedImageUri) {
          try {
            const accessToken = await AuthService.getAccessToken();
            if (!accessToken) {
              Alert.alert('Ошибка', 'Не удалось получить токен авторизации');
              return;
            }
            newImageUrl = await ImageService.uploadImage(editedImageUri, accessToken);
            console.log('📸 Image uploaded for update request:', newImageUrl);
          } catch (error) {
            console.error('❌ Failed to upload image:', error);
            Alert.alert('Ошибка', 'Не удалось загрузить изображение на сервер');
            return;
          }
        } else if (imageChanged && !editedImageUri) {
          // Изображение было удалено
          newImageUrl = null;
        }

        const oldData = {
          id: currentItem.id,
          name: currentItem.name,
          code: currentItem.code,
          warehouse: currentItem.warehouse,
          numberOfBoxes: currentItem.numberOfBoxes,
          row: currentItem.row,
          position: currentItem.position,
          side: currentItem.side,
          boxSizeQuantities: currentItem.boxSizeQuantities,
          totalQuantity: currentItem.totalQuantity,
          totalValue: currentItem.totalValue,
          imageUrl: currentItem.serverImageUrl || null,
        };

        const newData = {
          id: currentItem.id,
          name: editedName,
          code: editedCode,
          warehouse: editedWarehouse,
          numberOfBoxes: editedNumberOfBoxes,
          row: editedRow,
          position: editedPosition,
          side: editedSide,
          boxSizeQuantities: newBoxJson,
          totalQuantity: newTotalQuantity,
          totalValue: newTotalValue,
          imageUrl: newImageUrl,
        };

        await SyncService.requestApproval(
          'UPDATE_ITEM',
          currentItem.serverId,
          oldData,
          newData,
          'Запрос на изменение товара'
        );

        setIsEditing(false);
        Alert.alert('Успех', 'Заявка на изменение отправлена администратору');
        return;
      }

      // Для админов - прямое изменение
      await updateItem(updatedBasic);
      await updateItemQuantity(currentItem.id, newBoxJson, newTotalQuantity, newTotalValue);

      let finalItem: Item = {
        ...updatedBasic,
        boxSizeQuantities: newBoxJson,
        totalQuantity: newTotalQuantity,
        totalValue: newTotalValue,
      };

      // Перегенерируем QR-коды если они есть
      if (currentItem.qrCodeType && currentItem.qrCodeType !== 'none') {
        console.log('🔄 Regenerating QR codes after edit...');
        const qrCodes = createQRCodesForItem(
          currentItem.id,
          updatedBasic.name,
          updatedBasic.code,
          currentItem.uuid,
          currentItem.qrCodeType,
          updatedBasic.numberOfBoxes || 1,
          newBoxJson
        );
        const qrCodesString = JSON.stringify(qrCodes);
        await updateItemQRCodes(currentItem.id, currentItem.qrCodeType, qrCodesString);
        finalItem.qrCodes = qrCodesString;
      }

      // Сохраняем доп. параметры товара
      if (currentItem.uuid) {
        try {
          const filledAttrs = extraAttributes.filter((a) => a.name.trim() && a.value.trim());
          await replaceAttributesForItem(
            currentItem.uuid,
            filledAttrs.map((a, i) => ({
              itemUuid: currentItem.uuid as string,
              name: a.name.trim(),
              value: a.value.trim(),
              attrType: a.attrType,
              unit: a.unit ?? null,
              sortOrder: i,
            })),
          );
          setSavedAttributes(filledAttrs);
        } catch (e) {
          console.warn('Failed to save item attributes:', e);
        }
      }

      setCurrentItem(finalItem);
      setBoxSizeQuantities(newBoxSizeQuantities);
      onItemUpdated(finalItem);
      setIsEditing(false);
      Alert.alert('Успех', 'Данные товара успешно обновлены');
    } catch (error: any) {
      console.error('Error updating item:', error);
      const message = error.response?.data?.message || error.message || 'Ошибка';
      Alert.alert('Ошибка', `Не удалось обновить данные товара: ${message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelEdit = () => {
    setEditedName(currentItem.name);
    setEditedCode(currentItem.code);
    setEditedWarehouse(currentItem.warehouse);
    setEditedRow(currentItem.row || '');
    setEditedPosition(currentItem.position || '');
    setEditedSide(currentItem.side || '');
    setEditedImageUri(currentItem.imageUri);
    setEditedNumberOfBoxes(currentItem.numberOfBoxes);
    try {
      const parsedBoxes = JSON.parse(currentItem.boxSizeQuantities || '[]');
      setBoxSizeQuantities(parsedBoxes);
    } catch (error) {
      console.error('Error parsing box sizes on cancel:', error);
      setBoxSizeQuantities([]);
    }
    setExtraAttributes(savedAttributes);
    setIsEditing(false);
  };

  const handleSellItem = (boxIndex: number, size: number | string) => {
    // Кнопка уже показывается только при qty > 0, так что сразу открываем модалку
    setCurrentBoxIndex(boxIndex);
    setCurrentSize(size);
    setSalePrice('');
    setShowSaleModal(true);
    console.log('🛒 Opening sale modal for box:', boxIndex, 'size:', size);
  };

  const handleConfirmSale = async () => {
    const parsedSalePrice = parseFloat(salePrice);
    if (isNaN(parsedSalePrice) || parsedSalePrice <= 0) {
      Alert.alert('Ошибка', 'Введите корректную цену продажи');
      return;
    }

    const costPrice = boxSizeQuantities[currentBoxIndex]?.find(item => String(item.size) === String(currentSize))?.price || 0;
    const recommendedPrice = boxSizeQuantities[currentBoxIndex]?.find(item => String(item.size) === String(currentSize))?.recommendedSellingPrice || 0;
    const profit = parsedSalePrice - costPrice;

    setIsLoading(true);
    try {
      // Compute new box sizes
      const newBoxSizeQuantities = boxSizeQuantities.map((box, idx) =>
        idx === currentBoxIndex
          ? box.map(item =>
            String(item.size) === String(currentSize)
              ? { ...item, quantity: Math.max(0, item.quantity - 1) }
              : item
          )
          : box
      );

      setBoxSizeQuantities(newBoxSizeQuantities);

      // Log the sale transaction with box index for proper return
      await addTransaction({
        action: 'update',
        itemId: currentItem.id,
        itemName: currentItem.name,
        itemImageUri: currentItem.imageUri, // сохраняем картинку для офлайн отображения
        timestamp: Math.floor(Date.now() / 1000),
        details: JSON.stringify({
          type: 'sale',
          itemType: currentItem.itemType,
          sale: {
            size: currentSize,
            quantity: 1,
            costPrice,
            salePrice: parsedSalePrice,
            recommendedSellingPrice: recommendedPrice,
            previousQuantity: getCurrentQuantity(currentBoxIndex, currentSize),
            profit,
            boxIndex: currentBoxIndex // Добавляем информацию о коробке для правильного возврата
          }
        })
      });

      // Compute new totals
      const newTotalQuantity = newBoxSizeQuantities.reduce((total, box) => {
        return total + box.reduce((sum, item) => sum + item.quantity, 0);
      }, 0);

      const newTotalValue = newBoxSizeQuantities.reduce((total, box) => {
        return total + box.reduce((sum, item) => sum + (item.quantity * item.price), 0);
      }, 0);

      // Update the item quantity in DB
      await updateItemQuantity(
        currentItem.id,
        JSON.stringify(newBoxSizeQuantities),
        newTotalQuantity,
        newTotalValue
      );

      let finalItem: Item = {
        ...currentItem,
        boxSizeQuantities: JSON.stringify(newBoxSizeQuantities),
        totalQuantity: newTotalQuantity,
        totalValue: newTotalValue
      };

      // Перегенерируем QR-коды если они есть
      if (currentItem.qrCodeType && currentItem.qrCodeType !== 'none') {
        const qrCodes = createQRCodesForItem(
          currentItem.id,
          currentItem.name,
          currentItem.code,
          currentItem.uuid,
          currentItem.qrCodeType,
          currentItem.numberOfBoxes || 1,
          JSON.stringify(newBoxSizeQuantities)
        );
        const qrCodesString = JSON.stringify(qrCodes);
        await updateItemQRCodes(currentItem.id, currentItem.qrCodeType, qrCodesString);
        finalItem.qrCodes = qrCodesString;
      }

      setCurrentItem(finalItem);
      onItemUpdated(finalItem);

      // Обновляем корзину - синхронизируем с актуальным складом
      validateCartForItem(currentItem.id, newBoxSizeQuantities);

      setShowSaleModal(false);
      if (isAdmin()) {
        Alert.alert('Успех', `Продано 1 шт. за ${parsedSalePrice} ${currencyShort}. Прибыль: ${profit.toFixed(2)} ${currencyShort}`);
      } else {
        Alert.alert('Успех', `Продано 1 шт. за ${parsedSalePrice} ${currencyShort}`);
      }
    } catch (error) {
      console.error('Error confirming sale:', error);
      Alert.alert('Ошибка', 'Не удалось подтвердить продажу');
    } finally {
      setIsLoading(false);
    }
  };

  const handleWholesale = () => {
    // Инициализируем выбранные коробки пустыми значениями
    const initialBoxes = boxSizeQuantities.map((_, index) => ({
      boxIndex: index,
      price: '',
      selected: false
    }));
    setSelectedBoxes(initialBoxes);
    setShowWholesaleModal(true);
  };

  const handleConfirmWholesale = async () => {
    // Проверяем, есть ли выбранные коробки с ценами
    const validSelectedBoxes = selectedBoxes.filter(sb =>
      sb.selected && sb.price !== '' && !isNaN(parseFloat(sb.price)) && parseFloat(sb.price) > 0
    );

    if (validSelectedBoxes.length === 0) {
      Alert.alert('Ошибка', 'Выберите хотя бы одну коробку и укажите цену');
      return;
    }

    setIsLoading(true);
    try {
      // Рассчитываем новые boxSizeQuantities после удаления проданных коробок
      const newBoxSizeQuantities = boxSizeQuantities.map((box, boxIndex) => {
        const isBoxSold = validSelectedBoxes.some(sb => sb.boxIndex === boxIndex);
        if (isBoxSold) {
          // Обнуляем количество для всех размеров в проданной коробке
          return box.map(item => ({ ...item, quantity: 0 }));
        }
        return box; // Коробка не продана, оставляем как есть
      });

      setBoxSizeQuantities(newBoxSizeQuantities);

      // Подготавливаем данные для транзакции
      const wholesaleBoxes = validSelectedBoxes.map(sb => {
        const box = boxSizeQuantities[sb.boxIndex];
        const boxTotalQuantity = box.reduce((sum, item) => sum + getCurrentQuantity(sb.boxIndex, item.size), 0);
        const boxTotalValue = box.reduce((sum, item) => sum + (getCurrentQuantity(sb.boxIndex, item.size) * item.price), 0);
        const salePrice = parseFloat(sb.price);
        const profit = salePrice - boxTotalValue;

        return {
          boxIndex: sb.boxIndex,
          quantity: boxTotalQuantity,
          costPrice: boxTotalValue,
          salePrice: salePrice,
          profit: profit,
          sizes: box.map(item => ({
            size: item.size,
            quantity: getCurrentQuantity(sb.boxIndex, item.size),
            price: item.price
          })).filter(s => s.quantity > 0)
        };
      });

      // Логируем транзакцию оптовой продажи
      await addTransaction({
        action: 'wholesale',
        itemId: currentItem.id,
        itemName: currentItem.name,
        itemImageUri: currentItem.imageUri, // сохраняем картинку для офлайн отображения
        timestamp: Math.floor(Date.now() / 1000),
        details: JSON.stringify({
          type: 'wholesale',
          itemType: currentItem.itemType,
          wholesale: {
            boxes: wholesaleBoxes,
            totalBoxes: wholesaleBoxes.length,
            totalQuantity: wholesaleBoxes.reduce((sum, box) => sum + box.quantity, 0),
            totalCostPrice: wholesaleBoxes.reduce((sum, box) => sum + box.costPrice, 0),
            totalSalePrice: wholesaleBoxes.reduce((sum, box) => sum + box.salePrice, 0),
            totalProfit: wholesaleBoxes.reduce((sum, box) => sum + box.profit, 0)
          }
        })
      });

      // Пересчитываем общие показатели
      const newTotalQuantity = newBoxSizeQuantities.reduce((total, box) => {
        return total + box.reduce((sum, item) => sum + item.quantity, 0);
      }, 0);

      const newTotalValue = newBoxSizeQuantities.reduce((total, box) => {
        return total + box.reduce((sum, item) => sum + (item.quantity * item.price), 0);
      }, 0);

      // Обновляем количество товара в БД
      await updateItemQuantity(
        currentItem.id,
        JSON.stringify(newBoxSizeQuantities),
        newTotalQuantity,
        newTotalValue
      );

      let finalItem: Item = {
        ...currentItem,
        boxSizeQuantities: JSON.stringify(newBoxSizeQuantities),
        totalQuantity: newTotalQuantity,
        totalValue: newTotalValue
      };

      // Перегенерируем QR-коды если они есть
      if (currentItem.qrCodeType && currentItem.qrCodeType !== 'none') {
        const qrCodes = createQRCodesForItem(
          currentItem.id,
          currentItem.name,
          currentItem.code,
          currentItem.uuid,
          currentItem.qrCodeType,
          currentItem.numberOfBoxes || 1,
          JSON.stringify(newBoxSizeQuantities)
        );
        const qrCodesString = JSON.stringify(qrCodes);
        await updateItemQRCodes(currentItem.id, currentItem.qrCodeType, qrCodesString);
        finalItem.qrCodes = qrCodesString;
      }

      setCurrentItem(finalItem);
      onItemUpdated(finalItem);

      // Обновляем корзину - удаляем проданные товары
      validateCartForItem(currentItem.id, newBoxSizeQuantities);

      setShowWholesaleModal(false);
      setSelectedBoxes([]);

      const totalSalePrice = wholesaleBoxes.reduce((sum, box) => sum + box.salePrice, 0);
      const totalProfit = wholesaleBoxes.reduce((sum, box) => sum + box.profit, 0);
      if (isAdmin()) {
        Alert.alert('Успех', `Продано ${wholesaleBoxes.length} коробок за ${totalSalePrice.toFixed(2)} ${currencyShort}. Прибыль: ${totalProfit.toFixed(2)} ${currencyShort}`);
      } else {
        Alert.alert('Успех', `Продано ${wholesaleBoxes.length} коробок за ${totalSalePrice.toFixed(2)} ${currencyShort}`);
      }
    } catch (error) {
      console.error('Error confirming wholesale:', error);
      Alert.alert('Ошибка', 'Не удалось подтвердить оптовую продажу');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteItem = async () => {
    setShowMenu(false);
    console.log('Attempting to delete with id:', currentItem.id);
    if (!currentItem.id) {
      Alert.alert('Ошибка', 'ID товара отсутствует');
      return;
    }

    // Для ассистентов - отправляем заявку на удаление
    if (isAssistant()) {
      Alert.alert(
        'Запрос на удаление',
        `Отправить заявку на удаление товара "${currentItem.name}" администратору?`,
        [
          { text: 'Отмена', style: 'cancel' },
          {
            text: 'Отправить',
            onPress: async () => {
              setIsLoading(true);
              try {
                // Проверяем подключение к интернету
                const netState = await NetInfo.fetch();
                if (!netState.isConnected) {
                  Alert.alert('Нет подключения', 'Это действие требует подключения к интернету.');
                  setIsLoading(false);
                  return;
                }

                // Проверяем, что товар синхронизирован с сервером
                if (!currentItem.serverId) {
                  Alert.alert('Ошибка', 'Товар еще не синхронизирован с сервером. Пожалуйста, дождитесь синхронизации.');
                  setIsLoading(false);
                  return;
                }

                const oldData = {
                  id: currentItem.id,
                  serverId: currentItem.serverId,
                  name: currentItem.name,
                  code: currentItem.code,
                  warehouse: currentItem.warehouse,
                  totalQuantity: currentItem.totalQuantity,
                };
                await SyncService.requestApproval(
                  'DELETE_ITEM',
                  currentItem.serverId,
                  oldData,
                  {}, // newData пустое для удаления
                  'Запрос на удаление товара'
                );
                Alert.alert('Успех', 'Заявка на удаление отправлена администратору');
                onClose();
              } catch (error: any) {
                console.error('Error requesting delete approval:', error);
                const message = error.response?.data?.message || error.message || 'Ошибка';
                Alert.alert('Ошибка', `Не удалось отправить заявку: ${message}`);
              } finally {
                setIsLoading(false);
              }
            },
          },
        ]
      );
      return;
    }

    // Для админов - прямое удаление
    Alert.alert(
      'Удаление товара',
      `Вы уверены, что хотите удалить товар "${currentItem.name}"?`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            setIsLoading(true);
            try {
              await deleteItem(currentItem.id);
              onItemDeleted(currentItem.id);
              onClose();
              Alert.alert('Успех', 'Товар успешно удален');
            } catch (error) {
              console.error('Error deleting item:', error);
              Alert.alert('Ошибка', 'Не удалось удалить товар');
            } finally {
              setIsLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleEditItem = () => {
    setShowMenu(false);
    setIsEditing(true);
  };

  const handleCreateQR = async (qrCodeType: string, qrCodes: string) => {
    try {
      await updateItemQRCodes(currentItem.id, qrCodeType, qrCodes);
      const updatedItem = { ...currentItem, qrCodeType: qrCodeType as any, qrCodes };
      setCurrentItem(updatedItem);
      onItemUpdated(updatedItem);
    } catch (error) {
      console.error('Error creating QR codes:', error);
      throw error;
    }
  };

  return (
    <>
      <Modal
        animationType="slide"
        transparent={false}
        visible={visible}
        onRequestClose={onClose}
        presentationStyle="fullScreen"
        statusBarTranslucent={true}
      >
        <View style={{ flex: 1, backgroundColor: colors.background.screen }}>
          {/* Toast inside Modal */}
          <Toast
            visible={toastVisible}
            message={toastMessage}
            type={toastType}
            onHide={() => setToastVisible(false)}
          />

          {/* Header */}
          <View style={{
            backgroundColor: isDark ? colors.background.card : '#fff',
            paddingTop: Platform.OS === 'ios' ? 54 : 44,
            paddingBottom: 16,
            paddingHorizontal: 16,
            borderBottomWidth: 1,
            borderBottomColor: colors.border.normal,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <TouchableOpacity
                onPress={isEditing ? handleCancelEdit : onClose}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <Ionicons name={isEditing ? "close" : "arrow-back"} size={24} color={colors.text.normal} />
              </TouchableOpacity>

              <Text style={{
                flex: 1,
                marginHorizontal: 12,
                fontSize: 17,
                fontWeight: '600',
                color: colors.text.normal,
              }} numberOfLines={1}>
                {isEditing ? 'Редактирование' : currentItem.name}
              </Text>

              {isEditing ? (
                <TouchableOpacity
                  onPress={handleSaveEdit}
                  disabled={isLoading}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    borderRadius: 8,
                    backgroundColor: isDark ? colors.primary.gold : '#22c55e',
                    opacity: isLoading ? 0.5 : 1,
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '600' }}>{isLoading ? 'Сохранение...' : 'Сохранить'}</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {/* Кнопка корзины */}
                  {isAssistant() && (
                    <TouchableOpacity
                      onPress={() => {
                        onClose();
                        setTimeout(() => navigation.navigate('Cart'), 100);
                      }}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 12,
                        backgroundColor: isDark ? 'rgba(212, 175, 55, 0.15)' : 'rgba(34, 197, 94, 0.1)',
                        justifyContent: 'center',
                        alignItems: 'center',
                        position: 'relative',
                      }}
                    >
                      <Ionicons name="cart" size={22} color={isDark ? colors.primary.gold : '#22c55e'} />
                      {cartItems.length > 0 && (
                        <View style={{
                          position: 'absolute',
                          top: -4,
                          right: -4,
                          backgroundColor: '#ef4444',
                          borderRadius: 10,
                          minWidth: 18,
                          height: 18,
                          justifyContent: 'center',
                          alignItems: 'center',
                          paddingHorizontal: 4,
                        }}>
                          <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>
                            {cartItems.reduce((sum, item) => sum + item.quantity, 0)}
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  )}

                  {/* Меню - только для ассистента */}
                  {isAssistant() && (
                    <TouchableOpacity
                      onPress={() => setShowMenu(!showMenu)}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 12,
                        backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <Ionicons name="ellipsis-vertical" size={20} color={colors.text.normal} />
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>

            {showMenu && (
              <View style={{
                position: 'absolute',
                right: 16,
                top: Platform.OS === 'ios' ? 100 : 90,
                backgroundColor: colors.background.screen,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border.normal,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.2,
                shadowRadius: 8,
                elevation: 8,
                zIndex: 100,
                minWidth: 150,
              }}>
                <TouchableOpacity
                  onPress={() => {
                    setShowMenu(false);
                    onClose();
                    setTimeout(() => navigation.navigate('Profile', { screen: 'Receipt', params: { itemUuid: currentItem.uuid } }), 100);
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border.light,
                  }}
                >
                  <Ionicons name="archive-outline" size={18} color={isDark ? colors.primary.gold : '#10b981'} style={{ marginRight: 10 }} />
                  <Text style={{ color: colors.text.normal, fontWeight: '500' }}>Приход</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleEditItem}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border.light,
                  }}
                >
                  <Ionicons name="pencil-outline" size={18} color={isDark ? colors.primary.gold : '#4B5563'} style={{ marginRight: 10 }} />
                  <Text style={{ color: colors.text.normal, fontWeight: '500' }}>Изменить</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleDeleteItem}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                  }}
                >
                  <Ionicons name="trash-outline" size={18} color="#ef4444" style={{ marginRight: 10 }} />
                  <Text style={{ color: '#ef4444', fontWeight: '500' }}>Удалить</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, paddingBottom: isAssistant() && !isEditing ? 140 : 40 }}
            showsVerticalScrollIndicator={false}
          >
            {isEditing ? (
              <>
                <View className="mb-4">
                  <Text style={{ color: colors.text.muted }} className="text-xs mb-1">Название товара</Text>
                  <TextInput
                    style={{ color: colors.text.normal, borderColor: colors.border.normal, backgroundColor: colors.background.card }}
                    className="text-lg font-bold border p-3 rounded-lg"
                    value={editedName}
                    onChangeText={setEditedName}
                    placeholder="Введите название товара"
                    placeholderTextColor={colors.text.muted}
                  />
                </View>
                <View className="mb-3">
                  <Text style={{ color: colors.text.normal }} className="font-semibold">Основная информация</Text>
                  <View style={{ backgroundColor: colors.background.card }} className="p-3 rounded-lg mt-1">
                    <View className="mb-2">
                      <Text style={{ color: colors.text.muted }} className="text-xs mb-1">Код товара</Text>
                      <TextInput
                        style={{ borderColor: colors.border.normal, backgroundColor: colors.background.screen, color: colors.text.normal }}
                        className="border p-2 rounded"
                        value={editedCode}
                        onChangeText={setEditedCode}
                        placeholder="Введите код товара"
                        placeholderTextColor={colors.text.muted}
                      />
                    </View>
                    <View className="mb-2">
                      <Text style={{ color: colors.text.muted }} className="text-xs mb-1">Склад</Text>
                      <TextInput
                        style={{ borderColor: colors.border.normal, backgroundColor: colors.background.screen, color: colors.text.normal }}
                        className="border p-2 rounded"
                        value={editedWarehouse}
                        onChangeText={setEditedWarehouse}
                        placeholder="Введите название склада"
                        placeholderTextColor={colors.text.muted}
                      />
                    </View>
                    <Text style={{ color: colors.text.muted }} className="mb-1">Тип размера: {currentItem.sizeType || 'не указан'}</Text>
                    <View className="mb-2">
                      <Text style={{ color: colors.text.muted }} className="text-xs mb-1">Количество коробок</Text>
                      <View style={{ borderColor: colors.border.normal, backgroundColor: colors.background.card }} className="border rounded-lg">
                        <Picker
                          selectedValue={editedNumberOfBoxes}
                          onValueChange={setEditedNumberOfBoxes}
                          mode="dropdown"
                          style={{ color: colors.text.normal, backgroundColor: colors.background.card }}
                          dropdownIconColor={colors.text.normal}
                          itemStyle={{ color: colors.text.normal, backgroundColor: colors.background.card }}
                        >
                          {Array.from({ length: 20 }, (_, i) => i + 1).map(num => (
                            <Picker.Item
                              key={num}
                              label={num.toString()}
                              value={num}
                              color={colors.text.normal}
                              style={{ backgroundColor: colors.background.card, color: colors.text.normal }}
                            />
                          ))}
                        </Picker>
                      </View>
                    </View>
                    <Text style={{ color: colors.text.muted }} className="mb-1">Всего товаров: {boxSizeQuantities.reduce((total, box) => total + box.reduce((sum, sq) => sum + (sq.quantity || 0), 0), 0)}</Text>
                  </View>
                </View>

                <View className="mb-3">
                  <Text style={{ color: colors.text.normal }} className="font-semibold">Цена</Text>
                  <View style={{ backgroundColor: colors.background.card }} className="p-3 rounded-lg mt-1">
                    {/* Тумблер: разная цена для размеров */}
                    <View style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingVertical: 8,
                      paddingHorizontal: 4,
                      marginBottom: 8,
                      borderBottomWidth: 1,
                      borderBottomColor: colors.border.light,
                    }}>
                      <View style={{ flex: 1, marginRight: 12 }}>
                        <Text style={{ color: colors.text.normal, fontWeight: '600', fontSize: 13 }}>
                          Разная цена для размеров
                        </Text>
                        <Text style={{ color: colors.text.muted, fontSize: 11, marginTop: 2 }}>
                          {perSizePricing
                            ? 'Цена задаётся для каждого размера ниже'
                            : 'Одна цена для всех размеров'}
                        </Text>
                      </View>
                      <Switch
                        value={perSizePricing}
                        onValueChange={setPerSizePricing}
                        disabled={isLoading}
                        trackColor={{ false: '#767577', true: isDark ? colors.primary.gold : defaultColors.primary.blue }}
                        thumbColor="#fff"
                      />
                    </View>

                    {!perSizePricing && (
                      <>
                        <View className="mb-2">
                          <Text style={{ color: colors.text.muted }} className="text-xs mb-1">Тип цены</Text>
                          <View style={{ borderColor: colors.border.normal, backgroundColor: colors.background.card }} className="border rounded-lg">
                            <Picker
                              selectedValue={priceMode}
                              onValueChange={(itemValue: 'per_pair' | 'per_box' | 'per_weight') => setPriceMode(itemValue)}
                              mode="dropdown"
                              style={{ color: colors.text.normal, backgroundColor: colors.background.card }}
                              dropdownIconColor={colors.text.normal}
                              itemStyle={{ color: colors.text.normal, backgroundColor: colors.background.card }}
                            >
                              <Picker.Item label="За штуку" value="per_pair" color={colors.text.normal} style={{ backgroundColor: colors.background.card, color: colors.text.normal }} />
                              <Picker.Item label="За коробку" value="per_box" color={colors.text.normal} style={{ backgroundColor: colors.background.card, color: colors.text.normal }} />
                              <Picker.Item label="На вес" value="per_weight" color={colors.text.normal} style={{ backgroundColor: colors.background.card, color: colors.text.normal }} />
                            </Picker>
                          </View>
                        </View>
                        {priceMode === 'per_weight' && (
                          <View className="mb-2">
                            <Text style={{ color: colors.text.muted }} className="text-xs mb-1">Цена за</Text>
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                              {(['kg', '100g', 'piece'] as const).map((u) => {
                                const selected = weightUnit === u;
                                const label = u === 'kg' ? '1 кг' : u === '100g' ? '100 г' : 'штуку';
                                return (
                                  <TouchableOpacity
                                    key={u}
                                    style={{
                                      flex: 1,
                                      paddingVertical: 8,
                                      paddingHorizontal: 4,
                                      borderRadius: 8,
                                      backgroundColor: selected ? (isDark ? 'rgba(212, 175, 55, 0.2)' : 'rgba(42, 171, 238, 0.12)') : colors.background.card,
                                      borderWidth: 1,
                                      borderColor: selected ? (isDark ? colors.primary.gold : defaultColors.primary.blue) : colors.border.normal,
                                      alignItems: 'center',
                                    }}
                                    onPress={() => setWeightUnit(u)}
                                  >
                                    <Text style={{ fontSize: 12, fontWeight: '600', color: selected ? (isDark ? colors.primary.gold : defaultColors.primary.blue) : colors.text.muted }}>
                                      {label}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          </View>
                        )}
                        <View className="mb-2">
                          <Text style={{ color: colors.text.muted }} className="text-xs mb-1">
                            {priceMode === 'per_box'
                              ? `Новая цена закупки за коробку (${currencyShort})`
                              : priceMode === 'per_weight'
                                ? `Цена за ${priceUnitLabel(weightUnit)} (${currencyShort})`
                                : `Новая цена закупки (${currencyShort})`}
                          </Text>
                          <TextInput
                            style={{ borderColor: colors.border.normal, backgroundColor: colors.background.screen, color: colors.text.normal }}
                            className="border p-2 rounded"
                            value={priceText}
                            onChangeText={(text) => setPriceText(sanitizePriceText(text))}
                            keyboardType="decimal-pad"
                            placeholder="0 (не изменять)"
                            placeholderTextColor={colors.text.muted}
                          />
                        </View>
                        <View className="mb-2">
                          <Text style={{ color: colors.text.muted }} className="text-xs mb-1">
                            {priceMode === 'per_box'
                              ? `Рекомендуемая цена продажи за коробку (${currencyShort})`
                              : priceMode === 'per_weight'
                                ? `Рекомендуемая цена продажи за ${priceUnitLabel(weightUnit)} (${currencyShort})`
                                : `Рекомендуемая цена продажи (${currencyShort})`}
                          </Text>
                          <TextInput
                            style={{ borderColor: colors.border.normal, backgroundColor: colors.background.screen, color: colors.text.normal }}
                            className="border p-2 rounded"
                            value={recommendedPriceText}
                            onChangeText={(text) => setRecommendedPriceText(sanitizePriceText(text))}
                            keyboardType="decimal-pad"
                            placeholder="0 (не изменять)"
                            placeholderTextColor={colors.text.muted}
                          />
                        </View>
                      </>
                    )}
                    {perSizePricing && (
                      <Text style={{ color: colors.text.muted, fontSize: 12 }}>
                        Цены задаются отдельно для каждого размера в блоке "Размеры по коробкам" ниже.
                      </Text>
                    )}
                  </View>
                </View>

                <View className="mb-3">
                  <Text style={{ color: colors.text.normal }} className="font-semibold">Доп. параметры</Text>
                  <View style={{ backgroundColor: colors.background.card }} className="p-3 rounded-lg mt-1">
                    <ItemAttributesEditor
                      attributes={extraAttributes}
                      onChange={setExtraAttributes}
                      suggestions={suggestedAttributes}
                    />
                  </View>
                </View>

                <View className="mb-3">
                  <Text style={{ color: colors.text.normal }} className="font-semibold">Размеры по коробкам</Text>
                  <View style={{ backgroundColor: colors.background.card }} className="p-3 rounded-lg mt-1">
                    {boxSizeQuantities.map((box, boxIndex) => {
                      const totalInBox = box.reduce((sum, sq) => sum + (sq.quantity || 0), 0);
                      let displayPricePerPair = 0;
                      let displayRecommendedPricePerPair = 0;
                      let boxDisplayTotal = 0;
                      let boxDisplayRecommendedTotal = 0;

                      if (perSizePricing) {
                        // Каждый размер со своей ценой — суммируем
                        boxDisplayTotal = box.reduce((s, sq) => s + (sq.quantity || 0) * (sq.price || 0), 0);
                        boxDisplayRecommendedTotal = box.reduce((s, sq) => s + (sq.quantity || 0) * (sq.recommendedSellingPrice || 0), 0);
                      } else {
                        if (priceValue > 0 && totalInBox > 0) {
                          displayPricePerPair = priceMode === 'per_box' ? priceValue / totalInBox : priceValue;
                        } else {
                          displayPricePerPair = box[0]?.price || 0;
                        }
                        if (recommendedSellingPrice > 0 && totalInBox > 0) {
                          displayRecommendedPricePerPair = priceMode === 'per_box' ? recommendedSellingPrice / totalInBox : recommendedSellingPrice;
                        } else {
                          displayRecommendedPricePerPair = box[0]?.recommendedSellingPrice || 0;
                        }
                        boxDisplayTotal = totalInBox * displayPricePerPair;
                        boxDisplayRecommendedTotal = totalInBox * displayRecommendedPricePerPair;
                      }
                      // Защита от NaN
                      const safeBoxTotal = isNaN(boxDisplayTotal) ? 0 : boxDisplayTotal;
                      const safeBoxRecommendedTotal = isNaN(boxDisplayRecommendedTotal) ? 0 : boxDisplayRecommendedTotal;
                      const safePricePerPair = isNaN(displayPricePerPair) ? 0 : displayPricePerPair;
                      const safeRecommendedPricePerPair = isNaN(displayRecommendedPricePerPair) ? 0 : displayRecommendedPricePerPair;

                      return (
                        <View key={boxIndex} style={{ backgroundColor: colors.background.screen }} className="mb-4 p-3 rounded-lg">
                          <Text style={{ color: colors.text.normal }} className="font-bold mb-2">Коробка {boxIndex + 1}</Text>
                          {box.map((sizeQty, sizeIndex) => (
                            <View key={sizeIndex} style={{ backgroundColor: colors.background.card }} className="mb-3 p-2 rounded">
                              <View className="flex-row items-center justify-between mb-2">
                                <Text style={{ color: colors.text.normal }} className="font-medium">Размер {sizeQty.size}</Text>
                                <View className="flex-row items-center">
                                  <TouchableOpacity
                                    className="bg-red-400 w-8 h-8 rounded-full items-center justify-center"
                                    onPress={() => updateSizeQuantity(boxIndex, sizeQty.size, -1)}
                                    disabled={isLoading}
                                  >
                                    <Text className="text-white text-lg">-</Text>
                                  </TouchableOpacity>
                                  <Text style={{ color: colors.text.normal }} className="mx-3 font-bold">{sizeQty.quantity || 0}</Text>
                                  <TouchableOpacity
                                    style={{ backgroundColor: isDark ? colors.primary.gold : defaultColors.primary.blue }}
                                    className="w-8 h-8 rounded-full items-center justify-center"
                                    onPress={() => updateSizeQuantity(boxIndex, sizeQty.size, 1)}
                                    disabled={isLoading}
                                  >
                                    <Text className="text-white text-lg">+</Text>
                                  </TouchableOpacity>
                                </View>
                              </View>
                              {perSizePricing ? (
                                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                                  <View style={{ flex: 1 }}>
                                    <Text style={{ color: colors.text.muted, fontSize: 11, marginBottom: 4 }}>Цена закупки</Text>
                                    <TextInput
                                      style={{
                                        borderWidth: 1,
                                        borderColor: colors.border.normal,
                                        borderRadius: 8,
                                        paddingHorizontal: 8,
                                        paddingVertical: 6,
                                        fontSize: 13,
                                        color: colors.text.normal,
                                        backgroundColor: colors.background.screen,
                                      }}
                                      value={String(sizeQty.price || '')}
                                      onChangeText={(t) => updateSizePrice(boxIndex, sizeQty.size, 'price', parsePriceText(sanitizePriceText(t)))}
                                      keyboardType="decimal-pad"
                                      placeholder="0"
                                      placeholderTextColor={colors.text.muted}
                                      editable={!isLoading}
                                    />
                                  </View>
                                  <View style={{ flex: 1 }}>
                                    <Text style={{ color: colors.text.muted, fontSize: 11, marginBottom: 4 }}>Рек. цена</Text>
                                    <TextInput
                                      style={{
                                        borderWidth: 1,
                                        borderColor: colors.border.normal,
                                        borderRadius: 8,
                                        paddingHorizontal: 8,
                                        paddingVertical: 6,
                                        fontSize: 13,
                                        color: colors.text.normal,
                                        backgroundColor: colors.background.screen,
                                      }}
                                      value={String(sizeQty.recommendedSellingPrice || '')}
                                      onChangeText={(t) => updateSizePrice(boxIndex, sizeQty.size, 'recommendedSellingPrice', parsePriceText(sanitizePriceText(t)))}
                                      keyboardType="decimal-pad"
                                      placeholder="0"
                                      placeholderTextColor={colors.text.muted}
                                      editable={!isLoading}
                                    />
                                  </View>
                                </View>
                              ) : (
                                <>
                                  <Text style={{ color: colors.text.muted }} className="text-xs ml-4">Цена закупки: {safePricePerPair.toFixed(2)} {currencyShort}</Text>
                                  <Text style={{ color: colors.text.muted }} className="text-xs ml-4">Рекомендуемая цена: {safeRecommendedPricePerPair.toFixed(2)} {currencyShort}</Text>
                                </>
                              )}
                            </View>
                          ))}
                          <Text style={{ color: colors.text.normal }} className="font-medium mt-2">Стоимость закупки: {safeBoxTotal.toFixed(2)} {currencyShort}</Text>
                          <Text style={{ color: colors.text.normal }} className="font-medium mt-1">Рекомендуемая стоимость: {safeBoxRecommendedTotal.toFixed(2)} {currencyShort}</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>

                <View style={{ backgroundColor: isDark ? 'rgba(212, 175, 55, 0.15)' : 'rgba(59, 130, 246, 0.1)', borderColor: isDark ? colors.primary.gold : '#bfdbfe', borderWidth: 1 }} className="mt-2 p-2 rounded-lg mb-3">
                  <Text style={{ color: isDark ? colors.primary.gold : '#1e40af' }}>Всего коробок: <Text className="font-bold">{editedNumberOfBoxes}</Text></Text>
                  <Text style={{ color: isDark ? colors.primary.gold : '#1e40af' }}>Всего товаров: <Text className="font-bold">{boxSizeQuantities.reduce((total, box) => total + box.reduce((sum, sq) => sum + sq.quantity, 0), 0)}</Text></Text>
                  <Text style={{ color: isDark ? colors.primary.gold : '#1e40af' }}>Общая стоимость закупки: <Text className="font-bold">{
                    boxSizeQuantities.reduce((grandTotal, box) => {
                      if (perSizePricing) {
                        return grandTotal + box.reduce((s, sq) => s + (sq.quantity || 0) * (sq.price || 0), 0);
                      }
                      const totalInBox = box.reduce((sum, sq) => sum + sq.quantity, 0);
                      let displayPricePerPair = 0;
                      if (priceValue > 0 && totalInBox > 0) {
                        displayPricePerPair = priceMode === 'per_box' ? priceValue / totalInBox : priceValue;
                      } else {
                        displayPricePerPair = box[0]?.price || 0;
                      }
                      return grandTotal + totalInBox * displayPricePerPair;
                    }, 0).toFixed(2)
                  }</Text> {currencyShort}</Text>
                  <Text style={{ color: isDark ? colors.primary.gold : '#1e40af' }}>Общая рекомендуемая стоимость: <Text className="font-bold">{
                    boxSizeQuantities.reduce((grandTotal, box) => {
                      if (perSizePricing) {
                        return grandTotal + box.reduce((s, sq) => s + (sq.quantity || 0) * (sq.recommendedSellingPrice || 0), 0);
                      }
                      const totalInBox = box.reduce((sum, sq) => sum + sq.quantity, 0);
                      let displayRecommendedPricePerPair = 0;
                      if (recommendedSellingPrice > 0 && totalInBox > 0) {
                        displayRecommendedPricePerPair = priceMode === 'per_box' ? recommendedSellingPrice / totalInBox : recommendedSellingPrice;
                      } else {
                        displayRecommendedPricePerPair = box[0]?.recommendedSellingPrice || 0;
                      }
                      return grandTotal + totalInBox * displayRecommendedPricePerPair;
                    }, 0).toFixed(2)
                  }</Text> {currencyShort}</Text>
                </View>

                <View className="mb-3">
                  <Text style={{ color: colors.text.normal }} className="font-semibold">Дополнительная информация</Text>
                  <View style={{ backgroundColor: colors.background.card }} className="p-3 rounded-lg mt-1">
                    <View className="mb-2">
                      <Text style={{ color: colors.text.muted }} className="text-xs mb-1">Ряд</Text>
                      <TextInput
                        style={{ borderColor: colors.border.normal, backgroundColor: colors.background.screen, color: colors.text.normal }}
                        className="border p-2 rounded"
                        placeholderTextColor={colors.text.muted}
                        value={editedRow}
                        onChangeText={setEditedRow}
                        placeholder="Введите номер ряда"
                      />
                    </View>
                    <View className="mb-2">
                      <Text style={{ color: colors.text.muted }} className="text-xs mb-1">Позиция</Text>
                      <TextInput
                        style={{ borderColor: colors.border.normal, backgroundColor: colors.background.screen, color: colors.text.normal }}
                        className="border p-2 rounded"
                        placeholderTextColor={colors.text.muted}
                        value={editedPosition}
                        onChangeText={setEditedPosition}
                        placeholder="Введите позицию"
                      />
                    </View>
                    <View>
                      <Text className="text-gray-500 text-xs mb-1">Сторона</Text>
                      <TextInput
                        className="border border-gray-300 p-2 rounded"
                        value={editedSide}
                        onChangeText={setEditedSide}
                        placeholder="Введите сторону"
                      />
                    </View>
                  </View>
                </View>

                <View className="mb-3">
                  <Text style={{ color: colors.text.normal }} className="font-semibold">Изображение</Text>
                  <View style={{ backgroundColor: colors.background.card }} className="p-3 rounded-lg mt-1">
                    {editedImageUri && (
                      <Image
                        source={{ uri: editedImageUri }}
                        className="w-full h-48 rounded-lg mb-3"
                        resizeMode="cover"
                      />
                    )}
                    <TouchableOpacity
                      onPress={pickImage}
                      className="bg-blue-500 p-3 rounded-lg items-center"
                    >
                      <Text className="text-white">Выбрать изображение</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View className="flex-row justify-between mt-6 space-x-4">
                  <View className="flex-1">
                    <TouchableOpacity
                      style={{ backgroundColor: colors.background.card }}
                      className="p-3 rounded-lg items-center"
                      onPress={handleCancelEdit}
                      disabled={isLoading}
                    >
                      <Text style={{ color: colors.text.normal }} className="font-semibold">Отмена</Text>
                    </TouchableOpacity>
                  </View>
                  <View className="flex-1">
                    <TouchableOpacity
                      style={{ backgroundColor: isDark ? colors.primary.gold : defaultColors.primary.blue }}
                      className="p-3 rounded-lg items-center"
                      onPress={handleSaveEdit}
                      disabled={isLoading}
                    >
                      <Text className="text-white font-semibold">Сохранить</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </>
            ) : (
              <>
                {currentItem.imageUri && (
                  <Image
                    source={{ uri: currentItem.imageUri }}
                    className="w-full h-48 rounded-lg mb-3"
                    resizeMode="cover"
                  />
                )}

                <View className="mb-3">
                  <Text style={{ color: colors.text.normal }} className="font-semibold">Основная информация</Text>
                  <View style={{ backgroundColor: colors.background.card }} className="p-3 rounded-lg mt-1">
                    <Text style={{ color: colors.text.muted }} className="mb-1">Код: {currentItem.code || 'не указан'}</Text>
                    <Text style={{ color: colors.text.muted }} className="mb-1">Склад: {currentItem.warehouse || 'не указан'}</Text>
                    <Text style={{ color: colors.text.muted }} className="mb-1">Тип размера: {currentItem.sizeType || 'не указан'}</Text>
                    <Text style={{ color: colors.text.muted }} className="mb-1">Количество коробок: {currentItem.numberOfBoxes || 0}</Text>
                    <Text style={{ color: colors.text.muted }} className="mb-1">Всего товаров: {currentItem.totalQuantity || 0}</Text>
                    {isAdmin() && (
                      <Text style={{ color: colors.text.muted }}>Общая стоимость закупки: {(currentItem.totalValue !== undefined && currentItem.totalValue >= 0) ? currentItem.totalValue.toFixed(2) : '0.00'} {currencyShort}</Text>
                    )}

                    {(currentItem.totalValue === -1 || currentItem.totalValue < 0 || currentItem.totalValue === undefined) && (
                      <View style={{ backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#fef2f2', borderColor: isDark ? '#ef4444' : '#fecaca', borderWidth: 1 }} className="mt-3 p-3 rounded-lg">
                        <Text style={{ color: isDark ? '#fca5a5' : '#dc2626' }} className="font-bold text-center">⚠️ Внимание!</Text>
                        <Text style={{ color: isDark ? '#fca5a5' : '#dc2626' }} className="text-center text-sm mt-1">
                          Этот товар импортирован без цены. Пожалуйста, перейдите в режим редактирования и добавьте цены для всех размеров.
                        </Text>
                      </View>
                    )}

                    {(() => {
                      const hasRecommendedPrice = boxSizeQuantities.some(box =>
                        box.some(sq => sq.recommendedSellingPrice && sq.recommendedSellingPrice > 0)
                      );
                      if (!hasRecommendedPrice) {
                        return (
                          <View style={{ backgroundColor: isDark ? 'rgba(251, 191, 36, 0.15)' : '#fefce8', borderColor: isDark ? '#fbbf24' : '#fcd34d', borderWidth: 1 }} className="mt-3 p-3 rounded-lg">
                            <Text style={{ color: isDark ? '#fcd34d' : '#92400e' }} className="font-bold text-center">⚠️ Рекомендация</Text>
                            <Text style={{ color: isDark ? '#fcd34d' : '#a16207' }} className="text-center text-sm mt-1">
                              У этого товара нет рекомендуемой цены продажи. Перейдите в режим редактирования, чтобы добавить её.
                            </Text>
                          </View>
                        );
                      }
                      return null;
                    })()}
                  </View>
                </View>

                {savedAttributes.length > 0 && (
                  <View className="mb-3">
                    <Text style={{ color: colors.text.normal }} className="font-semibold">Доп. параметры</Text>
                    <View style={{ backgroundColor: colors.background.card }} className="p-3 rounded-lg mt-1" >
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {savedAttributes.map((a, i) => (
                          <View
                            key={`${a.name}-${i}`}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              paddingHorizontal: 10,
                              paddingVertical: 6,
                              borderRadius: 14,
                              borderWidth: 1,
                              borderColor: colors.border.normal,
                              backgroundColor: colors.background.screen,
                            }}
                          >
                            {a.attrType === 'color' ? (
                              <View
                                style={{
                                  width: 12,
                                  height: 12,
                                  borderRadius: 6,
                                  marginRight: 6,
                                  backgroundColor: COLOR_SWATCHES.find((s) => s.name.toLowerCase() === a.value.toLowerCase())?.hex ?? '#9ca3af',
                                  borderWidth: 1,
                                  borderColor: colors.border.light,
                                }}
                              />
                            ) : null}
                            <Text style={{ color: colors.text.muted, fontSize: 12 }}>{a.name}: </Text>
                            <Text style={{ color: colors.text.normal, fontSize: 12, fontWeight: '600' }}>
                              {a.value}{a.unit ? ` ${a.unit}` : ''}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  </View>
                )}

                <View className="mb-3">
                  <Text style={{ color: colors.text.normal }} className="font-semibold">Размеры по коробкам</Text>
                  <View style={{ backgroundColor: colors.background.card }} className="p-3 rounded-lg mt-1">
                    {boxSizeQuantities.map((box, boxIndex) => (
                      <View key={boxIndex} style={{ backgroundColor: colors.background.screen }} className="mb-4 p-3 rounded-lg">
                        <Text style={{ color: colors.text.normal }} className="font-bold mb-2">Коробка {boxIndex + 1}</Text>

                        {box.map((sizeQty, sizeIndex) => {
                          const qty = getCurrentQuantity(boxIndex, sizeQty.size);
                          const safePrice = (sizeQty.price !== undefined && !isNaN(sizeQty.price)) ? sizeQty.price : 0;
                          const safeRecommendedPrice = (sizeQty.recommendedSellingPrice !== undefined && !isNaN(sizeQty.recommendedSellingPrice)) ? sizeQty.recommendedSellingPrice : 0;

                          // Получаем количество в корзине для расчёта доступного остатка
                          const { quantity: cartQty } = getCartQuantityForSize(boxIndex, sizeIndex);
                          const availableQty = qty - cartQty; // Доступное количество = склад - корзина

                          // Для весовых товаров: интерпретируем qty/cartQty/availableQty
                          // как значения в единицах priceUnit (kg / 100г) и считаем граммы для отображения.
                          const perUnitGrams = isWeightItem ? gramsPerPriceUnit(itemPriceUnit) : 0;
                          const availableGrams = isWeightItem ? availableQty * perUnitGrams : 0;
                          const cartGrams = isWeightItem ? cartQty * perUnitGrams : 0;
                          const priceForDisplay = isAdmin() ? safePrice : safeRecommendedPrice;

                          return (
                            <View key={sizeIndex} style={{ backgroundColor: colors.background.card }} className="flex-row items-center justify-between mb-2 p-2 rounded">
                              <View className="flex-1">
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                  <Text style={{ color: colors.text.normal }} className="font-medium">
                                    {isWeightItem
                                      ? `Размер ${sizeQty.size}: ${formatWeight(availableGrams)}`
                                      : `Размер ${sizeQty.size}: ${availableQty} шт.`}
                                  </Text>
                                </View>
                                {isWeightItem ? (
                                  <Text style={{ color: isDark ? colors.primary.gold : '#15803d' }} className="text-xs mt-1 font-semibold">
                                    {priceForDisplay.toFixed(2)} {currencyShort} за {priceUnitLabel(itemPriceUnit)}
                                  </Text>
                                ) : isAdmin() ? (
                                  <Text style={{ color: colors.text.muted }} className="text-xs mt-1">Цена: {safePrice.toFixed(2)} {currencyShort}</Text>
                                ) : (
                                  <Text style={{ color: isDark ? colors.primary.gold : '#15803d' }} className="text-xs mt-1 font-semibold">Рек. цена: {safeRecommendedPrice.toFixed(2)} {currencyShort}</Text>
                                )}
                              </View>

                              {/* Весовые товары — единая кнопка "Ввести вес" / показ текущего веса в корзине */}
                              {isWeightItem && qty > 0 && isAssistant() && (
                                <Pressable
                                  style={({ pressed }) => [{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    backgroundColor: cartGrams > 0
                                      ? (isDark ? 'rgba(212, 175, 55, 0.18)' : 'rgba(34, 197, 94, 0.15)')
                                      : (pressed
                                        ? (isDark ? '#b8860b' : '#15803d')
                                        : (isDark ? colors.primary.gold : '#22c55e')),
                                    borderRadius: 20,
                                    paddingHorizontal: 14,
                                    paddingVertical: 8,
                                    opacity: isLoading ? 0.5 : 1,
                                    borderWidth: cartGrams > 0 ? 1 : 0,
                                    borderColor: isDark ? colors.primary.gold : '#22c55e',
                                  }]}
                                  onPress={() => openWeightModalFor(boxIndex, sizeQty)}
                                  disabled={isLoading}
                                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                  <Ionicons
                                    name={cartGrams > 0 ? 'create-outline' : 'cart'}
                                    size={16}
                                    color={cartGrams > 0
                                      ? (isDark ? colors.primary.gold : '#15803d')
                                      : (isDark ? '#ffffff' : '#000000')}
                                  />
                                  <Text style={{
                                    marginLeft: 6,
                                    fontWeight: '700',
                                    color: cartGrams > 0
                                      ? (isDark ? colors.primary.gold : '#15803d')
                                      : (isDark ? '#ffffff' : '#000000'),
                                  }}>
                                    {cartGrams > 0 ? formatWeight(cartGrams) : 'Ввести вес'}
                                  </Text>
                                </Pressable>
                              )}

                              {!isWeightItem && qty > 0 && isAssistant() && (() => {
                                const accentColor = isDark ? colors.primary.gold : '#22c55e';
                                const isMaxReached = cartQty >= qty;

                                if (cartQty > 0) {
                                  // Показываем +/- счётчик
                                  return (
                                    <View style={{
                                      flexDirection: 'row',
                                      alignItems: 'center',
                                      backgroundColor: isDark ? 'rgba(212, 175, 55, 0.15)' : 'rgba(34, 197, 94, 0.1)',
                                      borderRadius: 20,
                                      paddingHorizontal: 4,
                                      paddingVertical: 2,
                                    }}>
                                      <Pressable
                                        style={({ pressed }) => [{
                                          width: 32,
                                          height: 32,
                                          borderRadius: 16,
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          backgroundColor: pressed ? accentColor : 'transparent',
                                        }]}
                                        onPress={() => handleDecreaseQuantity(boxIndex, sizeQty)}
                                        disabled={isLoading}
                                      >
                                        <Ionicons name="remove" size={20} color={accentColor} />
                                      </Pressable>

                                      <Text style={{
                                        color: accentColor,
                                        fontSize: 16,
                                        fontWeight: 'bold',
                                        minWidth: 28,
                                        textAlign: 'center',
                                      }}>
                                        {cartQty}
                                      </Text>

                                      <Pressable
                                        style={({ pressed }) => [{
                                          width: 32,
                                          height: 32,
                                          borderRadius: 16,
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          backgroundColor: pressed && !isMaxReached ? accentColor : 'transparent',
                                          opacity: isMaxReached ? 0.4 : 1,
                                        }]}
                                        onPress={() => {
                                          if (isMaxReached) {
                                            showToast(`Максимум для размера ${sizeQty.size}: ${qty} шт.`, 'warning');
                                          } else {
                                            handleIncreaseQuantity(boxIndex, sizeQty);
                                          }
                                        }}
                                        disabled={isLoading}
                                      >
                                        <Ionicons name="add" size={20} color={isMaxReached ? colors.text.muted : accentColor} />
                                      </Pressable>
                                    </View>
                                  );
                                }

                                // Показываем кнопку корзины
                                return (
                                  <Pressable
                                    style={({ pressed }) => [{
                                      backgroundColor: pressed
                                        ? (isDark ? '#b8860b' : '#15803d')
                                        : (isDark ? colors.primary.gold : '#22c55e'),
                                      width: 40,
                                      height: 40,
                                      borderRadius: 20,
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      opacity: isLoading ? 0.5 : 1,
                                      shadowColor: isDark ? colors.primary.gold : '#22c55e',
                                      shadowOffset: { width: 0, height: 3 },
                                      shadowOpacity: 0.4,
                                      shadowRadius: 4,
                                      elevation: 6,
                                      borderWidth: 2,
                                      borderColor: isDark ? '#d4af37' : '#16a34a',
                                    }]}
                                    onPress={() => handleAddToCart(boxIndex, sizeQty)}
                                    disabled={isLoading}
                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                  >
                                    <Ionicons name="cart" size={22} color={isDark ? '#ffffff' : '#000000'} />
                                  </Pressable>
                                );
                              })()}
                            </View>
                          );
                        })}
                        {isAdmin() ? (
                          <Text style={{ color: colors.text.normal }} className="font-medium mt-2">Стоимость закупки коробки: {box.reduce((sum, sq) => {
                            const price = (sq.price !== undefined && !isNaN(sq.price)) ? sq.price : 0;
                            return sum + (sq.quantity || 0) * price;
                          }, 0).toFixed(2)} {currencyShort}</Text>
                        ) : (
                          <Text style={{ color: isDark ? colors.primary.gold : '#15803d' }} className="font-medium mt-2">Рекомендуемая стоимость коробки: {box.reduce((sum, sq) => {
                            const price = (sq.recommendedSellingPrice !== undefined && !isNaN(sq.recommendedSellingPrice)) ? sq.recommendedSellingPrice : 0;
                            return sum + (sq.quantity || 0) * price;
                          }, 0).toFixed(2)} {currencyShort}</Text>
                        )}
                      </View>
                    ))}
                  </View>
                </View>

                {(currentItem.row || currentItem.position || currentItem.side) && (
                  <View className="mb-3">
                    <Text style={{ color: colors.text.normal }} className="font-semibold">Дополнительная информация</Text>
                    <View style={{ backgroundColor: colors.background.card }} className="p-3 rounded-lg mt-1">
                      {currentItem.row && <Text style={{ color: colors.text.muted }} className="mb-1">Ряд: {currentItem.row}</Text>}
                      {currentItem.position && <Text style={{ color: colors.text.muted }} className="mb-1">Позиция: {currentItem.position}</Text>}
                      {currentItem.side && <Text style={{ color: colors.text.muted }}>Сторона: {currentItem.side}</Text>}
                    </View>
                  </View>
                )}

                {/* QR-коды или кнопка создания - размещаем внизу */}
                {currentItem.qrCodeType === 'none' || !currentItem.qrCodes ? (
                  <View className="mb-3">
                    <View style={{ backgroundColor: isDark ? 'rgba(251, 191, 36, 0.15)' : '#fefce8', borderColor: isDark ? colors.primary.gold : '#fcd34d', borderWidth: 2, borderStyle: 'dashed' }} className="p-4 rounded-xl">
                      <View className="flex-row items-center mb-2">
                        <Ionicons name="qr-code-outline" size={24} color={isDark ? colors.primary.gold : '#D97706'} />
                        <Text style={{ color: isDark ? colors.primary.gold : '#92400e' }} className="font-semibold ml-2">QR-коды отсутствуют</Text>
                      </View>
                      <Text style={{ color: isDark ? colors.text.muted : '#a16207' }} className="text-sm mb-3">
                        Для этого товара не созданы QR-коды. Создайте их для удобного сканирования и отслеживания.
                      </Text>
                      {isAssistant() && (
                        <TouchableOpacity
                          onPress={() => setShowCreateQRModal(true)}
                          style={{ backgroundColor: isDark ? colors.primary.gold : colors.primary.blue }}
                          className="py-3 px-4 rounded-xl flex-row items-center justify-center"
                        >
                          <Ionicons name="qr-code" size={20} color="white" />
                          <Text className="text-white font-semibold ml-2">Создать QR-коды</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ) : (
                  <QRCodeDisplay
                    qrCodes={currentItem.qrCodes}
                    itemName={currentItem.name}
                    itemCode={currentItem.code}
                    qrCodeType={currentItem.qrCodeType}
                    price={deriveItemDisplayPrice(currentItem, recommendedSellingPrice, priceValue)}
                  />
                )}

                {/* Кнопка "Показать штрих-код товара" — отдельный экран с большим штрих-кодом */}
                {currentItem.code ? (
                  <TouchableOpacity
                    onPress={() => setShowBarcodePreview(true)}
                    style={{
                      marginTop: 12,
                      backgroundColor: isDark ? colors.background.card : '#F3F4F6',
                      borderColor: isDark ? colors.primary.gold : colors.primary.blue,
                      borderWidth: 1,
                      paddingVertical: 14,
                      paddingHorizontal: 16,
                      borderRadius: 12,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    accessibilityLabel="Показать штрих-код товара"
                  >
                    <Ionicons name="barcode-outline" size={22} color={isDark ? colors.primary.gold : colors.primary.blue} />
                    <Text style={{ marginLeft: 8, color: isDark ? colors.primary.gold : colors.primary.blue, fontWeight: '600' }}>
                      Показать штрих-код
                    </Text>
                  </TouchableOpacity>
                ) : null}

                <View className="flex-row justify-between mt-6 space-x-3">
                  {isAssistant() && (
                    <TouchableOpacity
                      style={{ backgroundColor: isDark ? colors.primary.gold : '#f97316' }}
                      className="flex-1 p-3 rounded-lg items-center"
                      onPress={handleWholesale}
                      disabled={isLoading || currentItem.totalQuantity === 0}
                    >
                      <Text className="text-white font-medium">Продать оптом</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={{ backgroundColor: isDark ? colors.border.normal : '#6b7280' }}
                    className={isAssistant() ? "flex-1 p-3 rounded-lg items-center" : "p-3 rounded-lg items-center w-full"}
                    onPress={onClose}
                    disabled={isLoading}
                  >
                    <Text className="text-white font-medium">Закрыть</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ScrollView>

          {/* Фиксированная кнопка "В корзину" внизу экрана - только для ассистента и если есть товары */}
          {isAssistant() && !isEditing && cartItems.length > 0 && (
            <View style={{
              position: 'absolute',
              bottom: Platform.OS === 'ios' ? 34 : 20,
              left: 0,
              right: 0,
              alignItems: 'center',
              zIndex: 100,
            }}>
              <TouchableOpacity
                onPress={() => {
                  onClose();
                  setTimeout(() => navigation.navigate('Cart'), 100);
                }}
                style={{
                  width: '90%',
                  backgroundColor: isDark ? colors.primary.gold : colors.primary.purple,
                  paddingVertical: 16,
                  borderRadius: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: isDark ? colors.primary.gold : '#22c55e',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.4,
                  shadowRadius: 8,
                  elevation: 8,
                }}
              >
                <Ionicons name="cart" size={24} color="#fff" style={{ marginRight: 10 }} />
                <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>В корзину</Text>
                {cartItems.length > 0 && (
                  <View style={{
                    backgroundColor: '#ef4444',
                    borderRadius: 12,
                    minWidth: 24,
                    height: 24,
                    marginLeft: 10,
                    justifyContent: 'center',
                    alignItems: 'center',
                    paddingHorizontal: 6,
                  }}>
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>
                      {cartItems.reduce((sum, item) => sum + item.quantity, 0)}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* Sale Input Overlay */}
          {
            showSaleModal && (
              <Pressable
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(0,0,0,0.6)',
                  justifyContent: 'center',
                  alignItems: 'center',
                  padding: 16,
                  zIndex: 9999,
                }}
                onPress={() => setShowSaleModal(false)}
              >
                <Pressable
                  style={{
                    backgroundColor: colors.background.screen,
                    borderRadius: 12,
                    padding: 20,
                    width: '100%',
                    maxWidth: 350,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.3,
                    shadowRadius: 8,
                    elevation: 10,
                  }}
                  onPress={(e) => e.stopPropagation()}
                >
                  <Text style={{ color: colors.text.normal, fontSize: 18, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' }}>Продажа</Text>
                  <Text style={{ color: colors.text.normal, marginBottom: 8 }}>Размер: {currentSize}</Text>
                  {!isAdmin() && (() => {
                    const currentSizeQty = boxSizeQuantities[currentBoxIndex]?.find(item => String(item.size) === String(currentSize));
                    const recommendedPrice = currentSizeQty?.recommendedSellingPrice || 0;
                    return (
                      <View style={{
                        marginBottom: 12,
                        padding: 12,
                        backgroundColor: isDark ? 'rgba(34, 197, 94, 0.15)' : '#dcfce7',
                        borderWidth: 1,
                        borderColor: isDark ? '#4ade80' : '#86efac',
                        borderRadius: 8
                      }}>
                        <Text style={{ color: isDark ? '#4ade80' : '#166534', fontWeight: '600', textAlign: 'center' }}>
                          Рекомендуемая цена: {recommendedPrice.toFixed(2)} {currencyShort}
                        </Text>
                      </View>
                    );
                  })()}
                  <TextInput
                    style={{
                      borderWidth: 1,
                      borderColor: colors.border.normal,
                      backgroundColor: colors.background.card,
                      color: colors.text.normal,
                      padding: 12,
                      borderRadius: 8,
                      marginBottom: 16,
                      fontSize: 16,
                    }}
                    placeholder={`Цена продажи (${currencyShort})`}
                    placeholderTextColor={colors.text.muted}
                    value={salePrice}
                    onChangeText={(t) => setSalePrice(sanitizePriceText(t))}
                    keyboardType="decimal-pad"
                    autoFocus={true}
                  />
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <TouchableOpacity
                      style={{
                        flex: 1,
                        backgroundColor: colors.background.card,
                        padding: 12,
                        borderRadius: 8,
                        alignItems: 'center',
                      }}
                      onPress={() => setShowSaleModal(false)}
                      disabled={isLoading}
                    >
                      <Text style={{ color: colors.text.normal, fontWeight: '500' }}>Отмена</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{
                        flex: 1,
                        backgroundColor: isDark ? colors.primary.gold : '#2563eb',
                        padding: 12,
                        borderRadius: 8,
                        alignItems: 'center',
                        opacity: (isLoading || !salePrice) ? 0.5 : 1,
                      }}
                      onPress={handleConfirmSale}
                      disabled={isLoading || !salePrice}
                    >
                      <Text style={{ color: 'white', fontWeight: '600' }}>Подтвердить</Text>
                    </TouchableOpacity>
                  </View>
                </Pressable>
              </Pressable>
            )
          }

          {/* Weight Input Overlay — для товаров на вес. Открывается из строки размера
              кнопкой "Ввести вес" / тапом по текущему весу в корзине. */}
          {weightModal && (() => {
            const { sizeQty } = weightModal;
            const perUnit = gramsPerPriceUnit(itemPriceUnit);
            // sizeQty.quantity хранится в единицах priceUnit (kg/100g),
            // переводим в граммы для подсказки "доступно X г / X кг".
            const stockGrams = perUnit > 0 ? Math.round((sizeQty.quantity || 0) * perUnit) : 0;
            const enteredGrams = parsePriceText(weightGramsText);
            const quantityInPriceUnits = perUnit > 0 ? enteredGrams / perUnit : 0;
            // В модалке продажи используем рекомендуемую цену продажи, а не себестоимость.
            // Себестоимость (sizeQty.price) видит только админ в редактировании.
            // Если рек. цена не задана — fallback на price чтобы не показывать 0.
            const costPrice = sizeQty.price || 0;
            const sellPrice = sizeQty.recommendedSellingPrice && sizeQty.recommendedSellingPrice > 0
              ? sizeQty.recommendedSellingPrice
              : costPrice;
            const unitPrice = sellPrice;
            const computedTotal = quantityInPriceUnits * unitPrice;
            const isOverStock = enteredGrams > stockGrams + 1e-6;
            const isEmpty = enteredGrams <= 0;
            const isExistingInCart = cartItems.some(
              ci => ci.item.id === currentItem.id &&
                ci.boxIndex === weightModal.boxIndex &&
                ci.sizeIndex === weightModal.sizeIndex,
            );
            return (
              <Pressable
                style={{
                  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                  backgroundColor: 'rgba(0,0,0,0.6)',
                  justifyContent: 'center', alignItems: 'center',
                  padding: 16, zIndex: 9999,
                }}
                onPress={() => { setWeightModal(null); setWeightGramsText(''); }}
              >
                <Pressable
                  style={{
                    backgroundColor: colors.background.screen,
                    borderRadius: 16,
                    padding: 20,
                    width: '100%',
                    maxWidth: 360,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.3,
                    shadowRadius: 8,
                    elevation: 10,
                  }}
                  onPress={(e) => e.stopPropagation()}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                    <Ionicons name="scale-outline" size={22} color={isDark ? colors.primary.gold : '#0ea5e9'} />
                    <Text style={{ marginLeft: 8, color: colors.text.normal, fontSize: 18, fontWeight: '700' }}>
                      Продажа на вес
                    </Text>
                  </View>

                  <Text style={{ color: colors.text.muted, marginBottom: 4 }}>
                    Размер: <Text style={{ color: colors.text.normal, fontWeight: '600' }}>{String(sizeQty.size)}</Text>
                  </Text>
                  <Text style={{ color: colors.text.muted, marginBottom: 4 }}>
                    Цена: <Text style={{ color: colors.text.normal, fontWeight: '600' }}>{unitPrice.toFixed(2)} {currencyShort} за {priceUnitLabel(itemPriceUnit)}</Text>
                  </Text>
                  <Text style={{ color: colors.text.muted, marginBottom: 12 }}>
                    Доступно на складе: <Text style={{ color: colors.text.normal, fontWeight: '600' }}>{formatWeight(stockGrams)}</Text>
                  </Text>

                  <Text style={{ color: colors.text.muted, marginBottom: 6, fontSize: 13 }}>Вес, г</Text>
                  <TextInput
                    style={{
                      borderWidth: 1.5,
                      borderColor: isOverStock ? '#ef4444' : (isDark ? colors.primary.gold : '#0ea5e9'),
                      backgroundColor: colors.background.card,
                      color: colors.text.normal,
                      borderRadius: 10,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      fontSize: 18,
                      fontWeight: '600',
                      marginBottom: 12,
                    }}
                    value={weightGramsText}
                    // вес — целые граммы, дробные не нужны, поэтому maxDecimals=0
                    onChangeText={(t) => setWeightGramsText(sanitizePriceText(t, 0))}
                    keyboardType="number-pad"
                    placeholder="например, 878"
                    placeholderTextColor={colors.text.muted}
                    autoFocus
                  />

                  {/* Живой итог */}
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
                        {formatWeight(enteredGrams)} × {unitPrice.toFixed(2)} с/{priceUnitLabel(itemPriceUnit)} ={' '}
                        <Text style={{ color: isDark ? colors.primary.gold : '#16a34a', fontSize: 18, fontWeight: '800' }}>
                          {computedTotal.toFixed(2)} {currencyShort}
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
                    {isExistingInCart && (
                      <TouchableOpacity
                        onPress={removeWeightItem}
                        style={{
                          paddingHorizontal: 14,
                          paddingVertical: 12,
                          borderRadius: 10,
                          backgroundColor: '#fee2e2',
                          borderWidth: 1,
                          borderColor: '#fecaca',
                        }}
                      >
                        <Ionicons name="trash-outline" size={20} color="#dc2626" />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      onPress={() => { setWeightModal(null); setWeightGramsText(''); }}
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
                      onPress={confirmWeightAdd}
                      disabled={isEmpty || isOverStock}
                      style={{
                        flex: 1.4,
                        backgroundColor: isDark ? colors.primary.gold : '#22c55e',
                        paddingVertical: 12,
                        borderRadius: 10,
                        alignItems: 'center',
                        opacity: (isEmpty || isOverStock) ? 0.5 : 1,
                      }}
                    >
                      <Text style={{ color: '#fff', fontWeight: '700' }}>
                        {isExistingInCart ? 'Обновить' : 'В корзину'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </Pressable>
              </Pressable>
            );
          })()}

          {/* Wholesale Fullscreen Modal */}
          {
            showWholesaleModal && (
              <View style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: colors.background.screen,
                zIndex: 10000,
              }}>
                {/* Header */}
                <View style={{
                  backgroundColor: isDark ? colors.background.card : '#fff',
                  paddingTop: Platform.OS === 'ios' ? 54 : 44,
                  paddingBottom: 16,
                  paddingHorizontal: 16,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border.normal,
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <TouchableOpacity
                      onPress={() => setShowWholesaleModal(false)}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 12,
                        backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <Ionicons name="arrow-back" size={24} color={colors.text.normal} />
                    </TouchableOpacity>

                    <View style={{ flex: 1, marginHorizontal: 12, alignItems: 'center' }}>
                      <Text style={{ fontSize: 17, fontWeight: '600', color: colors.text.normal }}>Продажа оптом</Text>
                      <Text style={{ fontSize: 12, color: colors.text.muted }} numberOfLines={1}>{currentItem.name}</Text>
                    </View>

                    <TouchableOpacity
                      onPress={handleConfirmWholesale}
                      disabled={isLoading || !selectedBoxes.some(sb => sb.price !== '' && parseFloat(sb.price) > 0)}
                      style={{
                        paddingHorizontal: 16,
                        paddingVertical: 8,
                        borderRadius: 8,
                        backgroundColor: (isLoading || !selectedBoxes.some(sb => sb.price !== '' && parseFloat(sb.price) > 0))
                          ? colors.text.muted
                          : (isDark ? colors.primary.gold : '#22c55e'),
                      }}
                    >
                      <Text style={{ color: '#fff', fontWeight: '600' }}>Продать</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Content */}
                <ScrollView
                  style={{ flex: 1 }}
                  contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
                  showsVerticalScrollIndicator={true}
                >
                  {/* Инструкция */}
                  <View style={{
                    backgroundColor: isDark ? 'rgba(212, 175, 55, 0.1)' : 'rgba(59, 130, 246, 0.08)',
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 16,
                    borderLeftWidth: 4,
                    borderLeftColor: isDark ? colors.primary.gold : colors.primary.blue,
                  }}>
                    <Text style={{ color: isDark ? colors.primary.gold : colors.primary.blue, fontWeight: '600', marginBottom: 4 }}>
                      💡 Как продать оптом
                    </Text>
                    <Text style={{ color: colors.text.muted, fontSize: 13 }}>
                      Выберите коробки для продажи и укажите цену для каждой. Нажмите "Продать" для подтверждения.
                    </Text>
                  </View>

                  {boxSizeQuantities.map((box, boxIndex) => {
                    const boxTotalQuantity = box.reduce((sum, item) => sum + getCurrentQuantity(boxIndex, item.size), 0);
                    const boxTotalValue = box.reduce((sum, item) => {
                      const price = (item.price !== undefined && !isNaN(item.price)) ? item.price : 0;
                      return sum + (getCurrentQuantity(boxIndex, item.size) * price);
                    }, 0);
                    const safeBoxTotalValue = isNaN(boxTotalValue) ? 0 : boxTotalValue;
                    const selectedBox = selectedBoxes.find(sb => sb.boxIndex === boxIndex);
                    const isBoxSelected = selectedBox?.selected === true;

                    if (boxTotalQuantity === 0) return null;

                    return (
                      <View
                        key={boxIndex}
                        style={{
                          backgroundColor: colors.background.card,
                          borderRadius: 16,
                          marginBottom: 16,
                          borderWidth: isBoxSelected ? 2 : 1,
                          borderColor: isBoxSelected
                            ? (isDark ? colors.primary.gold : '#22c55e')
                            : colors.border.normal,
                          overflow: 'hidden',
                        }}
                      >
                        {/* Box Header */}
                        <TouchableOpacity
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: 16,
                            backgroundColor: isBoxSelected
                              ? (isDark ? 'rgba(212, 175, 55, 0.15)' : 'rgba(34, 197, 94, 0.1)')
                              : 'transparent',
                          }}
                          onPress={() => {
                            const updatedBoxes = [...selectedBoxes];
                            const idx = updatedBoxes.findIndex(sb => sb.boxIndex === boxIndex);
                            if (idx !== -1) {
                              updatedBoxes[idx].selected = !updatedBoxes[idx].selected;
                              if (!updatedBoxes[idx].selected) {
                                updatedBoxes[idx].price = '';
                              }
                              setSelectedBoxes(updatedBoxes);
                            }
                          }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            {/* Premium Checkbox */}
                            <View
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 8,
                                backgroundColor: isBoxSelected
                                  ? (isDark ? colors.primary.gold : '#22c55e')
                                  : 'transparent',
                                borderWidth: 2,
                                borderColor: isBoxSelected
                                  ? (isDark ? colors.primary.gold : '#22c55e')
                                  : colors.border.normal,
                                alignItems: 'center',
                                justifyContent: 'center',
                                marginRight: 12,
                              }}
                            >
                              {isBoxSelected && <Ionicons name="checkmark" size={18} color="white" />}
                            </View>
                            <View>
                              <Text style={{ color: colors.text.normal, fontWeight: 'bold', fontSize: 16 }}>
                                Коробка {boxIndex + 1}
                              </Text>
                              <Text style={{ color: colors.text.muted, fontSize: 13 }}>
                                {boxTotalQuantity} шт. • {safeBoxTotalValue.toFixed(0)} {currencyShort}
                              </Text>
                            </View>
                          </View>
                          <Ionicons
                            name={isBoxSelected ? "chevron-up" : "chevron-down"}
                            size={20}
                            color={colors.text.muted}
                          />
                        </TouchableOpacity>

                        {/* Box Details - показываем только если выбран */}
                        {isBoxSelected && (
                          <View style={{ padding: 16, paddingTop: 0 }}>
                            {/* Sizes */}
                            <View style={{
                              backgroundColor: colors.background.screen,
                              borderRadius: 12,
                              padding: 12,
                              marginBottom: 12,
                            }}>
                              <Text style={{ color: colors.text.normal, fontWeight: '600', marginBottom: 8 }}>Размеры:</Text>
                              {box.map((sizeQty, sizeIndex) => {
                                const qty = getCurrentQuantity(boxIndex, sizeQty.size);
                                const safePrice = (sizeQty.price !== undefined && !isNaN(sizeQty.price)) ? sizeQty.price : 0;
                                if (qty === 0) return null;
                                return (
                                  <View key={sizeIndex} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                                    <Text style={{ color: colors.text.muted }}>Размер {sizeQty.size}: {qty} шт.</Text>
                                    <Text style={{ color: colors.text.muted }}>× {safePrice.toFixed(2)} {currencyShort}</Text>
                                  </View>
                                );
                              })}
                              {/* Price Input */}
                              <View>
                                <Text style={{ color: colors.text.normal, fontWeight: '600', marginBottom: 8 }}>Цена продажи за коробку:</Text>
                                <TextInput
                                  style={{
                                    borderColor: isDark ? colors.primary.gold : '#22c55e',
                                    backgroundColor: colors.background.screen,
                                    color: colors.text.normal,
                                    borderWidth: 2,
                                    padding: 14,
                                    borderRadius: 12,
                                    fontSize: 16,
                                  }}
                                  placeholder={`Введите цену (${currencyShort})`}
                                  placeholderTextColor={colors.text.muted}
                                  value={selectedBox?.price === '0' ? '' : (selectedBox?.price || '')}
                                  onChangeText={(text) => {
                                    const sanitized = sanitizePriceText(text);
                                    const updatedBoxes = [...selectedBoxes];
                                    const selectedBoxIndex = updatedBoxes.findIndex(sb => sb.boxIndex === boxIndex);
                                    if (selectedBoxIndex !== -1) {
                                      updatedBoxes[selectedBoxIndex].price = sanitized;
                                      setSelectedBoxes(updatedBoxes);
                                    }
                                  }}
                                  keyboardType="decimal-pad"
                                />
                                {selectedBox?.price && !isNaN(parseFloat(selectedBox.price)) && parseFloat(selectedBox.price) > 0 && (
                                  <View style={{
                                    backgroundColor: isDark ? 'rgba(34, 197, 94, 0.15)' : '#f0fdf4',
                                    borderRadius: 10,
                                    marginTop: 12,
                                    padding: 12,
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                  }}>
                                    <Text style={{ color: isDark ? '#4ade80' : '#16a34a', fontWeight: '600' }}>
                                      Прибыль:
                                    </Text>
                                    <Text style={{ color: isDark ? '#4ade80' : '#15803d', fontWeight: 'bold', fontSize: 16 }}>
                                      {(parseFloat(selectedBox.price) - safeBoxTotalValue).toFixed(2)} {currencyShort}
                                    </Text>
                                  </View>
                                )}
                              </View>
                            </View>
                          </View>
                        )}
                      </View>
                    );
                  })}

                  {/* Total Summary */}
                  {selectedBoxes.some(sb => sb.price !== '' && !isNaN(parseFloat(sb.price)) && parseFloat(sb.price) > 0) && (
                    <View style={{
                      backgroundColor: isDark ? 'rgba(34, 197, 94, 0.15)' : '#f0fdf4',
                      borderRadius: 16,
                      padding: 16,
                      marginTop: 8,
                      borderWidth: 2,
                      borderColor: isDark ? '#4ade80' : '#22c55e',
                    }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                        <Ionicons name="cube" size={20} color={isDark ? '#4ade80' : '#15803d'} style={{ marginRight: 8 }} />
                        <Text style={{ color: isDark ? '#4ade80' : '#15803d', fontWeight: 'bold', fontSize: 18 }}>
                          Итого к продаже
                        </Text>
                      </View>
                      {(() => {
                        let totalSalePrice = 0;
                        let totalCostPrice = 0;
                        let totalBoxes = 0;

                        selectedBoxes.forEach(sb => {
                          if (sb.price !== '' && !isNaN(parseFloat(sb.price)) && parseFloat(sb.price) > 0) {
                            const box = boxSizeQuantities[sb.boxIndex];
                            const boxTotalValue = box.reduce((sum, item) => sum + (getCurrentQuantity(sb.boxIndex, item.size) * item.price), 0);
                            totalSalePrice += parseFloat(sb.price);
                            totalCostPrice += boxTotalValue;
                            totalBoxes++;
                          }
                        });

                        return (
                          <View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                              <Text style={{ color: isDark ? '#86efac' : '#16a34a' }}>Коробок:</Text>
                              <Text style={{ color: isDark ? '#86efac' : '#16a34a', fontWeight: '600' }}>{totalBoxes}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                              <Text style={{ color: isDark ? '#86efac' : '#16a34a' }}>Себестоимость:</Text>
                              <Text style={{ color: isDark ? '#86efac' : '#16a34a', fontWeight: '600' }}>{totalCostPrice.toFixed(2)} {currencyShort}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                              <Text style={{ color: isDark ? '#4ade80' : '#15803d', fontWeight: '600' }}>Цена продажи:</Text>
                              <Text style={{ color: isDark ? '#4ade80' : '#15803d', fontWeight: 'bold' }}>{totalSalePrice.toFixed(2)} {currencyShort}</Text>
                            </View>
                            <View style={{
                              flexDirection: 'row',
                              justifyContent: 'space-between',
                              marginTop: 8,
                              paddingTop: 10,
                              borderTopWidth: 1,
                              borderTopColor: isDark ? 'rgba(134, 239, 172, 0.3)' : 'rgba(22, 163, 74, 0.3)',
                            }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Ionicons name="cash" size={18} color={isDark ? '#4ade80' : '#15803d'} style={{ marginRight: 6 }} />
                                <Text style={{ color: isDark ? '#4ade80' : '#15803d', fontWeight: 'bold', fontSize: 16 }}>Прибыль:</Text>
                              </View>
                              <Text style={{ color: isDark ? '#4ade80' : '#15803d', fontWeight: 'bold', fontSize: 18 }}>
                                {(totalSalePrice - totalCostPrice).toFixed(2)} {currencyShort}
                              </Text>
                            </View>
                          </View>
                        );
                      })()}
                    </View>
                  )}
                </ScrollView>
              </View>
            )
          }

          {/* Модальное окно создания QR-кодов */}
          <CreateQRModal
            visible={showCreateQRModal}
            onClose={() => setShowCreateQRModal(false)}
            onCreateQR={handleCreateQR}
            itemId={currentItem.id}
            itemName={currentItem.name}
            itemCode={currentItem.code}
            itemUuid={currentItem.uuid}
            numberOfBoxes={currentItem.numberOfBoxes}
            boxSizeQuantities={currentItem.boxSizeQuantities}
          />

          {/* Превью штрих-кода — рендерится ВНУТРИ ItemDetailsModal как абсолютный overlay,
              иначе на iOS он окажется под Modal-ом и будет невидим. */}
          <BarcodePreview
            visible={showBarcodePreview}
            onClose={() => setShowBarcodePreview(false)}
            code={currentItem.code}
            itemName={currentItem.name}
            // Цена для дизайнов «С ценой/Ценник» — пытаемся в порядке приоритета:
            // 1) state в режиме редактирования (recommendedSellingPrice → priceValue),
            // 2) первый ненулевой recommendedSellingPrice из boxSizeQuantities,
            // 3) первый ненулевой price из boxSizeQuantities.
            // Без этого даже у заполненного товара дизайны с ценой были disabled,
            // т.к. state-уровневые цены инициализируются только в режиме edit.
            price={deriveItemDisplayPrice(currentItem, recommendedSellingPrice, priceValue)}
          />
        </View >
      </Modal >
    </>
  );
};

/**
 * Достаёт цену для печати на ценнике. Используем ТОЛЬКО рекомендуемую цену
 * продажи (`recommendedSellingPrice`); `price` — это себестоимость/закупка и
 * на ценник её ставить нельзя.
 *
 * Логика:
 *   1) если в редактирующем state есть ненулевая рек. цена — берём её;
 *   2) иначе парсим boxSizeQuantities и ищем первую ненулевую
 *      recommendedSellingPrice среди размеров с qty > 0;
 *   3) если рекомендуемой цены нет — undefined (дизайны с ценой
 *      будут disabled в BarcodePreview).
 */
function deriveItemDisplayPrice(
  item: Item,
  recommendedSellingPrice: number,
  _priceValue: number,
): number | undefined {
  if (recommendedSellingPrice && recommendedSellingPrice > 0) return recommendedSellingPrice;
  try {
    const parsed = JSON.parse(item.boxSizeQuantities || '[]');
    if (!Array.isArray(parsed)) return undefined;
    for (const box of parsed) {
      if (!Array.isArray(box)) continue;
      for (const sq of box) {
        if (sq?.quantity > 0 && sq?.recommendedSellingPrice > 0) return sq.recommendedSellingPrice;
      }
    }
  } catch {
    // ignore
  }
  return undefined;
}

export default ItemDetailsModal;