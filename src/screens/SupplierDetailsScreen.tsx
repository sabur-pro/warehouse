// src/screens/SupplierDetailsScreen.tsx
// Карточка поставщика для админа: список поставок, оплаты, итоговый долг.
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, useFocusEffect, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ProfileStackParamList } from '../types/navigation';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../../constants/theme';
import {
  getSupplierAggregate,
  createPayment,
  parseSupplyLines,
  deleteSupplier,
  SupplierAggregate,
} from '../services/SupplierService';
import { PaymentAllocation } from '../../database/types';

type Nav = NativeStackNavigationProp<ProfileStackParamList>;
type Rt = RouteProp<ProfileStackParamList, 'SupplierDetails'>;

const formatDate = (ts: number) => {
  try {
    return new Date(ts).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '';
  }
};

export default function SupplierDetailsScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const { supplierUuid } = route.params;
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);

  const [agg, setAgg] = useState<SupplierAggregate | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPay, setShowPay] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payNote, setPayNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const a = await getSupplierAggregate(supplierUuid);
      setAgg(a);
    } catch (e: any) {
      console.error('SupplierDetails.load:', e);
      Alert.alert('Ошибка', String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [supplierUuid]);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  const handlePay = async () => {
    const n = parseFloat(payAmount.replace(',', '.'));
    if (!n || n <= 0) {
      Alert.alert('Ошибка', 'Введите сумму больше 0');
      return;
    }
    setSaving(true);
    try {
      const res = await createPayment({
        supplierUuid,
        amount: n,
        note: payNote || null,
      });
      setPayAmount('');
      setPayNote('');
      setShowPay(false);
      await load();

      // Покажем разнос: куда пошли деньги
      let breakdown = '';
      if (res.allocations.length > 0 && agg) {
        const lines = res.allocations.map((a, i) => {
          // найти поставку чтобы показать дату
          const sup = agg.supplies.find((s) => s.uuid === a.supplyUuid);
          const dateStr = sup ? formatDate(sup.date) : '';
          return `• ${a.amount.toFixed(2)} → поставка от ${dateStr}`;
        }).join('\n');
        breakdown += lines;
      }
      if (res.unallocated > 0) {
        breakdown += (breakdown ? '\n\n' : '') + `Аванс (поставщик должен): ${res.unallocated.toFixed(2)}`;
      }
      if (breakdown) {
        Alert.alert('Оплата записана', breakdown);
      }
    } catch (e: any) {
      Alert.alert('Ошибка', String(e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!agg?.supplier?.id) return;
    Alert.alert(
      'Удалить поставщика?',
      'Поставки и оплаты сохранятся в истории, но поставщик станет недоступен в списке.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSupplier(agg.supplier.id);
              navigation.goBack();
            } catch (e: any) {
              Alert.alert('Ошибка', String(e?.message || e));
            }
          },
        },
      ]
    );
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

  if (!agg) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background.screen }]}>
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.text.muted} />
          <Text style={{ marginTop: 12, color: colors.text.muted }}>Поставщик не найден</Text>
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 12 }}>
            <Text style={{ color: colors.primary.blue }}>Назад</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const { supplier, supplies, payments, totals } = agg;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.screen }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: colors.border.light }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text.normal} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text.normal }]} numberOfLines={1}>
          {supplier.name}
        </Text>
        <TouchableOpacity onPress={handleDelete} style={styles.backBtn}>
          <Ionicons name="trash-outline" size={22} color="#ef4444" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {/* Контакты */}
        {(supplier.phone || supplier.address || supplier.notes) && (
          <View style={[styles.card, { backgroundColor: colors.background.card }]}>
            {supplier.phone ? (
              <View style={styles.row}>
                <Ionicons name="call-outline" size={16} color={colors.text.muted} />
                <Text style={[styles.rowText, { color: colors.text.normal }]}>{supplier.phone}</Text>
              </View>
            ) : null}
            {supplier.address ? (
              <View style={styles.row}>
                <Ionicons name="location-outline" size={16} color={colors.text.muted} />
                <Text style={[styles.rowText, { color: colors.text.normal }]}>{supplier.address}</Text>
              </View>
            ) : null}
            {supplier.notes ? (
              <View style={styles.row}>
                <Ionicons name="document-text-outline" size={16} color={colors.text.muted} />
                <Text style={[styles.rowText, { color: colors.text.muted }]}>{supplier.notes}</Text>
              </View>
            ) : null}
          </View>
        )}

        {/* Итоги */}
        <View style={[styles.totalsCard, { backgroundColor: colors.background.card }]}>
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: colors.text.muted }]}>Поставлено всего</Text>
            <Text style={[styles.totalValue, { color: colors.text.normal }]}>{totals.totalSupplied.toFixed(2)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: colors.text.muted }]}>Оплачено</Text>
            <Text style={[styles.totalValue, { color: colors.text.normal }]}>{totals.totalPaid.toFixed(2)}</Text>
          </View>
          <View style={[styles.totalRow, { borderTopWidth: 1, borderTopColor: colors.border.light, paddingTop: 8, marginTop: 4 }]}>
            {totals.debt > 0 ? (
              <>
                <Text style={[styles.totalLabel, { color: colors.text.normal, fontWeight: '700' }]}>Мы должны</Text>
                <Text style={[styles.totalValue, { color: '#ef4444', fontWeight: '700' }]}>{totals.debt.toFixed(2)}</Text>
              </>
            ) : totals.debt < 0 ? (
              <>
                <Text style={[styles.totalLabel, { color: colors.text.normal, fontWeight: '700' }]}>Поставщик должен</Text>
                <Text style={[styles.totalValue, { color: '#10b981', fontWeight: '700' }]}>{Math.abs(totals.debt).toFixed(2)}</Text>
              </>
            ) : (
              <>
                <Text style={[styles.totalLabel, { color: colors.text.normal, fontWeight: '700' }]}>Расчёт сошёлся</Text>
                <Text style={[styles.totalValue, { color: '#10b981', fontWeight: '700' }]}>0.00</Text>
              </>
            )}
          </View>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: isDark ? colors.primary.gold : colors.primary.purple }]}
            onPress={() => setShowPay(true)}
          >
            <Ionicons name="cash-outline" size={18} color="#fff" />
            <Text style={styles.actionBtnText}>Оплатить</Text>
          </TouchableOpacity>
        </View>

        {/* История поставок */}
        <Text style={[styles.section, { color: colors.text.normal }]}>Поставки ({supplies.length})</Text>
        {supplies.length === 0 ? (
          <Text style={{ color: colors.text.muted, marginBottom: 16 }}>Поставок ещё не было</Text>
        ) : (
          supplies.map((s) => {
            const lines = parseSupplyLines(s.lines);
            const totalCovered = (s.paidAmount || 0) + (s.allocatedFromPayments || 0);
            const remaining = s.remaining;
            return (
              <View key={s.id} style={[styles.supplyCard, { backgroundColor: colors.background.card }]}>
                <View style={styles.supplyHeader}>
                  <Text style={[styles.supplyDate, { color: colors.text.muted }]}>{formatDate(s.date)}</Text>
                  <Text style={[styles.supplyTotal, { color: colors.text.normal }]}>
                    {s.totalAmount.toFixed(2)}
                  </Text>
                </View>
                {lines.map((l, i) => (
                  <View key={i} style={styles.lineRow}>
                    <Text style={[styles.lineName, { color: colors.text.normal }]} numberOfLines={1}>
                      {l.itemName}
                      {l.size !== undefined && l.size !== '' ? ` (р. ${l.size})` : ''}
                    </Text>
                    <Text style={[styles.lineQty, { color: colors.text.muted }]}>
                      {l.quantity} × {(l.unitPrice || 0).toFixed(2)}
                    </Text>
                  </View>
                ))}

                {/* Откуда покрыта эта поставка */}
                <View style={[styles.supplyFooter, { borderTopColor: colors.border.light }]}>
                  <Text style={{ color: colors.text.muted, fontSize: 12 }}>
                    Покрыто: {totalCovered.toFixed(2)} из {s.totalAmount.toFixed(2)}
                  </Text>
                  <Text style={{ color: remaining > 0 ? '#ef4444' : '#10b981', fontSize: 12, fontWeight: '600' }}>
                    {remaining > 0 ? `Должны ${remaining.toFixed(2)}` : 'Полностью оплачено'}
                  </Text>
                </View>

                {/* Breakdown: какие оплаты вошли в эту поставку */}
                {(s.paidAmount > 0 || s.paymentBreakdown.length > 0) && (
                  <View style={styles.breakdownBox}>
                    {s.paidAmount > 0 && (
                      <View style={styles.breakdownRow}>
                        <Ionicons name="ellipse" size={6} color={colors.text.muted} style={{ marginRight: 6 }} />
                        <Text style={{ color: colors.text.muted, fontSize: 11, flex: 1 }}>
                          {s.paidAmount.toFixed(2)} — оплата при оформлении
                        </Text>
                      </View>
                    )}
                    {s.paymentBreakdown.map((b, i) => (
                      <View key={i} style={styles.breakdownRow}>
                        <Ionicons name="ellipse" size={6} color="#10b981" style={{ marginRight: 6 }} />
                        <Text style={{ color: colors.text.muted, fontSize: 11, flex: 1 }}>
                          {b.amount.toFixed(2)} — оплата от {formatDate(b.paymentDate)}
                          {b.note ? ` (${b.note})` : ''}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {s.note ? (
                  <Text style={{ color: colors.text.muted, fontSize: 12, marginTop: 6 }}>{s.note}</Text>
                ) : null}
              </View>
            );
          })
        )}

        {/* Доп. оплаты */}
        {payments.length > 0 && (
          <>
            <Text style={[styles.section, { color: colors.text.normal }]}>Оплаты ({payments.length})</Text>
            {payments.map((p) => {
              let allocs: PaymentAllocation[] = [];
              try { allocs = JSON.parse(p.allocations || '[]'); } catch {}
              const allocatedTotal = allocs.reduce((s, a) => s + (a.amount || 0), 0);
              const advance = Math.max(0, (p.amount || 0) - allocatedTotal);
              return (
                <View key={p.id} style={[styles.paymentCardFull, { backgroundColor: colors.background.card }]}>
                  <View style={styles.paymentTopRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text.normal, fontWeight: '700', fontSize: 15 }}>
                        {p.amount.toFixed(2)}
                      </Text>
                      <Text style={{ color: colors.text.muted, fontSize: 12 }}>{formatDate(p.date)}</Text>
                      {p.note ? <Text style={{ color: colors.text.muted, fontSize: 12 }}>{p.note}</Text> : null}
                    </View>
                    <Ionicons name="cash" size={22} color="#10b981" />
                  </View>

                  {/* Куда пошли деньги */}
                  {(allocs.length > 0 || advance > 0) && (
                    <View style={styles.breakdownBox}>
                      {allocs.map((a, i) => {
                        const sup = supplies.find((s) => s.uuid === a.supplyUuid);
                        return (
                          <View key={i} style={styles.breakdownRow}>
                            <Ionicons name="arrow-forward" size={11} color={colors.text.muted} style={{ marginRight: 6 }} />
                            <Text style={{ color: colors.text.muted, fontSize: 11, flex: 1 }}>
                              −{a.amount.toFixed(2)} с поставки от {sup ? formatDate(sup.date) : '?'}
                            </Text>
                          </View>
                        );
                      })}
                      {advance > 0 && (
                        <View style={styles.breakdownRow}>
                          <Ionicons name="arrow-down" size={11} color="#10b981" style={{ marginRight: 6 }} />
                          <Text style={{ color: '#10b981', fontSize: 11, flex: 1, fontWeight: '600' }}>
                            +{advance.toFixed(2)} аванс (поставщик должен)
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      <Modal visible={showPay} animationType="slide" transparent onRequestClose={() => setShowPay(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalSheet, { backgroundColor: colors.background.card }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.text.normal }]}>Оплата поставщику</Text>
                <TouchableOpacity onPress={() => setShowPay(false)}>
                  <Ionicons name="close" size={24} color={colors.text.normal} />
                </TouchableOpacity>
              </View>
              <Text style={[styles.label, { color: colors.text.muted }]}>Сумма</Text>
              <TextInput
                value={payAmount}
                onChangeText={setPayAmount}
                style={[styles.input, { color: colors.text.normal, borderColor: colors.border.light }]}
                placeholder="0.00"
                placeholderTextColor={colors.text.muted}
                keyboardType="decimal-pad"
              />
              <Text style={[styles.label, { color: colors.text.muted }]}>Заметка</Text>
              <TextInput
                value={payNote}
                onChangeText={setPayNote}
                style={[styles.input, { color: colors.text.normal, borderColor: colors.border.light }]}
                placeholderTextColor={colors.text.muted}
              />
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: isDark ? colors.primary.gold : colors.primary.purple }]}
                onPress={handlePay}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Сохранить оплату</Text>}
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
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { padding: 14, borderRadius: 12, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  rowText: { fontSize: 14, marginLeft: 6 },
  totalsCard: { padding: 14, borderRadius: 12, marginBottom: 12 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  totalLabel: { fontSize: 14 },
  totalValue: { fontSize: 14, fontWeight: '600' },
  actionRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  actionBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  actionBtnText: { color: '#fff', fontWeight: '700' },
  section: { fontSize: 16, fontWeight: '700', marginTop: 8, marginBottom: 8 },
  supplyCard: { padding: 12, borderRadius: 10, marginBottom: 8 },
  supplyHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  supplyDate: { fontSize: 12 },
  supplyTotal: { fontSize: 15, fontWeight: '700' },
  lineRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  lineName: { flex: 1, fontSize: 13 },
  lineQty: { fontSize: 13, marginLeft: 8 },
  supplyFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTopWidth: 1 },
  paymentCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, marginBottom: 8 },
  paymentCardFull: { padding: 12, borderRadius: 10, marginBottom: 8 },
  paymentTopRow: { flexDirection: 'row', alignItems: 'center' },
  breakdownBox: { marginTop: 8, paddingTop: 8, paddingHorizontal: 4, borderTopWidth: 1, borderTopColor: 'rgba(127,127,127,0.15)' },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  label: { fontSize: 12, marginBottom: 6, marginTop: 10 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  saveBtn: { marginTop: 16, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
