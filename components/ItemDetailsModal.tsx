// components/ItemDetailsModal.tsx

import { useState, useEffect } from 'react';
import { Modal, View, ScrollView, Text, Image, TouchableOpacity, Alert, ActivityIndicator, TextInput, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { Item, SizeQuantity } from '../database/types';
import { useDatabase } from '../hooks/useDatabase';
import { Picker } from '@react-native-picker/picker';
import { compressImage, showCompressionDialog, getRecommendedProfile, formatFileSize } from '../utils/imageCompression';
import * as FileSystem from 'expo-file-system';
import { useAuth } from '../src/contexts/AuthContext';
import { QRCodeDisplay } from './QRCodeDisplay';
import { CreateQRModal } from './CreateQRModal';
import { useTheme } from '../src/contexts/ThemeContext';
import { getThemeColors, colors as defaultColors } from '../constants/theme';

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
  const colors = getThemeColors(isDark);
  const [currentItem, setCurrentItem] = useState<Item>(item);
  const [isLoading, setIsLoading] = useState(false);
  const [boxSizeQuantities, setBoxSizeQuantities] = useState<SizeQuantity[][]>([]);
  const [showSaleModal, setShowSaleModal] = useState(false);
  const [currentBoxIndex, setCurrentBoxIndex] = useState(0);
  const [currentSize, setCurrentSize] = useState<number | string>(0);
  const [salePrice, setSalePrice] = useState('');
  
  // Состояния для оптовой продажи
  const [showWholesaleModal, setShowWholesaleModal] = useState(false);
  const [selectedBoxes, setSelectedBoxes] = useState<{boxIndex: number, price: string}[]>([]);
  
  // Состояния для QR-кодов
  const [showCreateQRModal, setShowCreateQRModal] = useState(false);
  
  const { updateItemQuantity, deleteItem, addTransaction, updateItem, updateItemQRCodes } = useDatabase();
  
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
  const [priceMode, setPriceMode] = useState<'per_pair' | 'per_box'>('per_pair');
  const [priceValue, setPriceValue] = useState(0);
  const [recommendedSellingPrice, setRecommendedSellingPrice] = useState(0);
  const [editedNumberOfBoxes, setEditedNumberOfBoxes] = useState(item.numberOfBoxes || 1);

  // Размерные ряды для обуви
  const shoeSizeRanges: Record<string, (number | string)[]> = {
    'детский': [30, 31, 32, 33, 34, 35, 36],
    'подростковый': [36, 37, 38, 39, 40, 41],
    'мужской': [39, 40, 41, 42, 43, 44],
    'великан': [44, 45, 46, 47, 48],
    'общий': [36, 37, 38, 39, 40, 41, 42, 43, 44, 45],
  };

  // Размерные ряды для одежды
  const clothingSizeRanges: Record<string, (number | string)[]> = {
    'международный': ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'],
    'брюки': ['44 (XS)', '46 (S)', '48 (M)', '50 (L)', '52 (XL)', '54 (2XL)', '56 (3XL)', '58 (4XL)', '60 (5XL)'],
  };

  const getSizesFromType = (type: string) => {
    // Определяем тип товара по sizeType или по item.itemType
    const itemType = currentItem.itemType || 'обувь';
    const sizeRanges = itemType === 'обувь' ? shoeSizeRanges : clothingSizeRanges;
    
    // Проверяем, существует ли указанный тип в размерных рядах
    if (sizeRanges[type]) {
      return sizeRanges[type];
    }
    
    // Если не нашли, возвращаем первый доступный размерный ряд
    const firstAvailable = Object.keys(sizeRanges)[0];
    if (firstAvailable && sizeRanges[firstAvailable]) {
      console.warn(`SizeType "${type}" not found for itemType "${itemType}", using "${firstAvailable}" instead`);
      return sizeRanges[firstAvailable];
    }
    
    // В крайнем случае возвращаем пустой массив
    console.error(`No size ranges found for itemType "${itemType}"`);
    return [];
  };

  useEffect(() => {
    if (visible) {
      console.log('Modal opened for item id:', item.id);
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
    }
  }, [item, visible]);

  useEffect(() => {
    if (isEditing) {
      let allPrices: number[] = [];
      let allRecommendedPrices: number[] = [];
      boxSizeQuantities.flatMap(box => box.filter(sq => sq.quantity > 0).map(sq => (sq.price !== undefined && !isNaN(sq.price)) ? sq.price : 0)).forEach(p => allPrices.push(p));
      boxSizeQuantities.flatMap(box => box.filter(sq => sq.quantity > 0).map(sq => (sq.recommendedSellingPrice !== undefined && !isNaN(sq.recommendedSellingPrice)) ? sq.recommendedSellingPrice : 0)).forEach(p => allRecommendedPrices.push(p));
      
      if (allPrices.length > 0) {
        const uniquePrices = [...new Set(allPrices)];
        if (uniquePrices.length === 1) {
          setPriceMode('per_pair');
          setPriceValue(uniquePrices[0]);
        } else {
          let boxTotals: number[] = boxSizeQuantities.map(box => box.reduce((sum, sq) => {
            const price = (sq.price !== undefined && !isNaN(sq.price)) ? sq.price : 0;
            return sum + (sq.quantity || 0) * price;
          }, 0));
          const uniqueBoxTotals = [...new Set(boxTotals)];
          if (uniqueBoxTotals.length === 1) {
            setPriceMode('per_box');
            setPriceValue(uniqueBoxTotals[0]);
          } else {
            setPriceMode('per_pair');
            setPriceValue(0);
          }
        }
      } else {
        setPriceMode('per_pair');
        setPriceValue(0);
      }
      
      // Устанавливаем рекомендуемую цену
      if (allRecommendedPrices.length > 0) {
        const uniqueRecommendedPrices = [...new Set(allRecommendedPrices)];
        if (uniqueRecommendedPrices.length === 1) {
          setRecommendedSellingPrice(uniqueRecommendedPrices[0]);
        } else {
          setRecommendedSellingPrice(0);
        }
      } else {
        setRecommendedSellingPrice(0);
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
        aspect: [4, 3],
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

  const handleSaveEdit = async () => {
    setIsLoading(true);
    try {
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
      };

      let newBoxSizeQuantities = boxSizeQuantities.map(box => box.map(sq => ({...sq})));
      if (priceValue > 0 || recommendedSellingPrice > 0) {
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

      await updateItem(updatedBasic);
      await updateItemQuantity(currentItem.id, newBoxJson, newTotalQuantity, newTotalValue);

      const updatedItem: Item = {
        ...updatedBasic,
        boxSizeQuantities: newBoxJson,
        totalQuantity: newTotalQuantity,
        totalValue: newTotalValue,
      };

      setCurrentItem(updatedItem);
      setBoxSizeQuantities(newBoxSizeQuantities);
      onItemUpdated(updatedItem);
      setIsEditing(false);
      Alert.alert('Успех', 'Данные товара успешно обновлены');
    } catch (error) {
      console.error('Error updating item:', error);
      Alert.alert('Ошибка', 'Не удалось обновить данные товара');
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
        timestamp: Math.floor(Date.now() / 1000),
        details: JSON.stringify({
          type: 'sale',
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

      const updatedItem: Item = {
        ...currentItem,
        boxSizeQuantities: JSON.stringify(newBoxSizeQuantities),
        totalQuantity: newTotalQuantity,
        totalValue: newTotalValue
      };

      setCurrentItem(updatedItem);
      onItemUpdated(updatedItem);

      setShowSaleModal(false);
      if (isAdmin()) {
        Alert.alert('Успех', `Продано 1 пару за ${parsedSalePrice} сомонӣ. Прибыль: ${profit.toFixed(2)} сомонӣ`);
      } else {
        Alert.alert('Успех', `Продано 1 пару за ${parsedSalePrice} сомонӣ`);
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
      price: ''
    }));
    setSelectedBoxes(initialBoxes);
    setShowWholesaleModal(true);
  };

  const handleConfirmWholesale = async () => {
    // Проверяем, есть ли выбранные коробки с ценами
    const validSelectedBoxes = selectedBoxes.filter(sb => 
      sb.price !== '' && !isNaN(parseFloat(sb.price)) && parseFloat(sb.price) > 0
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
        timestamp: Math.floor(Date.now() / 1000),
        details: JSON.stringify({
          type: 'wholesale',
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

      const updatedItem: Item = {
        ...currentItem,
        boxSizeQuantities: JSON.stringify(newBoxSizeQuantities),
        totalQuantity: newTotalQuantity,
        totalValue: newTotalValue
      };

      setCurrentItem(updatedItem);
      onItemUpdated(updatedItem);
      setShowWholesaleModal(false);
      setSelectedBoxes([]);

      const totalSalePrice = wholesaleBoxes.reduce((sum, box) => sum + box.salePrice, 0);
      const totalProfit = wholesaleBoxes.reduce((sum, box) => sum + box.profit, 0);
      if (isAdmin()) {
        Alert.alert('Успех', `Продано ${wholesaleBoxes.length} коробок за ${totalSalePrice.toFixed(2)} сомонӣ. Прибыль: ${totalProfit.toFixed(2)} сомонӣ`);
      } else {
        Alert.alert('Успех', `Продано ${wholesaleBoxes.length} коробок за ${totalSalePrice.toFixed(2)} сомонӣ`);
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
        transparent={true}
        visible={visible}
        onRequestClose={onClose}
        presentationStyle="overFullScreen"
        statusBarTranslucent={true}
      >
        <View style={{flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)', padding: 16, position: 'relative'}}>
          <View style={{backgroundColor: colors.background.screen, padding: 20, borderRadius: 8, width: '100%', maxHeight: '85%'}}>
            <ScrollView className="w-full" showsVerticalScrollIndicator={false}>
              <View className="flex-row justify-between items-center mb-4">
                {isEditing ? (
                  <View className="flex-1">
                    <Text style={{color: colors.text.muted}} className="text-xs mb-1">Название товара</Text>
                    <TextInput
                      style={{color: colors.text.normal, borderColor: colors.border.normal, backgroundColor: colors.background.card}}
                      className="text-lg font-bold border p-2 rounded"
                      value={editedName}
                      onChangeText={setEditedName}
                      placeholder="Введите название товара"
                      placeholderTextColor={colors.text.muted}
                    />
                  </View>
                ) : (
                  <Text style={{color: colors.text.normal}} className="text-lg font-bold">{currentItem.name}</Text>
                )}
                
                {!isEditing && isAssistant() && (
                  <View className="relative">
                    <TouchableOpacity
                      onPress={() => setShowMenu(!showMenu)}
                      style={{backgroundColor: colors.background.card}}
                      className="ml-2 p-2 rounded-full"
                    >
                      <Ionicons name="ellipsis-vertical" size={20} color={colors.text.muted} />
                    </TouchableOpacity>
                    
                    {showMenu && (
                      <View style={{backgroundColor: colors.background.screen, borderColor: colors.border.normal}} className="absolute right-0 top-10 shadow-lg rounded-md z-10 border min-w-[140px]">
                        <TouchableOpacity
                          onPress={handleEditItem}
                          className="px-4 py-3 flex-row items-center border-b border-gray-100"
                        >
                          <Ionicons name="pencil-outline" size={18} color="#4B5563" className="mr-2" />
                          <Text className="text-gray-700 font-medium">Изменить</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={handleDeleteItem}
                          className="px-4 py-3 flex-row items-center"
                        >
                          <Ionicons name="trash-outline" size={18} color="#EF4444" className="mr-2" />
                          <Text className="text-red-500 font-medium">Удалить</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )}
              </View>

              {isEditing ? (
                <>
                  <View className="mb-3">
                    <Text style={{color: colors.text.normal}} className="font-semibold">Основная информация</Text>
                    <View style={{backgroundColor: colors.background.card}} className="p-3 rounded-lg mt-1">
                      <View className="mb-2">
                        <Text style={{color: colors.text.muted}} className="text-xs mb-1">Код товара</Text>
                        <TextInput
                          style={{borderColor: colors.border.normal, backgroundColor: colors.background.screen, color: colors.text.normal}}
                          className="border p-2 rounded"
                          value={editedCode}
                          onChangeText={setEditedCode}
                          placeholder="Введите код товара"
                          placeholderTextColor={colors.text.muted}
                        />
                      </View>
                      <View className="mb-2">
                        <Text style={{color: colors.text.muted}} className="text-xs mb-1">Склад</Text>
                        <TextInput
                          style={{borderColor: colors.border.normal, backgroundColor: colors.background.screen, color: colors.text.normal}}
                          className="border p-2 rounded"
                          value={editedWarehouse}
                          onChangeText={setEditedWarehouse}
                          placeholder="Введите название склада"
                          placeholderTextColor={colors.text.muted}
                        />
                      </View>
                      <Text style={{color: colors.text.muted}} className="mb-1">Тип размера: {currentItem.sizeType || 'не указан'}</Text>
                      <View className="mb-2">
                        <Text style={{color: colors.text.muted}} className="text-xs mb-1">Количество коробок</Text>
                        <View style={{borderColor: colors.border.normal}} className="border rounded-lg">
                          <Picker
                            selectedValue={editedNumberOfBoxes}
                            onValueChange={setEditedNumberOfBoxes}
                            style={{color: colors.text.normal}}
                            dropdownIconColor={colors.text.normal}
                          >
                            {Array.from({ length: 20 }, (_, i) => i + 1).map(num => (
                              <Picker.Item key={num} label={num.toString()} value={num} />
                            ))}
                          </Picker>
                        </View>
                      </View>
                      <Text style={{color: colors.text.muted}} className="mb-1">Всего товаров: {boxSizeQuantities.reduce((total, box) => total + box.reduce((sum, sq) => sum + (sq.quantity || 0), 0), 0)}</Text>
                    </View>
                  </View>

                  <View className="mb-3">
                    <Text style={{color: colors.text.normal}} className="font-semibold">Цена</Text>
                      <View style={{backgroundColor: colors.background.card}} className="p-3 rounded-lg mt-1">
                        <View className="mb-2">
                          <Text style={{color: colors.text.muted}} className="text-xs mb-1">Тип цены</Text>
                          <View style={{borderColor: colors.border.normal}} className="border rounded-lg">
                            <Picker
                              selectedValue={priceMode}
                              onValueChange={(itemValue: 'per_pair' | 'per_box') => setPriceMode(itemValue)}
                              style={{color: colors.text.normal}}
                              dropdownIconColor={colors.text.normal}
                            >
                              <Picker.Item label="За пару" value="per_pair" />
                              <Picker.Item label="За коробку" value="per_box" />
                            </Picker>
                          </View>
                        </View>
                        <View className="mb-2">
                          <Text style={{color: colors.text.muted}} className="text-xs mb-1">{priceMode === 'per_pair' ? "Новая цена закупки за пару (сомонӣ)" : "Новая цена закупки за коробку (сомонӣ)"}</Text>
                          <TextInput
                            style={{borderColor: colors.border.normal, backgroundColor: colors.background.screen, color: colors.text.normal}}
                            className="border p-2 rounded"
                            value={(priceValue !== undefined && priceValue !== null) ? priceValue.toString() : '0'}
                            onChangeText={(text) => setPriceValue(parseFloat(text) || 0)}
                            keyboardType="numeric"
                            placeholder="0 (не изменять)"
                            placeholderTextColor={colors.text.muted}
                          />
                        </View>
                        <View className="mb-2">
                          <Text style={{color: colors.text.muted}} className="text-xs mb-1">{priceMode === 'per_pair' ? "Рекомендуемая цена продажи за пару (сомонӣ)" : "Рекомендуемая цена продажи за коробку (сомонӣ)"}</Text>
                          <TextInput
                            style={{borderColor: colors.border.normal, backgroundColor: colors.background.screen, color: colors.text.normal}}
                            className="border p-2 rounded"
                            value={(recommendedSellingPrice !== undefined && recommendedSellingPrice !== null) ? recommendedSellingPrice.toString() : '0'}
                            onChangeText={(text) => setRecommendedSellingPrice(parseFloat(text) || 0)}
                            keyboardType="numeric"
                            placeholder="0 (не изменять)"
                            placeholderTextColor={colors.text.muted}
                          />
                        </View>
                      </View>
                  </View>

                  <View className="mb-3">
                    <Text className="text-gray-700 font-semibold">Размеры по коробкам</Text>
                    <View className="bg-gray-50 p-3 rounded-lg mt-1">
                      {boxSizeQuantities.map((box, boxIndex) => {
                        const totalInBox = box.reduce((sum, sq) => sum + (sq.quantity || 0), 0);
                        let displayPricePerPair = 0;
                        let displayRecommendedPricePerPair = 0;
                        if (priceValue > 0 && totalInBox > 0) {
                          displayPricePerPair = priceMode === 'per_box' ? priceValue / totalInBox : priceValue;
                        } else {
                          // Защита от undefined price в старых данных
                          displayPricePerPair = box[0]?.price || 0;
                        }
                        if (recommendedSellingPrice > 0 && totalInBox > 0) {
                          displayRecommendedPricePerPair = priceMode === 'per_box' ? recommendedSellingPrice / totalInBox : recommendedSellingPrice;
                        } else {
                          // Защита от undefined price в старых данных
                          displayRecommendedPricePerPair = box[0]?.recommendedSellingPrice || 0;
                        }
                        const boxDisplayTotal = totalInBox * displayPricePerPair;
                        const boxDisplayRecommendedTotal = totalInBox * displayRecommendedPricePerPair;
                        // Защита от NaN
                        const safeBoxTotal = isNaN(boxDisplayTotal) ? 0 : boxDisplayTotal;
                        const safeBoxRecommendedTotal = isNaN(boxDisplayRecommendedTotal) ? 0 : boxDisplayRecommendedTotal;
                        const safePricePerPair = isNaN(displayPricePerPair) ? 0 : displayPricePerPair;
                        const safeRecommendedPricePerPair = isNaN(displayRecommendedPricePerPair) ? 0 : displayRecommendedPricePerPair;
                        
                        return (
                          <View key={boxIndex} style={{backgroundColor: colors.background.screen}} className="mb-4 p-3 rounded-lg">
                            <Text style={{color: colors.text.normal}} className="font-bold mb-2">Коробка {boxIndex + 1}</Text>
                            {box.map((sizeQty, sizeIndex) => (
                              <View key={sizeIndex} style={{backgroundColor: colors.background.card}} className="mb-3 p-2 rounded">
                                <View className="flex-row items-center justify-between mb-2">
                                  <Text style={{color: colors.text.normal}} className="font-medium">Размер {sizeQty.size}</Text>
                                  <View className="flex-row items-center">
                                    <TouchableOpacity
                                      className="bg-red-400 w-8 h-8 rounded-full items-center justify-center"
                                      onPress={() => updateSizeQuantity(boxIndex, sizeQty.size, -1)}
                                      disabled={isLoading}
                                    >
                                      <Text className="text-white text-lg">-</Text>
                                    </TouchableOpacity>
                                    <Text className="mx-3 font-bold">{sizeQty.quantity || 0}</Text>
                                    <TouchableOpacity
                                      style={{backgroundColor: isDark ? colors.primary.gold : defaultColors.primary.blue}}
                                      className="w-8 h-8 rounded-full items-center justify-center"
                                      onPress={() => updateSizeQuantity(boxIndex, sizeQty.size, 1)}
                                      disabled={isLoading}
                                    >
                                      <Text className="text-white text-lg">+</Text>
                                    </TouchableOpacity>
                                  </View>
                                </View>
                                <Text style={{color: colors.text.muted}} className="text-xs ml-4">Цена закупки: {safePricePerPair.toFixed(2)} сомонӣ</Text>
                                <Text style={{color: colors.text.muted}} className="text-xs ml-4">Рекомендуемая цена: {safeRecommendedPricePerPair.toFixed(2)} сомонӣ</Text>
                              </View>
                            ))}
                            <Text style={{color: colors.text.normal}} className="font-medium mt-2">Стоимость закупки: {safeBoxTotal.toFixed(2)} сомонӣ</Text>
                            <Text style={{color: colors.text.normal}} className="font-medium mt-1">Рекомендуемая стоимость: {safeBoxRecommendedTotal.toFixed(2)} сомонӣ</Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>

                  <View className="mt-2 p-2 bg-blue-50 rounded-lg mb-3">
                    <Text className="text-blue-800">Всего коробок: <Text className="font-bold">{editedNumberOfBoxes}</Text></Text>
                    <Text className="text-blue-800">Всего товаров: <Text className="font-bold">{boxSizeQuantities.reduce((total, box) => total + box.reduce((sum, sq) => sum + sq.quantity, 0), 0)}</Text></Text>
                    <Text className="text-blue-800">Общая стоимость закупки: <Text className="font-bold">{
                      boxSizeQuantities.reduce((grandTotal, box) => {
                        const totalInBox = box.reduce((sum, sq) => sum + sq.quantity, 0);
                        let displayPricePerPair = 0;
                        if (priceValue > 0 && totalInBox > 0) {
                          displayPricePerPair = priceMode === 'per_box' ? priceValue / totalInBox : priceValue;
                        } else {
                          // Защита от undefined price в старых данных
                          displayPricePerPair = box[0]?.price || 0;
                        }
                        return grandTotal + totalInBox * displayPricePerPair;
                        }, 0).toFixed(2)
                      }</Text> сомонӣ</Text>
                    <Text className="text-blue-800">Общая рекомендуемая стоимость: <Text className="font-bold">{
                      boxSizeQuantities.reduce((grandTotal, box) => {
                        const totalInBox = box.reduce((sum, sq) => sum + sq.quantity, 0);
                        let displayRecommendedPricePerPair = 0;
                        if (recommendedSellingPrice > 0 && totalInBox > 0) {
                          displayRecommendedPricePerPair = priceMode === 'per_box' ? recommendedSellingPrice / totalInBox : recommendedSellingPrice;
                        } else {
                          // Защита от undefined price в старых данных
                          displayRecommendedPricePerPair = box[0]?.recommendedSellingPrice || 0;
                        }
                        return grandTotal + totalInBox * displayRecommendedPricePerPair;
                        }, 0).toFixed(2)
                      }</Text> сомонӣ</Text>
                  </View>

                  <View className="mb-3">
                    <Text style={{color: colors.text.normal}} className="font-semibold">Дополнительная информация</Text>
                    <View style={{backgroundColor: colors.background.card}} className="p-3 rounded-lg mt-1">
                      <View className="mb-2">
                        <Text style={{color: colors.text.muted}} className="text-xs mb-1">Ряд</Text>
                        <TextInput
                          style={{borderColor: colors.border.normal, backgroundColor: colors.background.screen, color: colors.text.normal}}
                          className="border p-2 rounded"
                          placeholderTextColor={colors.text.muted}
                          value={editedRow}
                          onChangeText={setEditedRow}
                          placeholder="Введите номер ряда"
                        />
                      </View>
                      <View className="mb-2">
                        <Text style={{color: colors.text.muted}} className="text-xs mb-1">Позиция</Text>
                        <TextInput
                          style={{borderColor: colors.border.normal, backgroundColor: colors.background.screen, color: colors.text.normal}}
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
                    <Text style={{color: colors.text.normal}} className="font-semibold">Изображение</Text>
                    <View style={{backgroundColor: colors.background.card}} className="p-3 rounded-lg mt-1">
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
                        style={{backgroundColor: colors.background.card}}
                        className="p-3 rounded-lg items-center"
                        onPress={handleCancelEdit}
                        disabled={isLoading}
                      >
                        <Text style={{color: colors.text.normal}} className="font-semibold">Отмена</Text>
                      </TouchableOpacity>
                    </View>
                    <View className="flex-1">
                      <TouchableOpacity
                        style={{backgroundColor: isDark ? colors.primary.gold : defaultColors.primary.blue}}
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
                    <Text style={{color: colors.text.normal}} className="font-semibold">Основная информация</Text>
                    <View style={{backgroundColor: colors.background.card}} className="p-3 rounded-lg mt-1">
                      <Text style={{color: colors.text.muted}} className="mb-1">Код: {currentItem.code || 'не указан'}</Text>
                      <Text style={{color: colors.text.muted}} className="mb-1">Склад: {currentItem.warehouse || 'не указан'}</Text>
                      <Text style={{color: colors.text.muted}} className="mb-1">Тип размера: {currentItem.sizeType || 'не указан'}</Text>
                      <Text style={{color: colors.text.muted}} className="mb-1">Количество коробок: {currentItem.numberOfBoxes || 0}</Text>
                      <Text style={{color: colors.text.muted}} className="mb-1">Всего товаров: {currentItem.totalQuantity || 0}</Text>
                      {isAdmin() && (
                        <Text style={{color: colors.text.muted}}>Общая стоимость закупки: {(currentItem.totalValue !== undefined && currentItem.totalValue >= 0) ? currentItem.totalValue.toFixed(2) : '0.00'} сомонӣ</Text>
                      )}
                      
                      {(currentItem.totalValue === -1 || currentItem.totalValue < 0 || currentItem.totalValue === undefined) && (
                        <View className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                          <Text className="text-red-600 font-bold text-center">⚠️ Внимание!</Text>
                          <Text className="text-red-600 text-center text-sm mt-1">
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
                            <View className="mt-3 p-3 bg-yellow-50 border border-yellow-300 rounded-lg">
                              <Text className="text-yellow-800 font-bold text-center">⚠️ Рекомендация</Text>
                              <Text className="text-yellow-700 text-center text-sm mt-1">
                                У этого товара нет рекомендуемой цены продажи. Перейдите в режим редактирования, чтобы добавить её.
                              </Text>
                            </View>
                          );
                        }
                        return null;
                      })()}
                    </View>
                  </View>

                  <View className="mb-3">
                    <Text style={{color: colors.text.normal}} className="font-semibold">Размеры по коробкам</Text>
                    <View style={{backgroundColor: colors.background.card}} className="p-3 rounded-lg mt-1">
                      {boxSizeQuantities.map((box, boxIndex) => (
                        <View key={boxIndex} style={{backgroundColor: colors.background.screen}} className="mb-4 p-3 rounded-lg">
                          <Text style={{color: colors.text.normal}} className="font-bold mb-2">Коробка {boxIndex + 1}</Text>

                          {box.map((sizeQty, sizeIndex) => {
                            const qty = getCurrentQuantity(boxIndex, sizeQty.size);
                            const safePrice = (sizeQty.price !== undefined && !isNaN(sizeQty.price)) ? sizeQty.price : 0;
                            const safeRecommendedPrice = (sizeQty.recommendedSellingPrice !== undefined && !isNaN(sizeQty.recommendedSellingPrice)) ? sizeQty.recommendedSellingPrice : 0;
                            return (
                              <View key={sizeIndex} style={{backgroundColor: colors.background.card}} className="flex-row items-center justify-between mb-2 p-2 rounded">
                                <View className="flex-1">
                                  <Text style={{color: colors.text.normal}} className="font-medium">Размер {sizeQty.size}: {qty} шт.</Text>
                                  {isAdmin() ? (
                                    <Text style={{color: colors.text.muted}} className="text-xs mt-1">Цена: {safePrice.toFixed(2)} сомонӣ</Text>
                                  ) : (
                                    <Text className="text-green-700 text-xs mt-1 font-semibold">Рек. цена: {safeRecommendedPrice.toFixed(2)} сомонӣ</Text>
                                  )}
                                </View>

                                {qty > 0 && isAssistant() && (
                                  <Pressable
                                    style={({pressed}) => [
                                      {
                                        backgroundColor: pressed 
                                          ? (isDark ? '#b8860b' : '#1e40af') 
                                          : (isDark ? colors.primary.gold : '#2563eb'),
                                        width: 36, 
                                        height: 36, 
                                        borderRadius: 18, 
                                        alignItems: 'center', 
                                        justifyContent: 'center', 
                                        opacity: isLoading ? 0.5 : 1,
                                        shadowColor: '#000',
                                        shadowOffset: { width: 0, height: 2 },
                                        shadowOpacity: 0.25,
                                        shadowRadius: 3.84,
                                        elevation: 5,
                                      }
                                    ]}
                                    onPress={() => {
                                      console.log('🛒 Cart button pressed on', Platform.OS);
                                      handleSellItem(boxIndex, sizeQty.size);
                                    }}
                                    disabled={isLoading}
                                    hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
                                  >
                                    <Ionicons name="cart-outline" size={18} color="white" />
                                  </Pressable>
                                )}
                              </View>
                            );
                          })}
                          {isAdmin() ? (
                            <Text className="text-gray-800 font-medium mt-2">Стоимость закупки коробки: {box.reduce((sum, sq) => {
                              const price = (sq.price !== undefined && !isNaN(sq.price)) ? sq.price : 0;
                              return sum + (sq.quantity || 0) * price;
                            }, 0).toFixed(2)} сомонӣ</Text>
                          ) : (
                            <Text className="text-green-700 font-medium mt-2">Рекомендуемая стоимость коробки: {box.reduce((sum, sq) => {
                              const price = (sq.recommendedSellingPrice !== undefined && !isNaN(sq.recommendedSellingPrice)) ? sq.recommendedSellingPrice : 0;
                              return sum + (sq.quantity || 0) * price;
                            }, 0).toFixed(2)} сомонӣ</Text>
                          )}
                        </View>
                      ))}
                    </View>
                  </View>

                  {(currentItem.row || currentItem.position || currentItem.side) && (
                    <View className="mb-3">
                      <Text style={{color: colors.text.normal}} className="font-semibold">Дополнительная информация</Text>
                      <View style={{backgroundColor: colors.background.card}} className="p-3 rounded-lg mt-1">
                        {currentItem.row && <Text style={{color: colors.text.muted}} className="mb-1">Ряд: {currentItem.row}</Text>}
                        {currentItem.position && <Text style={{color: colors.text.muted}} className="mb-1">Позиция: {currentItem.position}</Text>}
                        {currentItem.side && <Text style={{color: colors.text.muted}}>Сторона: {currentItem.side}</Text>}
                      </View>
                    </View>
                  )}

                  {/* QR-коды или кнопка создания - размещаем внизу */}
                  {currentItem.qrCodeType === 'none' || !currentItem.qrCodes ? (
                    <View className="mb-3">
                      <View className="bg-yellow-50 border-2 border-dashed border-yellow-300 p-4 rounded-xl">
                        <View className="flex-row items-center mb-2">
                          <Ionicons name="qr-code-outline" size={24} color="#D97706" />
                          <Text className="text-yellow-800 font-semibold ml-2">QR-коды отсутствуют</Text>
                        </View>
                        <Text className="text-yellow-700 text-sm mb-3">
                          Для этого товара не созданы QR-коды. Создайте их для удобного сканирования и отслеживания.
                        </Text>
                        {isAssistant() && (
                          <TouchableOpacity
                            onPress={() => setShowCreateQRModal(true)}
                            style={{backgroundColor: colors.primary.blue}}
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
                    />
                  )}

                  <View className="flex-row justify-between mt-6 space-x-3">
                    {isAssistant() && (
                      <TouchableOpacity
                        className="flex-1 bg-orange-500 p-3 rounded-lg items-center"
                        onPress={handleWholesale}
                        disabled={isLoading || currentItem.totalQuantity === 0}
                      >
                        <Text className="text-white font-medium">Продать оптом</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      className={isAssistant() ? "flex-1 bg-gray-500 p-3 rounded-lg items-center" : "bg-gray-500 p-3 rounded-lg items-center w-full"}
                      onPress={onClose}
                      disabled={isLoading}
                    >
                      <Text className="text-white font-medium">Закрыть</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </ScrollView>
          </View>
          
          {/* Sale Input Overlay - показывается поверх контента внутри основной модалки */}
          {showSaleModal && (
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
                <Text style={{color: colors.text.normal, fontSize: 18, fontWeight: 'bold', marginBottom: 16, textAlign: 'center'}}>Продажа</Text>
                <Text style={{color: colors.text.normal, marginBottom: 8}}>Размер: {currentSize}</Text>
                {!isAdmin() && (() => {
                  const currentSizeQty = boxSizeQuantities[currentBoxIndex]?.find(item => String(item.size) === String(currentSize));
                  const recommendedPrice = currentSizeQty?.recommendedSellingPrice || 0;
                  return (
                    <View style={{marginBottom: 12, padding: 12, backgroundColor: '#dcfce7', borderWidth: 1, borderColor: '#86efac', borderRadius: 8}}>
                      <Text style={{color: '#166534', fontWeight: '600', textAlign: 'center'}}>
                        Рекомендуемая цена: {recommendedPrice.toFixed(2)} сомонӣ
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
                  placeholder="Цена продажи за пару (сомонӣ)"
                  placeholderTextColor={colors.text.muted}
                  value={salePrice}
                  onChangeText={setSalePrice}
                  keyboardType="numeric"
                  autoFocus={true}
                />
                <View style={{flexDirection: 'row', gap: 12}}>
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
                    <Text style={{color: colors.text.normal, fontWeight: '500'}}>Отмена</Text>
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
                    <Text style={{color: 'white', fontWeight: '600'}}>Подтвердить</Text>
                  </TouchableOpacity>
                </View>
              </Pressable>
            </Pressable>
          )}
        </View>
      </Modal>

      {/* Wholesale Modal */}
      <Modal
        animationType="slide"
        transparent={false}
        visible={showWholesaleModal}
        onRequestClose={() => setShowWholesaleModal(false)}
      >
        <View style={{backgroundColor: colors.background.screen}} className="flex-1">
          {/* Header */}
          <LinearGradient
            colors={isDark ? colors.gradients.accent : defaultColors.gradients.main}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ padding: 16 }}
            className="flex-row items-center justify-between"
          >
            <TouchableOpacity onPress={() => setShowWholesaleModal(false)}>
              <Ionicons name="close" size={24} color="white" />
            </TouchableOpacity>
            <Text className="text-white text-lg font-bold">Продажа оптом</Text>
            <TouchableOpacity onPress={handleConfirmWholesale} disabled={isLoading}>
              <Text className="text-white text-lg font-bold">Продать</Text>
            </TouchableOpacity>
          </LinearGradient>

          {/* Content */}
          <ScrollView className="flex-1 p-4">
            <Text className="text-gray-800 text-lg font-bold mb-4">{currentItem.name}</Text>
            
            {boxSizeQuantities.map((box, boxIndex) => {
              const boxTotalQuantity = box.reduce((sum, item) => sum + getCurrentQuantity(boxIndex, item.size), 0);
              const boxTotalValue = box.reduce((sum, item) => {
                const price = (item.price !== undefined && !isNaN(item.price)) ? item.price : 0;
                return sum + (getCurrentQuantity(boxIndex, item.size) * price);
              }, 0);
              const safeBoxTotalValue = isNaN(boxTotalValue) ? 0 : boxTotalValue;
              const selectedBox = selectedBoxes.find(sb => sb.boxIndex === boxIndex);
              const isBoxSelected = selectedBox && selectedBox.price !== '';
              
              if (boxTotalQuantity === 0) return null; // Не показываем пустые коробки
              
              return (
                <View key={boxIndex} className="mb-4 p-4 bg-gray-50 rounded-lg">
                  <View className="flex-row items-center justify-between mb-3">
                    <Text className="text-gray-800 font-bold text-lg">Коробка {boxIndex + 1}</Text>
                    <TouchableOpacity
                      style={isBoxSelected ? {backgroundColor: colors.primary.blue, borderColor: colors.primary.blue, borderWidth: 2} : {borderColor: '#d1d5db', borderWidth: 2}}
                      className="w-6 h-6 rounded items-center justify-center"
                      onPress={() => {
                        const updatedBoxes = [...selectedBoxes];
                        const boxIndex_copy = boxIndex;
                        const selectedBoxIndex = updatedBoxes.findIndex(sb => sb.boxIndex === boxIndex_copy);
                        if (selectedBoxIndex !== -1) {
                          if (updatedBoxes[selectedBoxIndex].price === '') {
                            // Если коробка не выбрана, помечаем как выбранную
                            updatedBoxes[selectedBoxIndex].price = '0';
                          } else {
                            // Если коробка выбрана, снимаем выбор
                            updatedBoxes[selectedBoxIndex].price = '';
                          }
                          setSelectedBoxes(updatedBoxes);
                        }
                      }}
                    >
                      {isBoxSelected && <Text className="text-white text-xs">✓</Text>}
                    </TouchableOpacity>
                  </View>
                  
                  <View className="mb-3">
                    <Text className="text-gray-600 mb-1">Всего товаров: {boxTotalQuantity} шт.</Text>
                    <Text className="text-gray-600 mb-1">Себестоимость: {safeBoxTotalValue.toFixed(2)} сомонӣ</Text>
                  </View>
                  
                  {/* Размеры в коробке */}
                  <View className="mb-3">
                    <Text className="text-gray-700 font-medium mb-2">Размеры:</Text>
                    {box.map((sizeQty, sizeIndex) => {
                      const qty = getCurrentQuantity(boxIndex, sizeQty.size);
                      const safePrice = (sizeQty.price !== undefined && !isNaN(sizeQty.price)) ? sizeQty.price : 0;
                      const safeRecommendedPrice = (sizeQty.recommendedSellingPrice !== undefined && !isNaN(sizeQty.recommendedSellingPrice)) ? sizeQty.recommendedSellingPrice : 0;
                      if (qty === 0) return null;
                      return (
                        <View key={sizeIndex} className="flex-row justify-between mb-1">
                          <Text className="text-gray-600">Размер {sizeQty.size}: {qty} шт.</Text>
                          <Text className="text-gray-600">× {safePrice.toFixed(2)} сомонӣ</Text>
                        </View>
                      );
                    })}
                  </View>
                  
                  {/* Поле для ввода цены продажи */}
                  {isBoxSelected && (
                    <View>
                      <Text className="text-gray-700 font-medium mb-2">Цена продажи за всю коробку:</Text>
                      <TextInput
                        className="border border-gray-300 p-3 rounded-lg"
                        placeholder="Введите цену за всю коробку (сомонӣ)"
                        value={selectedBox?.price || ''}
                        onChangeText={(text) => {
                          const updatedBoxes = [...selectedBoxes];
                          const selectedBoxIndex = updatedBoxes.findIndex(sb => sb.boxIndex === boxIndex);
                          if (selectedBoxIndex !== -1) {
                            updatedBoxes[selectedBoxIndex].price = text;
                            setSelectedBoxes(updatedBoxes);
                          }
                        }}
                        keyboardType="numeric"
                      />
                      {selectedBox?.price && !isNaN(parseFloat(selectedBox.price)) && parseFloat(selectedBox.price) > 0 && (
                        <View className="mt-2 p-2 bg-blue-50 rounded">
                          <Text className="text-blue-800 text-sm">
                            Прибыль: {(parseFloat(selectedBox.price) - safeBoxTotalValue).toFixed(2)} сомонӣ
                            {safeBoxTotalValue > 0 && ` (${((parseFloat(selectedBox.price) - safeBoxTotalValue) / safeBoxTotalValue * 100).toFixed(1)}%)`}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
            
            {/* Общая информация о продаже */}
            {selectedBoxes.some(sb => sb.price !== '' && !isNaN(parseFloat(sb.price)) && parseFloat(sb.price) > 0) && (
              <View className="mt-4 p-4 bg-green-50 rounded-lg">
                <Text className="text-green-800 font-bold text-lg mb-2">Итого к продаже:</Text>
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
                    <>
                      <Text className="text-green-700">Коробок: {totalBoxes}</Text>
                      <Text className="text-green-700">Себестоимость: {totalCostPrice.toFixed(2)} сомонӣ</Text>
                      <Text className="text-green-700">Цена продажи: {totalSalePrice.toFixed(2)} сомонӣ</Text>
                      <Text className="text-green-700 font-bold">Прибыль: {(totalSalePrice - totalCostPrice).toFixed(2)} сомонӣ</Text>
                    </>
                  );
                })()}
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Модальное окно создания QR-кодов */}
      <CreateQRModal
        visible={showCreateQRModal}
        onClose={() => setShowCreateQRModal(false)}
        onCreateQR={handleCreateQR}
        itemId={currentItem.id}
        itemName={currentItem.name}
        itemCode={currentItem.code}
        numberOfBoxes={currentItem.numberOfBoxes}
        boxSizeQuantities={currentItem.boxSizeQuantities}
      />
    </>
  );
};

export default ItemDetailsModal;