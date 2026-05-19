// src/screens/SuppliersScreen.tsx
// Список поставщиков (admin only). Показывает имя, телефон, и текущий долг (наш долг им).
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ProfileStackParamList } from '../types/navigation';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { getThemeColors } from '../../constants/theme';
import {
  listSuppliers,
  createSupplier,
  getSupplierAggregate,
} from '../services/SupplierService';
import { Supplier } from '../../database/types';

type Nav = NativeStackNavigationProp<ProfileStackParamList>;

interface SupplierWithDebt extends Supplier {
  debt: number;
  totalSupplied: number;
}

export default function SuppliersScreen() {
  const navigation = useNavigation<Nav>();
  const { isDark } = useTheme();
  const { isAdmin } = useAuth();
  const colors = getThemeColors(isDark);

  const [rows, setRows] = useState<SupplierWithDebt[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  // Поля формы
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const list = await listSuppliers();
      // Получаем сводку по каждому, чтобы показать долг.
      // Для оптимизации можно сделать batch, но обычно поставщиков немного.
      const enriched: SupplierWithDebt[] = await Promise.all(
        list.map(async (s) => {
          const agg = s.uuid ? await getSupplierAggregate(s.uuid) : null;
          return {
            ...s,
            debt: agg?.totals.debt ?? 0,
            totalSupplied: agg?.totals.totalSupplied ?? 0,
          };
        })
      );
      setRows(enriched);
    } catch (e: any) {
      console.error('SuppliersScreen.load:', e);
      Alert.alert('Ошибка', 'Не удалось загрузить поставщиков');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) =>
      r.name.toLowerCase().includes(q) || (r.phone || '').includes(search)
    );
  }, [rows, search]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        supplied: acc.supplied + r.totalSupplied,
        debt: acc.debt + r.debt,
      }),
      { supplied: 0, debt: 0 }
    );
  }, [rows]);

  const handleAdd = async () => {
    if (!name.trim()) {
      Alert.alert('Ошибка', 'Введите имя поставщика');
      return;
    }
    setSaving(true);
    try {
      await createSupplier({ name, phone, address, notes });
      setName('');
      setPhone('');
      setAddress('');
      setNotes('');
      setShowAdd(false);
      await load();
    } catch (e: any) {
      Alert.alert('Ошибка', String(e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin()) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background.screen }]}>
        <View style={styles.centered}>
          <Ionicons name="lock-closed" size={48} color={colors.text.muted} />
          <Text style={{ marginTop: 12, color: colors.text.muted }}>Раздел доступен только администратору</Text>
        </View>
      </SafeAreaView>
    );
  }

  const renderItem = ({ item }: { item: SupplierWithDebt }) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.background.card, borderColor: colors.border.light }]}
      onPress={() => item.uuid && navigation.navigate('SupplierDetails', { supplierUuid: item.uuid })}
      activeOpacity={0.7}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.name, { color: colors.text.normal }]}>{item.name}</Text>
        {item.phone ? <Text style={[styles.phone, { color: colors.text.muted }]}>{item.phone}</Text> : null}
        <Text style={[styles.metric, { color: colors.text.muted }]}>
          Поставлено: <Text style={{ fontWeight: '700', color: colors.text.normal }}>{item.totalSupplied.toFixed(2)}</Text>
        </Text>
      </View>
      <View style={styles.right}>
        <View
          style={[
            styles.debtBadge,
            {
              backgroundColor:
                item.debt > 0
                  ? (isDark ? 'rgba(239,68,68,0.18)' : 'rgba(239,68,68,0.10)')
                  : (isDark ? 'rgba(16,185,129,0.18)' : 'rgba(16,185,129,0.10)'),
            },
          ]}
        >
          <Text style={[styles.debtText, { color: item.debt > 0 ? '#ef4444' : '#10b981' }]}>
            {item.debt > 0 ? `Долг: ${item.debt.toFixed(2)}` : 'Долга нет'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.text.muted} style={{ marginTop: 8 }} />
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.screen }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border.light }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text.normal} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text.normal }]}>Поставщики</Text>
        <TouchableOpacity onPress={() => setShowAdd(true)} style={styles.backBtn}>
          <Ionicons name="add" size={26} color={isDark ? colors.primary.gold : colors.primary.purple} />
        </TouchableOpacity>
      </View>

      {/* Сводка */}
      <View style={styles.summary}>
        <View style={[styles.summaryBox, { backgroundColor: colors.background.card }]}>
          <Text style={[styles.summaryLabel, { color: colors.text.muted }]}>Всего поставлено</Text>
          <Text style={[styles.summaryValue, { color: colors.text.normal }]}>{totals.supplied.toFixed(2)}</Text>
        </View>
        <View style={[styles.summaryBox, { backgroundColor: colors.background.card }]}>
          <Text style={[styles.summaryLabel, { color: colors.text.muted }]}>Общий долг</Text>
          <Text style={[styles.summaryValue, { color: totals.debt > 0 ? '#ef4444' : '#10b981' }]}>
            {totals.debt.toFixed(2)}
          </Text>
        </View>
      </View>

      {/* Поиск */}
      <View style={[styles.searchBox, { backgroundColor: colors.background.card }]}>
        <Ionicons name="search" size={20} color={colors.text.muted} style={{ marginRight: 8 }} />
        <TextInput
          style={[styles.searchInput, { color: colors.text.normal }]}
          placeholder="Поиск..."
          placeholderTextColor={colors.text.muted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary.blue} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          renderItem={renderItem}
          keyExtractor={(it) => String(it.id)}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="business-outline" size={56} color={colors.text.muted} />
              <Text style={{ marginTop: 12, color: colors.text.muted }}>Список пуст</Text>
            </View>
          }
        />
      )}

      {/* Модалка добавления */}
      <Modal visible={showAdd} animationType="slide" transparent onRequestClose={() => setShowAdd(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalSheet, { backgroundColor: colors.background.card }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.text.normal }]}>Новый поставщик</Text>
                <TouchableOpacity onPress={() => setShowAdd(false)}>
                  <Ionicons name="close" size={24} color={colors.text.normal} />
                </TouchableOpacity>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled">
                <Text style={[styles.label, { color: colors.text.muted }]}>Имя *</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  style={[styles.input, { color: colors.text.normal, borderColor: colors.border.light }]}
                  placeholderTextColor={colors.text.muted}
                  placeholder="ООО Пример"
                />
                <Text style={[styles.label, { color: colors.text.muted }]}>Телефон</Text>
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  style={[styles.input, { color: colors.text.normal, borderColor: colors.border.light }]}
                  placeholderTextColor={colors.text.muted}
                  keyboardType="phone-pad"
                />
                <Text style={[styles.label, { color: colors.text.muted }]}>Адрес</Text>
                <TextInput
                  value={address}
                  onChangeText={setAddress}
                  style={[styles.input, { color: colors.text.normal, borderColor: colors.border.light }]}
                  placeholderTextColor={colors.text.muted}
                />
                <Text style={[styles.label, { color: colors.text.muted }]}>Заметки</Text>
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  style={[styles.input, { color: colors.text.normal, borderColor: colors.border.light, height: 80 }]}
                  placeholderTextColor={colors.text.muted}
                  multiline
                />
              </ScrollView>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: isDark ? colors.primary.gold : colors.primary.purple }]}
                onPress={handleAdd}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Сохранить</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1 },
  backBtn: { padding: 6 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700' },
  summary: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  summaryBox: { flex: 1, padding: 12, borderRadius: 12 },
  summaryLabel: { fontSize: 12 },
  summaryValue: { fontSize: 18, fontWeight: '700', marginTop: 4 },
  searchBox: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10 },
  searchInput: { flex: 1, fontSize: 14 },
  card: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  name: { fontSize: 16, fontWeight: '700' },
  phone: { fontSize: 13, marginTop: 2 },
  metric: { fontSize: 12, marginTop: 6 },
  right: { alignItems: 'flex-end' },
  debtBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  debtText: { fontSize: 12, fontWeight: '700' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  label: { fontSize: 12, marginBottom: 6, marginTop: 10 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  saveBtn: { marginTop: 16, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
