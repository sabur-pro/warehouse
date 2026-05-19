// components/BarcodePreview.tsx
//
// Превью + конструктор этикетки. На вход: код товара (штрихкод) и опционально
// название/цена. Юзер выбирает:
//   - дизайн этикетки (что нарисовать поверх штрихкода);
//   - размер плёнки (по дефолту — из настроек принтера);
//   - количество копий.
// Затем видит примерный рендер и шлёт на термопринтер через PrinterService.
//
// Реализован как АБСОЛЮТНЫЙ OVERLAY (не <Modal>), потому что на iOS вложенный
// Modal внутри другого Modal (ItemDetailsModal) даёт непредсказуемое поведение.
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import Barcode from '@kichiyaki/react-native-barcode-generator';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../src/contexts/ThemeContext';
import { useCurrency } from '../src/contexts/CurrencyContext';
import { getThemeColors } from '../constants/theme';
import {
  PrinterService,
  LABEL_SIZES,
  LabelSize,
  PrintBarcodeOptions,
} from '../src/services/PrinterService';

interface BarcodePreviewProps {
  visible: boolean;
  onClose: () => void;
  code: string | null | undefined;
  itemName?: string;
  /** Цена товара для дизайна «ценник» / «с ценой». Принимается как число или строка. */
  price?: number | string;
}

type Design = NonNullable<PrintBarcodeOptions['design']>;

const DESIGN_OPTIONS: { value: Design; label: string; desc: string }[] = [
  { value: 'minimal', label: 'Только код', desc: 'Один штрихкод, без подписей' },
  { value: 'with-name', label: 'С названием', desc: 'Название товара сверху, под ним штрихкод' },
  { value: 'with-price', label: 'С ценой', desc: 'Цена крупно, под ней штрихкод' },
  { value: 'price-tag', label: 'Ценник', desc: 'Название + крупная цена + штрихкод' },
];

function pickFormat(value: string): 'EAN13' | 'EAN8' | 'CODE128' {
  const digitsOnly = /^\d+$/.test(value);
  if (digitsOnly && value.length === 13) return 'EAN13';
  if (digitsOnly && value.length === 8) return 'EAN8';
  return 'CODE128';
}

function formatPriceText(price: number | string | undefined, asciiLabel: string): string {
  if (price === undefined || price === null || price === '') return '';
  const num = typeof price === 'number' ? price : parseFloat(String(price));
  if (!Number.isFinite(num) || num <= 0) return String(price);
  // Печатаем ASCII-код валюты — большинство термопринтеров не имеют
  // кириллических/Unicode-символов в шрифте, поэтому коду ISO 4217 (TJS/RUB/USD)
  // всегда отрисовывается корректно.
  const fixed = Number.isInteger(num) ? num.toString() : num.toFixed(2);
  return `${fixed} ${asciiLabel}`;
}

