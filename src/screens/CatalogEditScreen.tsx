// src/screens/CatalogEditScreen.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../../constants/theme';
import { useCatalogs } from '../contexts/CatalogsContext';
import type { ProfileStackParamList } from '../types/navigation';

type Nav = NativeStackNavigationProp<ProfileStackParamList, 'CatalogEdit'>;
type Route = RouteProp<ProfileStackParamList, 'CatalogEdit'>;

interface DraftSizeType {
  id?: string;
  name: string;
  sizesText: string; // запятая-разделитель
}

const ICON_PRESETS = ['📦', '👟', '👕', '🥛', '🍞', '🌾', '🥕', '🍎', '🌿', '👜', '🪢', '⌚', '🕶'];

const CatalogEditScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const catalogId = route.params?.catalogId;
  const isNew = catalogId === undefined;

  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);
  const accent = isDark ? colors.primary.gold : colors.primary.blue;
  const { catalogs, addCatalog, updateCatalog } = useCatalogs();

  const initial = useMemo(
    () => (isNew ? null : catalogs.find((c) => c.id === catalogId) ?? null),
    [catalogId, catalogs, isNew],
  );

  const [name, setName] = useState(initial?.name ?? '');
  const [icon, setIcon] = useState<string>(initial?.icon ?? '📦');
  const [sizeTypes, setSizeTypes] = useState<DraftSizeType[]>(
    () =>
      initial?.sizeTypes.map((st) => ({
        id: st.id,
        name: st.name,
        sizesText: st.sizes.map((s) => String(s)).join(', '),
      })) ?? [],
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initial) {
      setName(initial.name);
      setIcon(initial.icon ?? '📦');
      setSizeTypes(
        initial.sizeTypes.map((st) => ({
          id: st.id,
          name: st.name,
          sizesText: st.sizes.map((s) => String(s)).join(', '),
        })),
      );
    }
  }, [initial]);

  const addSizeType = () => setSizeTypes((prev) => [...prev, { name: '', sizesText: '' }]);
  const removeSizeType = (idx: number) =>
    setSizeTypes((prev) => prev.filter((_, i) => i !== idx));
  const patchSizeType = (idx: number, patch: Partial<DraftSizeType>) =>
    setSizeTypes((prev) => prev.map((st, i) => (i === idx ? { ...st, ...patch } : st)));

  const parseSizes = (text: string): (string | number)[] =>
    text
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => {
        const n = Number(s);
        return Number.isFinite(n) && /^[-+]?\d+(?:\.\d+)?$/.test(s) ? n : s;
      });

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Имя обязательно', 'Введите название каталога');
      return;
    }
    const sized = sizeTypes
      .map((st) => ({
        id: st.id,
        name: st.name.trim(),
        sizes: parseSizes(st.sizesText),
      }))
      .filter((st) => st.name.length > 0);

    if (sized.length === 0) {
      Alert.alert(
        'Размерные ряды',
        'Добавьте хотя бы один размерный ряд (например: "Без размера" с одним значением "—")',
      );
      return;
    }

    try {
      setSaving(true);
      if (isNew) {
        await addCatalog({
          name: name.trim(),
          icon: icon || null,
          sizeTypes: sized,
          isEnabled: true,
          sortOrder: 0,
        });
      } else if (catalogId !== undefined) {
        await updateCatalog(catalogId, {
          name: name.trim(),
          icon: icon || null,
          sizeTypes: sized,
        });
      }
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message || 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.screen }]}>
      <View style={[styles.header, { backgroundColor: colors.background.card, borderBottomColor: colors.border.light }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text.normal} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text.normal }]}>
          {isNew ? 'Новый каталог' : 'Редактировать каталог'}
        </Text>
        <TouchableOpacity onPress={handleSave} disabled={saving}>
          <Text style={[styles.saveBtn, { color: accent, opacity: saving ? 0.5 : 1 }]}>
            {saving ? '...' : 'Сохранить'}
          </Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
          <Text style={[styles.label, { color: colors.text.muted }]}>Название</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.background.card, color: colors.text.normal, borderColor: colors.border.light }]}
            value={name}
            onChangeText={setName}
            placeholder="Например: Овощи"
            placeholderTextColor={colors.text.muted}
          />

          <Text style={[styles.label, { color: colors.text.muted, marginTop: 16 }]}>Иконка</Text>
          <View style={styles.iconRow}>
            {ICON_PRESETS.map((emoji) => (
              <TouchableOpacity
                key={emoji}
                style={[
                  styles.iconBtn,
                  { backgroundColor: colors.background.card, borderColor: colors.border.light },
                  icon === emoji && { borderColor: accent, borderWidth: 2 },
                ]}
                onPress={() => setIcon(emoji)}
              >
                <Text style={{ fontSize: 22 }}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={[styles.sectionHeaderRow]}>
            <Text style={[styles.sectionTitle, { color: colors.text.normal }]}>Размерные ряды</Text>
            <TouchableOpacity onPress={addSizeType} style={[styles.addBtn, { borderColor: accent }]}>
              <MaterialIcons name="add" size={18} color={accent} />
              <Text style={[styles.addBtnText, { color: accent }]}>Добавить</Text>
            </TouchableOpacity>
          </View>

          {sizeTypes.length === 0 ? (
            <View
              style={[styles.emptyHint, { backgroundColor: colors.background.card, borderColor: colors.border.light }]}
            >
              <Text style={{ color: colors.text.muted, textAlign: 'center' }}>
                Размерных рядов нет. Добавьте хотя бы один — например, для овощей это может быть «вес» с
                значениями «1кг, 500г, штука».
              </Text>
            </View>
          ) : (
            sizeTypes.map((st, idx) => (
              <View
                key={`${st.id ?? 'new'}-${idx}`}
                style={[styles.sizeTypeCard, { backgroundColor: colors.background.card, borderColor: colors.border.light }]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <TextInput
                    style={[styles.input, { flex: 1, marginBottom: 0, backgroundColor: 'transparent', color: colors.text.normal, borderColor: colors.border.light }]}
                    value={st.name}
                    onChangeText={(v) => patchSizeType(idx, { name: v })}
                    placeholder="Название ряда (например, фасовка)"
                    placeholderTextColor={colors.text.muted}
                  />
                  <TouchableOpacity onPress={() => removeSizeType(idx)} style={{ marginLeft: 8 }}>
                    <MaterialIcons name="delete-outline" size={22} color="#ef4444" />
                  </TouchableOpacity>
                </View>
                <Text style={[styles.label, { color: colors.text.muted }]}>Значения (через запятую)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: 'transparent', color: colors.text.normal, borderColor: colors.border.light, minHeight: 60 }]}
                  value={st.sizesText}
                  onChangeText={(v) => patchSizeType(idx, { sizesText: v })}
                  placeholder="1кг, 500г, штука"
                  placeholderTextColor={colors.text.muted}
                  multiline
                />
              </View>
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', flex: 1, textAlign: 'center', marginHorizontal: 8 },
  saveBtn: { fontSize: 15, fontWeight: '700' },
  label: { fontSize: 12, marginBottom: 6, marginLeft: 4 },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  iconRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    marginBottom: 8,
  },
  sectionHeaderRow: {
    marginTop: 22,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
  },
  addBtnText: { fontSize: 13, fontWeight: '600', marginLeft: 4 },
  sizeTypeCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  emptyHint: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
});

export default CatalogEditScreen;
