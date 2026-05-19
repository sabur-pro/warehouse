// src/screens/ReceiptScreen.tsx
// Универсальный экран "Приход": выбор поставщика + одной или нескольких позиций товара.
// Доступен и админу и ассистенту. Ассистенту НЕ показываем сводки/долги поставщиков —
// только список имён для выбора.
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ProfileStackParamList } from '../types/navigation';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../../constants/theme';
import {
  listSuppliers,
  createSupplier,
  createSupply,
} from '../services/SupplierService';
import { getItems, generateUUID } from '../../database/database';
import { Item, Supplier, SupplyLine, SizeQuantity } from '../../database/types';

type Nav = NativeStackNavigationProp<ProfileStackParamList>;
type Rt = RouteProp<ProfileStackParamList, 'Receipt'>;

interface DraftLine {
  key: string;        // локальный ключ для FlatList
  item: Item;
  boxIndex: number;
  size: number | string | '';
  quantity: string;
  unitPrice: string;
}

const parseBoxes = (raw: string | null | undefined): SizeQuantity[][] => {
  if (!raw) return [];
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
};

export default function ReceiptScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const presetItemUuid = route.params?.itemUuid;
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);

  const [items, setItems] = useState<Item[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [supplierUuid, setSupplierUuid] = useState<string | null>(null);
  const [paid, setPaid] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);

  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showItemModal, setShowItemModal] = useState(false);
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [itemSearch, setItemSearch] = useState('');

  // Поля нового поставщика
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [its, sup] = await Promise.all([getItems(), listSuppliers()]);
        setItems(its);
        setSuppliers(sup);
        if (presetItemUuid) {
          const it = its.find((i) => i.uuid === presetItemUuid);
          if (it) {
            setLines([
              {
                key: generateUUID(),
                item: it,
                boxIndex: 0,
                size: '',
                quantity: '',
                unitPrice: '',
              },
            ]);
          }
        }
      } catch (e: any) {
        Alert.alert('Ошибка', String(e?.message || e));
      } finally {
        setLoading(false);
      }
    })();
  }, [presetItemUuid]);

  const supplier = useMemo(
    () => suppliers.find((s) => s.uuid === supplierUuid) || null,
    [supplierUuid, suppliers]
  );

  const filteredSuppliers = useMemo(() => {
    if (!supplierSearch.trim()) return suppliers;
    const q = supplierSearch.toLowerCase();
    return suppliers.filter((s) => s.name.toLowerCase().includes(q) || (s.phone || '').includes(supplierSearch));
  }, [suppliers, supplierSearch]);

  const filteredItems = useMemo(() => {
    if (!itemSearch.trim()) return items;
    const q = itemSearch.toLowerCase();
    return items.filter((i) =>
      i.name.toLowerCase().includes(q) || (i.code || '').toLowerCase().includes(q)
    );
  }, [items, itemSearch]);

  const totalAmount = useMemo(() => {
    return lines.reduce((sum, l) => {
      const qty = parseFloat(l.quantity.replace(',', '.')) || 0;
      const price = parseFloat(l.unitPrice.replace(',', '.')) || 0;
      return sum + qty * price;
    }, 0);
  }, [lines]);

  const debtAfter = useMemo(() => {
    const p = parseFloat(paid.replace(',', '.')) || 0;
    return totalAmount - p;
  }, [totalAmount, paid]);

  const addLine = (it: Item) => {
    setLines((prev) => [
      ...prev,
      { key: generateUUID(), item: it, boxIndex: 0, size: '', quantity: '', unitPrice: '' },
    ]);
    setShowItemModal(false);
    setItemSearch('');
  };

  const removeLine = (key: string) => {
    setLines((prev) => prev.filter((l) => l.key !== key));
  };

  const updateLine = (key: string, patch: Partial<DraftLine>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const handleCreateSupplier = async () => {
    if (!newName.trim()) {
      Alert.alert('Ошибка', 'Введите имя поставщика');
      return;
    }
    try {
      const created = await createSupplier({ name: newName, phone: newPhone });
      setSuppliers((prev) => [...prev, created]);
      setSupplierUuid(created.uuid || null);
      setNewName('');
      setNewPhone('');
      setShowNewSupplier(false);
      setShowSupplierModal(false);
    } catch (e: any) {
      Alert.alert('Ошибка', String(e?.message || e));
    }
  };

  const handleSave = async () => {
    if (!supplierUuid) {
      Alert.alert('Ошибка', 'Выберите поставщика');
      return;
    }
    if (lines.length === 0) {
      Alert.alert('Ошибка', 'Добавьте хотя бы один товар');
      return;
    }
    const supplyLines: SupplyLine[] = [];
    for (const l of lines) {
      const qty = parseFloat(l.quantity.replace(',', '.')) || 0;
      const price = parseFloat(l.unitPrice.replace(',', '.')) || 0;
      if (!qty || qty <= 0) {
        Alert.alert('Ошибка', `У товара "${l.item.name}" не указано количество`);
        return;
      }
      supplyLines.push({
        itemUuid: l.item.uuid || '',
        itemName: l.item.name,
        itemImageUri: l.item.imageUri,
        quantity: qty,
        unitPrice: price,
        boxIndex: l.boxIndex,
        size: l.size === '' ? undefined : l.size,
        sizeType: l.item.sizeType,
      });
      if (!l.item.uuid) {
        Alert.alert('Ошибка', `У товара "${l.item.name}" нет uuid — нельзя добавить приход`);
        return;
      }
    }

    const paidNum = parseFloat(paid.replace(',', '.')) || 0;

    setSaving(true);
    try {
      await createSupply({
        supplierUuid,
        lines: supplyLines,
        paidAmount: paidNum,
        note: note || null,
      });
      Alert.alert('Готово', 'Приход сохранён', [
        { text: 'ОК', onPress: () => (navigation as any).navigate('ProfileMain') },
      ]);
    } catch (e: any) {
      Alert.alert('Ошибка', String(e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background.screen }]}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary.blue} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.screen }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: colors.border.light }]}>
        <TouchableOpacity
          onPress={() => {
            // Назад всегда ведёт в Профиль (независимо откуда пришли).
            (navigation as any).navigate('ProfileMain');
          }}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text.normal} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text.normal }]}>Приход</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
          {/* Выбор поставщика */}
          <Text style={[styles.label, { color: colors.text.muted }]}>Поставщик *</Text>
          <TouchableOpacity
            style={[styles.selector, { backgroundColor: colors.background.card, borderColor: colors.border.light }]}
            onPress={() => setShowSupplierModal(true)}
          >
            <Ionicons name="business-outline" size={18} color={colors.text.muted} />
            <Text style={[styles.selectorText, { color: supplier ? colors.text.normal : colors.text.muted }]} numberOfLines={1}>
              {supplier ? supplier.name : 'Выбрать поставщика'}
            </Text>
            <Ionicons name="chevron-down" size={18} color={colors.text.muted} />
          </TouchableOpacity>

          {/* Список позиций */}
          <View style={[styles.linesHeader, { marginTop: 16 }]}>
            <Text style={[styles.label, { color: colors.text.muted, margin: 0 }]}>Товары ({lines.length})</Text>
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: isDark ? colors.primary.gold : colors.primary.purple }]}
              onPress={() => setShowItemModal(true)}
            >
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={styles.addBtnText}>Товар</Text>
            </TouchableOpacity>
          </View>

          {lines.length === 0 && (
            <Text style={{ color: colors.text.muted, marginVertical: 12 }}>Нажмите "Товар" чтобы добавить позиции</Text>
          )}

          {lines.map((l) => {
            const boxes = parseBoxes(l.item.boxSizeQuantities);
            const sizesInBox: (number | string)[] = boxes[l.boxIndex] ? boxes[l.boxIndex].map((s) => s.size) : [];
            return (
              <View key={l.key} style={[styles.lineCard, { backgroundColor: colors.background.card }]}>
                <View style={styles.lineHeader}>
                  <Text style={[styles.lineTitle, { color: colors.text.normal }]} numberOfLines={1}>
                    {l.item.name}
                  </Text>
                  <TouchableOpacity onPress={() => removeLine(l.key)}>
                    <Ionicons name="trash-outline" size={20} color="#ef4444" />
                  </TouchableOpacity>
                </View>

                {/* Коробка / размер */}
                {boxes.length > 0 && (
                  <View style={styles.row3}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.smallLabel, { color: colors.text.muted }]}>Коробка</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        {boxes.map((_, idx) => (
                          <TouchableOpacity
                            key={idx}
                            onPress={() => updateLine(l.key, { boxIndex: idx, size: '' })}
                            style={[
                              styles.chip,
                              {
                                backgroundColor:
                                  l.boxIndex === idx
                                    ? (isDark ? colors.primary.gold : colors.primary.purple)
                                    : (isDark ? '#2a2a2e' : '#f3f4f6'),
                              },
                            ]}
                          >
                            <Text style={{ color: l.boxIndex === idx ? '#fff' : colors.text.normal, fontSize: 12 }}>{idx + 1}</Text>
                          </TouchableOpacity>
                        ))}
                        <TouchableOpacity
                          onPress={() => updateLine(l.key, { boxIndex: boxes.length })}
                          style={[styles.chip, { backgroundColor: isDark ? '#2a2a2e' : '#f3f4f6' }]}
                        >
                          <Ionicons name="add" size={14} color={colors.text.normal} />
                        </TouchableOpacity>
                      </ScrollView>
                    </View>
                  </View>
                )}

                {sizesInBox.length > 0 && (
                  <View style={{ marginTop: 8 }}>
                    <Text style={[styles.smallLabel, { color: colors.text.muted }]}>Размер</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      {sizesInBox.map((sz) => (
                        <TouchableOpacity
                          key={String(sz)}
                          onPress={() => updateLine(l.key, { size: String(l.size) === String(sz) ? '' : sz })}
                          style={[
                            styles.chip,
                            {
                              backgroundColor:
                                String(l.size) === String(sz)
                                  ? (isDark ? colors.primary.gold : colors.primary.purple)
                                  : (isDark ? '#2a2a2e' : '#f3f4f6'),
                            },
                          ]}
                        >
                          <Text style={{ color: String(l.size) === String(sz) ? '#fff' : colors.text.normal, fontSize: 12 }}>
                            {sz}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                    <TextInput
                      style={[styles.smallInput, { color: colors.text.normal, borderColor: colors.border.light, marginTop: 6 }]}
                      placeholder="или другой размер"
                      placeholderTextColor={colors.text.muted}
                      value={String(l.size)}
                      onChangeText={(v) => updateLine(l.key, { size: v })}
                    />
                  </View>
                )}
                {sizesInBox.length === 0 && (
                  <View style={{ marginTop: 8 }}>
                    <Text style={[styles.smallLabel, { color: colors.text.muted }]}>Размер</Text>
                    <TextInput
                      style={[styles.smallInput, { color: colors.text.normal, borderColor: colors.border.light }]}
                      placeholder="можно оставить пустым"
                      placeholderTextColor={colors.text.muted}
                      value={String(l.size)}
                      onChangeText={(v) => updateLine(l.key, { size: v })}
                    />
                  </View>
                )}

                <View style={[styles.row3, { marginTop: 8 }]}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={[styles.smallLabel, { color: colors.text.muted }]}>Кол-во</Text>
                    <TextInput
                      style={[styles.smallInput, { color: colors.text.normal, borderColor: colors.border.light }]}
                      keyboardType="numeric"
                      value={l.quantity}
                      onChangeText={(v) => updateLine(l.key, { quantity: v })}
                      placeholder="0"
                      placeholderTextColor={colors.text.muted}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.smallLabel, { color: colors.text.muted }]}>Цена за ед.</Text>
                    <TextInput
                      style={[styles.smallInput, { color: colors.text.normal, borderColor: colors.border.light }]}
                      keyboardType="decimal-pad"
                      value={l.unitPrice}
                      onChangeText={(v) => updateLine(l.key, { unitPrice: v })}
                      placeholder="0"
                      placeholderTextColor={colors.text.muted}
                    />
                  </View>
                </View>

                <Text style={{ color: colors.text.muted, fontSize: 12, marginTop: 8, textAlign: 'right' }}>
                  Сумма: {((parseFloat(l.quantity.replace(',', '.')) || 0) * (parseFloat(l.unitPrice.replace(',', '.')) || 0)).toFixed(2)}
                </Text>
              </View>
            );
          })}

          {/* Оплата + заметка */}
          <Text style={[styles.label, { color: colors.text.muted, marginTop: 16 }]}>Оплачено сейчас</Text>
          <TextInput
            value={paid}
            onChangeText={setPaid}
            style={[styles.input, { color: colors.text.normal, borderColor: colors.border.light }]}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={colors.text.muted}
          />
          <Text style={[styles.label, { color: colors.text.muted }]}>Заметка</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            style={[styles.input, { color: colors.text.normal, borderColor: colors.border.light, height: 60 }]}
            multiline
            placeholderTextColor={colors.text.muted}
          />
        </ScrollView>

        {/* Bottom bar */}
        <View style={[styles.bottomBar, { backgroundColor: colors.background.card, borderTopColor: colors.border.light }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text.muted, fontSize: 12 }}>
              Итого: <Text style={{ color: colors.text.normal, fontWeight: '700' }}>{totalAmount.toFixed(2)}</Text>
            </Text>
            {debtAfter > 0 ? (
              <Text style={{ color: '#ef4444', fontSize: 12 }}>Останется долг: {debtAfter.toFixed(2)}</Text>
            ) : null}
          </View>
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: isDark ? colors.primary.gold : colors.primary.purple }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Сохранить</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Модалка выбора поставщика */}
      <Modal visible={showSupplierModal} transparent animationType="slide" onRequestClose={() => setShowSupplierModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.background.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text.normal }]}>Поставщик</Text>
              <TouchableOpacity onPress={() => setShowSupplierModal(false)}>
                <Ionicons name="close" size={24} color={colors.text.normal} />
              </TouchableOpacity>
            </View>
            <View style={[styles.searchBox, { backgroundColor: isDark ? '#2a2a2e' : '#f3f4f6' }]}>
              <Ionicons name="search" size={18} color={colors.text.muted} />
              <TextInput
                value={supplierSearch}
                onChangeText={setSupplierSearch}
                style={[styles.searchInput, { color: colors.text.normal }]}
                placeholder="Поиск..."
                placeholderTextColor={colors.text.muted}
              />
            </View>
            <TouchableOpacity
              style={[styles.newBtn, { borderColor: colors.border.light }]}
              onPress={() => setShowNewSupplier(true)}
            >
              <Ionicons name="add" size={18} color={isDark ? colors.primary.gold : colors.primary.purple} />
              <Text style={{ color: isDark ? colors.primary.gold : colors.primary.purple, fontWeight: '700', marginLeft: 6 }}>
                Новый поставщик
              </Text>
            </TouchableOpacity>
            <FlatList
              data={filteredSuppliers}
              keyExtractor={(s) => String(s.id)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.pickRow, { borderBottomColor: colors.border.light }]}
                  onPress={() => {
                    setSupplierUuid(item.uuid || null);
                    setShowSupplierModal(false);
                    setSupplierSearch('');
                  }}
                >
                  <Text style={{ color: colors.text.normal, fontSize: 15 }}>{item.name}</Text>
                  {item.phone ? <Text style={{ color: colors.text.muted, fontSize: 12 }}>{item.phone}</Text> : null}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={{ color: colors.text.muted, textAlign: 'center', marginTop: 20 }}>
                  Нет поставщиков
                </Text>
              }
              style={{ maxHeight: 320 }}
            />
          </View>
        </View>
      </Modal>

      {/* Модалка нового поставщика */}
      <Modal visible={showNewSupplier} transparent animationType="slide" onRequestClose={() => setShowNewSupplier(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalSheet, { backgroundColor: colors.background.card }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.text.normal }]}>Новый поставщик</Text>
                <TouchableOpacity onPress={() => setShowNewSupplier(false)}>
                  <Ionicons name="close" size={24} color={colors.text.normal} />
                </TouchableOpacity>
              </View>
              <Text style={[styles.label, { color: colors.text.muted }]}>Имя *</Text>
              <TextInput
                value={newName}
                onChangeText={setNewName}
                style={[styles.input, { color: colors.text.normal, borderColor: colors.border.light }]}
                placeholderTextColor={colors.text.muted}
              />
              <Text style={[styles.label, { color: colors.text.muted }]}>Телефон</Text>
              <TextInput
                value={newPhone}
                onChangeText={setNewPhone}
                style={[styles.input, { color: colors.text.normal, borderColor: colors.border.light }]}
                placeholderTextColor={colors.text.muted}
                keyboardType="phone-pad"
              />
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: isDark ? colors.primary.gold : colors.primary.purple, marginTop: 16 }]}
                onPress={handleCreateSupplier}
              >
                <Text style={styles.saveBtnText}>Создать</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Модалка выбора товара */}
      <Modal visible={showItemModal} transparent animationType="slide" onRequestClose={() => setShowItemModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.background.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text.normal }]}>Выбрать товар</Text>
              <TouchableOpacity onPress={() => setShowItemModal(false)}>
                <Ionicons name="close" size={24} color={colors.text.normal} />
              </TouchableOpacity>
            </View>
            <View style={[styles.searchBox, { backgroundColor: isDark ? '#2a2a2e' : '#f3f4f6' }]}>
              <Ionicons name="search" size={18} color={colors.text.muted} />
              <TextInput
                value={itemSearch}
                onChangeText={setItemSearch}
                style={[styles.searchInput, { color: colors.text.normal }]}
                placeholder="Имя или код"
                placeholderTextColor={colors.text.muted}
              />
            </View>
            <FlatList
              data={filteredItems}
              keyExtractor={(it) => String(it.id)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.pickRow, { borderBottomColor: colors.border.light }]}
                  onPress={() => addLine(item)}
                >
                  <Text style={{ color: colors.text.normal, fontSize: 15 }} numberOfLines={1}>{item.name}</Text>
                  <Text style={{ color: colors.text.muted, fontSize: 12 }}>{item.code}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={{ color: colors.text.muted, textAlign: 'center', marginTop: 20 }}>Товары не найдены</Text>
              }
              style={{ maxHeight: 380 }}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1 },
  backBtn: { padding: 6 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 12, marginTop: 12, marginBottom: 6 },
  selector: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 12, gap: 8,
  },
  selectorText: { flex: 1, fontSize: 15 },
  linesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  lineCard: { padding: 12, borderRadius: 12, marginBottom: 10 },
  lineHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  lineTitle: { flex: 1, fontSize: 15, fontWeight: '600', marginRight: 8 },
  row3: { flexDirection: 'row' },
  smallLabel: { fontSize: 11, marginBottom: 4 },
  smallInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginRight: 6, minWidth: 36, alignItems: 'center' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  bottomBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, gap: 12,
  },
  saveBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { padding: 16, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  searchBox: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, gap: 8, marginBottom: 8 },
  searchInput: { flex: 1, fontSize: 14 },
  newBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 10, paddingVertical: 12, marginBottom: 8 },
  pickRow: { paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1 },
});