export const BarcodePreview: React.FC<BarcodePreviewProps> = ({
  visible,
  onClose,
  code,
  itemName,
  price,
}) => {
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);
  const { asciiLabel } = useCurrency();
  const navigation = useNavigation<any>();

  const [printing, setPrinting] = useState(false);
  const [design, setDesign] = useState<Design>('with-name');
  const [copies, setCopies] = useState<number>(1);
  const [labelSize, setLabelSize] = useState<LabelSize | null>(null);
  const [defaultSizeId, setDefaultSizeId] = useState<string>(LABEL_SIZES[0].id);

  const trimmed = (code || '').trim();
  const format = useMemo(() => pickFormat(trimmed), [trimmed]);
  const priceText = useMemo(() => formatPriceText(price, asciiLabel), [price, asciiLabel]);

  // При открытии — подтягиваем размер этикетки из настроек принтера, чтобы
  // дефолт совпадал с тем, который выбран глобально.
  useEffect(() => {
    if (!visible) return;
    (async () => {
      try {
        const id = await PrinterService.getLabelSizeId();
        setDefaultSizeId(id);
        const found = LABEL_SIZES.find(s => s.id === id);
        if (found) setLabelSize(found.size);
      } catch {
        // ignore — оставляем null, тогда печать возьмёт глобальный размер
      }
    })();
  }, [visible]);

  // Подбираем разумный дефолтный дизайн: если есть цена — «ценник», иначе «с названием».
  useEffect(() => {
    if (!visible) return;
    setDesign(priceText ? 'price-tag' : 'with-name');
    setCopies(1);
  }, [visible, priceText]);

  const handlePrint = async () => {
    if (!trimmed) return;
    try {
      const saved = await PrinterService.getSavedPrinter();
      if (!saved) {
        Alert.alert(
          'Принтер не выбран',
          'Сначала выберите принтер в Настройках → Принтер этикеток.',
          [
            { text: 'Отмена', style: 'cancel' },
            {
              text: 'Открыть настройки',
              onPress: () => {
                onClose();
                navigation.navigate('Profile', { screen: 'PrinterSettings' });
              },
            },
          ],
        );
        return;
      }
      setPrinting(true);
      await PrinterService.printBarcode({
        code: trimmed,
        name: itemName,
        price: priceText,
        design,
        copies,
        size: labelSize ?? undefined,
      });
    } catch (e: any) {
      Alert.alert('Ошибка печати', e?.message || String(e));
    } finally {
      setPrinting(false);
    }
  };

  if (!visible) return null;

  const showName = (design === 'with-name' || design === 'price-tag') && !!itemName;
  const showPrice = (design === 'with-price' || design === 'price-tag') && !!priceText;
  const priceBig = design === 'price-tag';

  return (
    <View style={styles.root} pointerEvents="auto">
      <Pressable style={styles.backdrop} onPress={onClose} />

      <View style={[styles.sheet, { backgroundColor: colors.background.screen }]}>
        <View style={[styles.header, { borderBottomColor: colors.border.normal }]}>
          <Text style={[styles.title, { color: colors.text.normal }]}>Печать этикетки</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={12}>
            <Ionicons name="close" size={26} color={colors.text.normal} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Превью «как на этикетке» ─────────────────────────────────── */}
          {trimmed ? (
            <View style={styles.labelPreview}>
              {showName ? (
                <Text style={styles.previewName} numberOfLines={1}>
                  {itemName}
                </Text>
              ) : null}
              {showPrice ? (
                <Text style={[styles.previewPrice, priceBig && styles.previewPriceBig]}>
                  {priceText}
                </Text>
              ) : null}
              <Barcode
                value={trimmed}
                format={format}
                width={2.5}
                height={priceBig ? 80 : 110}
                background="#FFFFFF"
                lineColor="#000000"
                text={trimmed}
              />
            </View>
          ) : (
            <Text style={[styles.empty, { color: colors.text.muted }]}>
              У товара не указан код / штрих-код.
            </Text>
          )}

          {trimmed && (
            <>
              {/* ── Дизайн ──────────────────────────────────────────────── */}
              <Text style={[styles.section, { color: colors.text.normal }]}>Дизайн</Text>
              <View
                style={[
                  styles.card,
                  { backgroundColor: colors.background.card, borderColor: colors.border.light },
                ]}
              >
                {DESIGN_OPTIONS.map((opt, idx) => {
                  const active = design === opt.value;
                  // Дизайны, требующие цены — disabled, если её нет.
                  const requiresPrice = opt.value === 'with-price' || opt.value === 'price-tag';
                  const disabled = requiresPrice && !priceText;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      onPress={() => !disabled && setDesign(opt.value)}
                      disabled={disabled}
                      style={[
                        styles.optionRow,
                        idx < DESIGN_OPTIONS.length - 1 && {
                          borderBottomWidth: 1,
                          borderBottomColor: colors.border.light,
                        },
                        active && {
                          backgroundColor: isDark
                            ? 'rgba(212, 175, 55, 0.10)'
                            : 'rgba(99, 102, 241, 0.06)',
                        },
                        disabled && { opacity: 0.4 },
                      ]}
                    >
                      <View
                        style={[
                          styles.radio,
                          {
                            borderColor: active
                              ? isDark
                                ? colors.primary.gold
                                : colors.primary.blue
                              : colors.text.muted,
                          },
                        ]}
                      >
                        {active && (
                          <View
                            style={[
                              styles.radioDot,
                              {
                                backgroundColor: isDark
                                  ? colors.primary.gold
                                  : colors.primary.blue,
                              },
                            ]}
                          />
                        )}
                      </View>
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={[styles.optionTitle, { color: colors.text.normal }]}>
                          {opt.label}
                        </Text>
                        <Text style={[styles.optionDesc, { color: colors.text.muted }]}>
                          {disabled ? 'У товара не указана цена' : opt.desc}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* ── Размер этикетки ──────────────────────────────────────── */}
              <Text style={[styles.section, { color: colors.text.normal }]}>Размер этикетки</Text>
              <View
                style={[
                  styles.card,
                  { backgroundColor: colors.background.card, borderColor: colors.border.light },
                ]}
              >
                {LABEL_SIZES.map((opt, idx) => {
                  const active =
                    labelSize?.widthMm === opt.size.widthMm &&
                    labelSize?.heightMm === opt.size.heightMm;
                  const isDefault = opt.id === defaultSizeId;
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      onPress={() => setLabelSize(opt.size)}
                      style={[
                        styles.optionRow,
                        idx < LABEL_SIZES.length - 1 && {
                          borderBottomWidth: 1,
                          borderBottomColor: colors.border.light,
                        },
                        active && {
                          backgroundColor: isDark
                            ? 'rgba(212, 175, 55, 0.10)'
                            : 'rgba(99, 102, 241, 0.06)',
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.radio,
                          {
                            borderColor: active
                              ? isDark
                                ? colors.primary.gold
                                : colors.primary.blue
                              : colors.text.muted,
                          },
                        ]}
                      >
                        {active && (
                          <View
                            style={[
                              styles.radioDot,
                              {
                                backgroundColor: isDark
                                  ? colors.primary.gold
                                  : colors.primary.blue,
                              },
                            ]}
                          />
                        )}
                      </View>
                      <Text style={[styles.optionTitle, { color: colors.text.normal, marginLeft: 10, flex: 1 }]}>
                        {opt.label}
                      </Text>
                      {isDefault && (
                        <Text style={[styles.defaultTag, { color: colors.text.muted }]}>по умолчанию</Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* ── Количество копий ─────────────────────────────────────── */}
              <Text style={[styles.section, { color: colors.text.normal }]}>Количество</Text>
              <View
                style={[
                  styles.card,
                  { backgroundColor: colors.background.card, borderColor: colors.border.light },
                ]}
              >
                <View style={styles.copiesRow}>
                  <TouchableOpacity
                    style={[styles.stepBtn, { backgroundColor: isDark ? '#374151' : '#e5e7eb' }]}
                    onPress={() => setCopies(c => Math.max(1, c - 1))}
                    disabled={copies <= 1}
                  >
                    <MaterialIcons name="remove" size={20} color={colors.text.normal} />
                  </TouchableOpacity>
                  <Text style={[styles.copiesValue, { color: colors.text.normal }]}>{copies}</Text>
                  <TouchableOpacity
                    style={[styles.stepBtn, { backgroundColor: isDark ? '#374151' : '#e5e7eb' }]}
                    onPress={() => setCopies(c => Math.min(99, c + 1))}
                    disabled={copies >= 99}
                  >
                    <MaterialIcons name="add" size={20} color={colors.text.normal} />
                  </TouchableOpacity>
                  <Text style={[styles.copiesHint, { color: colors.text.muted }]}>копий</Text>
                </View>
              </View>

              {/* ── Печать ────────────────────────────────────────────────── */}
              <TouchableOpacity
                style={[styles.printBtn, { backgroundColor: isDark ? '#d4af37' : '#3b82f6' }]}
                onPress={handlePrint}
                disabled={printing}
                activeOpacity={0.85}
              >
                {printing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="print-outline" size={20} color="#fff" />
                    <Text style={styles.printBtnText}>
                      Печать {copies > 1 ? `× ${copies}` : ''}
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              <Text style={[styles.hint, { color: colors.text.muted }]}>
                Перед массовой печатью рекомендуется один раз нажать «Калибровать» в настройках
                принтера — это убирает смещение между этикетками.
              </Text>
            </>
          )}
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    zIndex: 9999,
    elevation: 9999,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    paddingBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  title: { fontSize: 18, fontWeight: '700' },
  closeBtn: { padding: 4 },
  body: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 },
  labelPreview: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 360,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  previewName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
    textAlign: 'center',
  },
  previewPrice: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  previewPriceBig: { fontSize: 30 },
  section: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 18,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 8,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  optionTitle: { fontSize: 15, fontWeight: '600' },
  optionDesc: { fontSize: 12, marginTop: 2 },
  defaultTag: { fontSize: 11, fontStyle: 'italic' },
  copiesRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copiesValue: {
    fontSize: 22,
    fontWeight: '700',
    marginHorizontal: 18,
    minWidth: 40,
    textAlign: 'center',
  },
  copiesHint: { fontSize: 14, marginLeft: 'auto' },
  printBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  printBtnText: { color: '#fff', fontWeight: '700', fontSize: 16, marginLeft: 6 },
  hint: { fontSize: 12, textAlign: 'center', marginTop: 12, lineHeight: 16 },
  empty: { fontSize: 16, marginTop: 32, textAlign: 'center' },
});
