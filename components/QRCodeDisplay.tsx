// components/QRCodeDisplay.tsx
import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import * as Print from 'expo-print';
import { QRCodeInfo, parseQRCodes } from '../utils/qrCodeUtils';
import { useTheme } from '../src/contexts/ThemeContext';
import { getThemeColors } from '../constants/theme';

interface QRCodeDisplayProps {
  qrCodes: string | null;
  itemName: string;
  itemCode: string;
  qrCodeType: string;
}

export const QRCodeDisplay: React.FC<QRCodeDisplayProps> = ({ qrCodes, itemName, itemCode, qrCodeType }) => {
  const qrRefs = useRef<{ [key: string]: any }>({});
  const parsedQRCodes = parseQRCodes(qrCodes);
  const [isExpanded, setIsExpanded] = useState(false);
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);

  if (!qrCodes || parsedQRCodes.length === 0) {
    return null;
  }

  const handleDownloadQR = async (qrCode: QRCodeInfo, index: number) => {
    try {
      // Получаем SVG из ref
      const qrRef = qrRefs.current[qrCode.id];
      if (!qrRef) {
        Alert.alert('Ошибка', 'QR-код не загружен');
        return;
      }

      // Генерируем base64 из SVG
      qrRef.toDataURL(async (data: string) => {
        try {
          const label = getQRLabel(qrCode, index);

          // Создаем HTML для PDF с одним QR кодом по центру
          const htmlContent = `
            <!DOCTYPE html>
            <html>
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                  body {
                    font-family: Arial, sans-serif;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 100vh;
                    margin: 0;
                    padding: 20px;
                  }
                  .qr-item {
                    text-align: center;
                    border: 2px solid #e5e7eb;
                    border-radius: 12px;
                    padding: 20px;
                    background: white;
                  }
                  .qr-title {
                    font-size: 20px;
                    font-weight: bold;
                    margin-bottom: 8px;
                    color: #1f2937;
                  }
                  .qr-code {
                    font-size: 14px;
                    color: #6b7280;
                    margin-bottom: 8px;
                  }
                  .qr-label {
                    font-size: 16px;
                    color: #4b5563;
                    margin-bottom: 15px;
                  }
                  .qr-image {
                    width: 200px;
                    height: 200px;
                    margin: 10px auto;
                    display: block;
                  }
                </style>
              </head>
              <body>
                <div class="qr-item">
                  <div class="qr-title">${itemName}</div>
                  <div class="qr-code">Код: ${itemCode}</div>
                  <div class="qr-label">${label}</div>
                  <img src="data:image/png;base64,${data}" class="qr-image" />
                </div>
              </body>
            </html>
          `;

          // Создаем PDF
          const { uri } = await Print.printToFileAsync({
            html: htmlContent,
            base64: false,
          });

          // Делимся PDF файлом
          const isAvailable = await Sharing.isAvailableAsync();
          if (isAvailable) {
            await Sharing.shareAsync(uri, {
              mimeType: 'application/pdf',
              dialogTitle: `QR-код: ${itemName} - ${label}`,
            });
          } else {
            Alert.alert('Успех', `QR-код сохранен в PDF: ${uri}`);
          }
        } catch (error) {
          console.error('Error creating PDF:', error);
          Alert.alert('Ошибка', 'Не удалось создать PDF');
        }
      });
    } catch (error) {
      console.error('Error downloading QR code:', error);
      Alert.alert('Ошибка', 'Не удалось скачать QR-код');
    }
  };

  const handleDownloadAll = async () => {
    try {
      // Собираем все QR-коды в base64
      const qrDataPromises = parsedQRCodes.map((qrCode, index) => {
        return new Promise<{ label: string; data: string }>((resolve, reject) => {
          const qrRef = qrRefs.current[qrCode.id];
          if (!qrRef) {
            reject(new Error('QR-код не загружен'));
            return;
          }

          qrRef.toDataURL((data: string) => {
            const label = getQRLabel(qrCode, index);
            resolve({ label, data });
          });
        });
      });

      const qrDataArray = await Promise.all(qrDataPromises);

      // Создаем HTML со всеми QR-кодами (5 в ряд)
      const qrCodesHtml = qrDataArray.map((item) => `
        <div class="qr-item">
          <div class="qr-title">${itemName}</div>
          <div class="qr-code">Код: ${itemCode}</div>
          <div class="qr-label">${item.label}</div>
          <img src="data:image/png;base64,${item.data}" class="qr-image" />
        </div>
      `).join('');

      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
              }
              body {
                font-family: Arial, sans-serif;
                padding: 15px;
              }
              .qr-grid {
                display: grid;
                grid-template-columns: repeat(5, 1fr);
                gap: 10px;
                width: 100%;
              }
              .qr-item {
                text-align: center;
                border: 1px solid #e5e7eb;
                border-radius: 8px;
                padding: 10px;
                background: white;
                page-break-inside: avoid;
              }
              .qr-title {
                font-size: 11px;
                font-weight: bold;
                margin-bottom: 4px;
                color: #1f2937;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
              }
              .qr-code {
                font-size: 9px;
                color: #6b7280;
                margin-bottom: 4px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
              }
              .qr-label {
                font-size: 10px;
                color: #4b5563;
                margin-bottom: 8px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
              }
              .qr-image {
                width: 100%;
                height: auto;
                max-width: 120px;
                margin: 0 auto;
                display: block;
              }
            </style>
          </head>
          <body>
            <div class="qr-grid">
              ${qrCodesHtml}
            </div>
          </body>
        </html>
      `;

      // Создаем PDF
      const { uri } = await Print.printToFileAsync({
        html: htmlContent,
        base64: false,
      });

      // Делимся PDF файлом
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `QR-коды: ${itemName} (${parsedQRCodes.length} шт)`,
        });
      } else {
        Alert.alert('Успех', `Все QR-коды сохранены в PDF: ${uri}`);
      }
    } catch (error) {
      console.error('Error creating PDF with all QR codes:', error);
      Alert.alert('Ошибка', 'Не удалось создать PDF со всеми QR-кодами');
    }
  };

  const getQRLabel = (qrCode: QRCodeInfo, index: number) => {
    if (qrCodeType === 'per_box') {
      return `Коробка ${(qrCode.boxIndex ?? 0) + 1}`;
    } else if (qrCodeType === 'per_item') {
      if (qrCode.itemIndex !== undefined) {
        return `Размер ${qrCode.size} - №${qrCode.itemIndex} (Коробка ${(qrCode.boxIndex ?? 0) + 1})`;
      }
      return `Размер ${qrCode.size} (Коробка ${(qrCode.boxIndex ?? 0) + 1})`;
    }
    return `QR #${index + 1}`;
  };

  // Цвета для QR-секции
  const qrHeaderBg = isDark ? 'rgba(212, 175, 55, 0.15)' : 'rgba(59, 130, 246, 0.1)';
  const qrHeaderBorder = isDark ? colors.primary.gold : '#bfdbfe';
  const qrIconColor = isDark ? colors.primary.gold : '#3B82F6';
  const qrTitleColor = isDark ? colors.primary.gold : '#1e40af';
  const qrSubtitleColor = isDark ? colors.text.muted : '#2563eb';
  const qrContentBg = isDark ? colors.background.card : '#f8fafc';
  const qrCardBg = isDark ? colors.background.screen : '#ffffff';
  const qrCardBorder = isDark ? colors.border.normal : '#e2e8f0';
  const downloadBtnBg = isDark ? colors.primary.gold : '#22c55e';

  return (
    <View className="mb-3">
      {/* Заголовок секции - кликабельный для сворачивания/разворачивания */}
      <TouchableOpacity
        onPress={() => setIsExpanded(!isExpanded)}
        style={{
          backgroundColor: qrHeaderBg,
          borderColor: qrHeaderBorder,
          borderWidth: 1
        }}
        className="p-3 rounded-xl mb-2"
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center flex-1">
            <Ionicons name="qr-code" size={22} color={qrIconColor} />
            <Text style={{ color: qrTitleColor }} className="text-base font-semibold ml-2">
              QR-коды ({parsedQRCodes.length})
            </Text>
          </View>
          <View className="flex-row items-center">
            {isExpanded && parsedQRCodes.length > 1 && (
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  handleDownloadAll();
                }}
                style={{ backgroundColor: downloadBtnBg }}
                className="px-3 py-1 rounded-full flex-row items-center mr-2"
              >
                <Ionicons name="download-outline" size={14} color="white" />
                <Text className="text-white text-xs font-semibold ml-1">Скачать все</Text>
              </TouchableOpacity>
            )}
            <Ionicons
              name={isExpanded ? "chevron-up" : "chevron-down"}
              size={20}
              color={qrIconColor}
            />
          </View>
        </View>
        {!isExpanded && (
          <Text style={{ color: qrSubtitleColor }} className="text-xs mt-1">
            Нажмите, чтобы открыть QR-коды
          </Text>
        )}
      </TouchableOpacity>

      {/* Содержимое QR кодов - показывается только когда развернуто */}
      {isExpanded && (
        <View style={{ backgroundColor: qrContentBg }} className="p-3 rounded-xl">
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row" style={{ gap: 12 }}>
              {parsedQRCodes.map((qrCode, index) => (
                <View
                  key={qrCode.id}
                  style={{
                    backgroundColor: qrCardBg,
                    borderColor: qrCardBorder,
                    borderWidth: 2,
                    width: 200
                  }}
                  className="p-4 rounded-xl items-center"
                >
                  <Text style={{ color: colors.text.normal }} className="text-sm font-semibold mb-2 text-center">
                    {getQRLabel(qrCode, index)}
                  </Text>
                  {/* QR код рендерится с белым фоном для читаемости */}
                  <View style={{ backgroundColor: '#ffffff', padding: 8, borderRadius: 8 }}>
                    <QRCode
                      value={qrCode.data}
                      size={134}
                      getRef={(ref) => (qrRefs.current[qrCode.id] = ref)}
                      backgroundColor="#ffffff"
                      color="#000000"
                    />
                  </View>
                  <TouchableOpacity
                    onPress={() => handleDownloadQR(qrCode, index)}
                    style={{ backgroundColor: downloadBtnBg }}
                    className="mt-3 px-4 py-2 rounded-full flex-row items-center"
                  >
                    <Ionicons name="download-outline" size={16} color="white" />
                    <Text className="text-white text-xs font-semibold ml-1">Скачать</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      )}
    </View>
  );
};

