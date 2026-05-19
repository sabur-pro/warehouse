// src/components/warehouse/ItemAttributesEditor.tsx
// Универсальный редактор доп. параметров товара (цвет, материал, бренд и т.п.).
// Используется и в форме создания, и в форме редактирования товара.

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { AttributeType } from '../../../database/types';
import { useTheme } from '../../contexts/ThemeContext';
import { getThemeColors } from '../../../constants/theme';
import { CatalogTemplateAttribute } from '../../config/catalogTemplates';

export interface DraftAttribute {
  /** Если редактируем существующий — local id из БД */
  id?: number;
  name: string;
  value: string;
  attrType: AttributeType;
  unit?: string | null;
  options?: string[];
}

interface Props {
  attributes: DraftAttribute[];
  onChange: (next: DraftAttribute[]) => void;
  /** Подсказки атрибутов от шаблона каталога */
  suggestions?: CatalogTemplateAttribute[];
}

export const COLOR_SWATCHES: { name: string; hex: string }[] = [
  { name: 'чёрный', hex: '#111827' },
  { name: 'белый', hex: '#f9fafb' },
  { name: 'серый', hex: '#9ca3af' },
  { name: 'красный', hex: '#ef4444' },
  { name: 'синий', hex: '#3b82f6' },
  { name: 'зелёный', hex: '#22c55e' },
  { name: 'жёлтый', hex: '#facc15' },
  { name: 'оранжевый', hex: '#f97316' },
  { name: 'розовый', hex: '#ec4899' },
  { name: 'фиолетовый', hex: '#8b5cf6' },
  { name: 'коричневый', hex: '#92400e' },
  { name: 'бежевый', hex: '#e5d3b3' },
  { name: 'голубой', hex: '#38bdf8' },
  { name: 'бирюзовый', hex: '#14b8a6' },
];

const findSwatch = (name: string) =>
  COLOR_SWATCHES.find((s) => s.name.toLowerCase() === name.toLowerCase());

