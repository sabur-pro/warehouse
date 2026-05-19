// src/screens/CatalogsScreen.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../../constants/theme';
import { useCatalogs } from '../contexts/CatalogsContext';
import type { ProfileStackParamList } from '../types/navigation';
import type { Catalog } from '../../database/types';
import { CatalogIcon } from '../components/common/CatalogIcon';
import { TEMPLATE_GROUPS } from '../config/catalogTemplates';

type Nav = NativeStackNavigationProp<ProfileStackParamList, 'Catalogs'>;

const CatalogsScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);
  const { catalogs, loading, toggleEnabled, deleteCatalog, applyTemplate, templates } = useCatalogs();

  const [showTemplates, setShowTemplates] = useState(false);
  const [busy, setBusy] = useState(false);

  const accent = isDark ? colors.primary.gold : colors.primary.blue;

  const handleDelete = async (cat: Catalog) => {
    const result = await deleteCatalog(cat.id);
    if (!result.deleted && result.usedBy && result.usedBy > 0) {
      const others = catalogs.filter((c) => c.id !== cat.id && !c.isDeleted);
      if (others.length === 0) {
        Alert.alert(
          'Нельзя удалить',
          `В этом каталоге ${result.usedBy} товар(ов), но это последний каталог. Создайте новый прежде чем удалять.`,
        );
        return;
      }
      Alert.alert(
        'В каталоге есть товары',
        `В каталоге "${cat.name}" числится ${result.usedBy} товар(ов). Куда их перенести?`,
        [
          { text: 'Отмена', style: 'cancel' },
          ...others.slice(0, 3).map((other) => ({
            text: `→ ${other.name}`,
            onPress: async () => {
              const r2 = await deleteCatalog(cat.id, { reassignTo: other.name });
              if (r2.deleted) Alert.alert('Готово', `Каталог удалён, товары переведены в "${other.name}"`);
            },
          })),
        ],
      );
    }
  };

  const confirmDelete = (cat: Catalog) => {
    Alert.alert(
      'Удалить каталог?',
      `Каталог "${cat.name}" будет удалён.`,
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Удалить', style: 'destructive', onPress: () => handleDelete(cat) },
      ],
    );
  };

  const onApplyTemplate = async (templateId: string) => {
    try {
      setBusy(true);
      const res = await applyTemplate(templateId);
      setShowTemplates(false);
      Alert.alert(
        'Шаблон применён',
        `Добавлено каталогов: ${res.added}${res.skipped > 0 ? `, пропущено (уже есть): ${res.skipped}` : ''}`,
      );
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message || 'Не удалось применить шаблон');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.screen }]}>
      <View style={[styles.header, { backgroundColor: colors.background.card, borderBottomColor: colors.border.light }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text.normal} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text.normal }]}>Каталоги товаров</Text>
        <TouchableOpacity onPress={() => navigation.navigate('CatalogEdit', { catalogId: undefined })}>
          <MaterialIcons name="add" size={28} color={accent} />
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        <TouchableOpacity
          style={[styles.templateBtn, { backgroundColor: colors.background.card, borderColor: colors.border.light }]}
          onPress={() => setShowTemplates(true)}
          activeOpacity={0.7}
        >
          <MaterialIcons name="auto-awesome" size={22} color={accent} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[styles.templateTitle, { color: colors.text.normal }]}>Применить шаблон</Text>
            <Text style={[styles.templateDesc, { color: colors.text.muted }]}>
              Готовые каталоги для продуктового, овощного, аксессуаров и др.
            </Text>
          </View>
          <MaterialIcons name="chevron-right" size={24} color={colors.text.muted} />
        </TouchableOpacity>

        {loading ? (
          <View style={{ padding: 32, alignItems: 'center' }}>
            <ActivityIndicator size="large" color={accent} />
          </View>
        ) : catalogs.length === 0 ? (
          <View style={{ padding: 32, alignItems: 'center' }}>
            <Text style={{ color: colors.text.muted }}>Каталогов нет. Добавьте первый.</Text>
          </View>
        ) : (
          catalogs.map((cat) => (
            <View
              key={cat.id}
              style={[styles.catalogCard, { backgroundColor: colors.background.card, borderColor: colors.border.light }]}
            >
              <View style={styles.catalogIconWrap}>
                <CatalogIcon value={cat.icon} size={28} color={accent} />
              </View>
              <TouchableOpacity
                style={{ flex: 1, marginLeft: 12 }}
                onPress={() => navigation.navigate('CatalogEdit', { catalogId: cat.id })}
                activeOpacity={0.7}
              >
                <Text style={[styles.catalogName, { color: colors.text.normal }]}>{cat.name}</Text>
                <Text style={[styles.catalogMeta, { color: colors.text.muted }]} numberOfLines={1}>
                  {cat.sizeTypes.length === 0
                    ? 'Без размерных рядов'
                    : `${cat.sizeTypes.length} размерн. ряд(ов): ${cat.sizeTypes.map((s) => s.name).join(', ')}`}
                </Text>
              </TouchableOpacity>
              <Switch
                value={cat.isEnabled}
                onValueChange={(v) => toggleEnabled(cat.id, v)}
                trackColor={{ true: accent }}
              />
              <TouchableOpacity onPress={() => confirmDelete(cat)} style={styles.deleteBtn}>
                <MaterialIcons name="delete-outline" size={22} color="#ef4444" />
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={showTemplates} transparent animationType="slide" onRequestClose={() => setShowTemplates(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text.normal }]}>Шаблоны каталогов</Text>
              <TouchableOpacity onPress={() => setShowTemplates(false)}>
                <MaterialIcons name="close" size={24} color={colors.text.normal} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 540 }}>
              {TEMPLATE_GROUPS.map((group) => {
                const items = templates.filter((t) => t.group === group.id);
                if (items.length === 0) return null;
                return (
                  <View key={group.id}>
                    <Text style={[styles.groupHeader, { color: colors.text.muted }]}>{group.label}</Text>
                    {items.map((tpl) => (
                      <TouchableOpacity
                        key={tpl.id}
                        style={[styles.templateRow, { borderBottomColor: colors.border.light }]}
                        onPress={() => onApplyTemplate(tpl.id)}
                        disabled={busy}
                        activeOpacity={0.7}
                      >
                        <View style={styles.templateIconCol}>
                          <CatalogIcon value={tpl.catalogs[0]?.icon} size={26} color={accent} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.templateRowTitle, { color: colors.text.normal }]}>{tpl.name}</Text>
                          {tpl.description ? (
                            <Text style={[styles.templateRowDesc, { color: colors.text.muted }]} numberOfLines={2}>
                              {tpl.description}
                            </Text>
                          ) : null}
                          <Text style={[styles.templateRowCatalogs, { color: colors.text.muted }]} numberOfLines={1}>
                            {tpl.catalogs.map((c) => c.name).join(' · ')}
                          </Text>
                        </View>
                        <MaterialIcons name="chevron-right" size={22} color={colors.text.muted} />
                      </TouchableOpacity>
                    ))}
                  </View>
                );
              })}
              {templates.filter((t) => !t.group).map((tpl) => (
                <TouchableOpacity
                  key={tpl.id}
                  style={[styles.templateRow, { borderBottomColor: colors.border.light }]}
                  onPress={() => onApplyTemplate(tpl.id)}
                  disabled={busy}
                  activeOpacity={0.7}
                >
                  <View style={styles.templateIconCol}>
                    <CatalogIcon value={tpl.catalogs[0]?.icon} size={26} color={accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.templateRowTitle, { color: colors.text.normal }]}>{tpl.name}</Text>
                    {tpl.description ? (
                      <Text style={[styles.templateRowDesc, { color: colors.text.muted }]} numberOfLines={2}>
                        {tpl.description}
                      </Text>
                    ) : null}
                    <Text style={[styles.templateRowCatalogs, { color: colors.text.muted }]} numberOfLines={1}>
                      {tpl.catalogs.map((c) => c.name).join(' · ')}
                    </Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={22} color={colors.text.muted} />
                </TouchableOpacity>
              ))}
            </ScrollView>
            {busy ? <ActivityIndicator style={{ marginTop: 12 }} color={accent} /> : null}
          </View>
        </View>
      </Modal>
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
  templateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  templateTitle: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  templateDesc: { fontSize: 12 },
  catalogCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  catalogIcon: { fontSize: 28 },
  catalogIconWrap: { width: 40, alignItems: 'center', justifyContent: 'center' },
  groupHeader: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 14,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  catalogName: { fontSize: 16, fontWeight: '600' },
  catalogMeta: { fontSize: 12, marginTop: 2 },
  deleteBtn: { padding: 6, marginLeft: 6 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, paddingBottom: 32 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  templateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  templateIconCol: {
    width: 36,
    alignItems: 'center',
    marginRight: 8,
  },
  templateRowTitle: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
  templateRowDesc: { fontSize: 12, marginBottom: 2 },
  templateRowCatalogs: { fontSize: 11 },
});

export default CatalogsScreen;