const ItemAttributesEditor: React.FC<Props> = ({ attributes, onChange, suggestions = [] }) => {
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);
  const accent = isDark ? colors.primary.gold : colors.primary.blue;

  const [showCustom, setShowCustom] = useState(false);
  const [customName, setCustomName] = useState('');

  const usedNames = useMemo(
    () => new Set(attributes.map((a) => a.name.trim().toLowerCase())),
    [attributes],
  );

  const remainingSuggestions = useMemo(
    () => suggestions.filter((s) => !usedNames.has(s.name.trim().toLowerCase())),
    [suggestions, usedNames],
  );

  const update = (idx: number, patch: Partial<DraftAttribute>) => {
    const next = attributes.map((a, i) => (i === idx ? { ...a, ...patch } : a));
    onChange(next);
  };

  const remove = (idx: number) => {
    onChange(attributes.filter((_, i) => i !== idx));
  };

  const addFromSuggestion = (s: CatalogTemplateAttribute) => {
    onChange([
      ...attributes,
      {
        name: s.name,
        value: '',
        attrType: s.type ?? 'text',
        unit: s.unit ?? null,
        options: s.options,
      },
    ]);
  };

  const addCustom = () => {
    const name = customName.trim();
    if (!name) return;
    onChange([...attributes, { name, value: '', attrType: 'text' }]);
    setCustomName('');
    setShowCustom(false);
  };

  return (
    <View>
      {attributes.length === 0 && remainingSuggestions.length === 0 ? (
        <View style={[styles.emptyHint, { borderColor: colors.border.light }]}>
          <Text style={{ color: colors.text.muted, textAlign: 'center', fontSize: 13 }}>
            Доп. параметры можно добавить позже
          </Text>
        </View>
      ) : null}

      {attributes.map((attr, idx) => (
        <View
          key={`${attr.id ?? 'new'}-${idx}`}
          style={[styles.row, { backgroundColor: colors.background.card, borderColor: colors.border.light }]}
        >
          <View style={styles.rowHeader}>
            <Text style={[styles.attrName, { color: colors.text.normal }]} numberOfLines={1}>
              {attr.name}
              {attr.unit ? <Text style={{ color: colors.text.muted, fontSize: 12 }}>  ({attr.unit})</Text> : null}
            </Text>
            <TouchableOpacity onPress={() => remove(idx)} hitSlop={10}>
              <MaterialCommunityIcons name="close" size={20} color={colors.text.muted} />
            </TouchableOpacity>
          </View>

          {attr.attrType === 'color' ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
              {COLOR_SWATCHES.map((swatch) => {
                const selected = attr.value.toLowerCase() === swatch.name.toLowerCase();
                return (
                  <TouchableOpacity
                    key={swatch.name}
                    onPress={() => update(idx, { value: swatch.name })}
                    style={[
                      styles.swatch,
                      { backgroundColor: swatch.hex, borderColor: selected ? accent : colors.border.normal, borderWidth: selected ? 3 : 1 },
                    ]}
                  >
                    {selected ? (
                      <MaterialCommunityIcons
                        name="check"
                        size={18}
                        color={swatch.hex === '#f9fafb' || swatch.hex === '#facc15' ? '#111' : '#fff'}
                      />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : attr.attrType === 'select' && attr.options && attr.options.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 4 }}>
              {attr.options.map((opt) => {
                const selected = attr.value === opt;
                return (
                  <TouchableOpacity
                    key={opt}
                    onPress={() => update(idx, { value: opt })}
                    style={[
                      styles.chip,
                      {
                        borderColor: selected ? accent : colors.border.normal,
                        backgroundColor: selected ? (isDark ? 'rgba(212,175,55,0.18)' : 'rgba(42,171,238,0.12)') : 'transparent',
                      },
                    ]}
                  >
                    <Text style={{ color: selected ? accent : colors.text.normal, fontSize: 13, fontWeight: selected ? '600' : '400' }}>
                      {opt}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : (
            <TextInput
              style={[
                styles.input,
                { color: colors.text.normal, borderColor: colors.border.normal, backgroundColor: colors.background.screen },
              ]}
              value={attr.value}
              onChangeText={(v) => update(idx, { value: v })}
              placeholder="Значение"
              placeholderTextColor={colors.text.muted}
            />
          )}

          {attr.attrType === 'color' && attr.value ? (
            <View style={styles.colorBadgeRow}>
              <View style={[styles.colorDot, { backgroundColor: findSwatch(attr.value)?.hex ?? '#666' }]} />
              <Text style={{ color: colors.text.muted, fontSize: 12 }}>{attr.value}</Text>
            </View>
          ) : null}
        </View>
      ))}

      {remainingSuggestions.length > 0 ? (
        <View style={{ marginTop: 8 }}>
          <Text style={[styles.suggestLabel, { color: colors.text.muted }]}>Подсказки шаблона</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {remainingSuggestions.map((s) => (
              <TouchableOpacity
                key={s.name}
                onPress={() => addFromSuggestion(s)}
                style={[styles.suggestion, { borderColor: accent, backgroundColor: isDark ? 'rgba(212,175,55,0.08)' : 'rgba(42,171,238,0.06)' }]}
              >
                <Ionicons name="add" size={14} color={accent} />
                <Text style={{ color: accent, fontSize: 13, fontWeight: '600', marginLeft: 4 }}>{s.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {showCustom ? (
        <View style={[styles.customRow, { backgroundColor: colors.background.card, borderColor: colors.border.light }]}>
          <TextInput
            style={[styles.input, { flex: 1, color: colors.text.normal, borderColor: colors.border.normal, backgroundColor: colors.background.screen }]}
            value={customName}
            onChangeText={setCustomName}
            placeholder="Название (например, Бренд)"
            placeholderTextColor={colors.text.muted}
            autoFocus
            onSubmitEditing={addCustom}
          />
          <TouchableOpacity onPress={addCustom} style={[styles.iconButton, { backgroundColor: accent }]}>
            <Ionicons name="checkmark" size={18} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setShowCustom(false); setCustomName(''); }} style={[styles.iconButton, { backgroundColor: '#ef4444' }]}>
            <Ionicons name="close" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          onPress={() => setShowCustom(true)}
          style={[styles.addCustom, { borderColor: colors.border.light }]}
        >
          <Ionicons name="add-circle-outline" size={18} color={colors.text.muted} />
          <Text style={{ color: colors.text.muted, marginLeft: 6, fontSize: 13 }}>Свой параметр</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  emptyHint: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginBottom: 8,
  },
  row: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  attrName: { fontSize: 14, fontWeight: '600', flex: 1, marginRight: 8 },
  input: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  colorBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  colorDot: { width: 14, height: 14, borderRadius: 7, marginRight: 6 },
  suggestLabel: { fontSize: 11, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  addCustom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginTop: 8,
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
    gap: 6,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default ItemAttributesEditor;
