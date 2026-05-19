// src/components/common/CatalogIcon.tsx
// Универсальный рендер иконки каталога. Поддерживает префиксы:
//   mci:<name>  — MaterialCommunityIcons
//   ion:<name>  — Ionicons
//   mat:<name>  — MaterialIcons
//   fa5:<name>  — FontAwesome5
// Если префикса нет — считаем строкой (legacy emoji).

import React from 'react';
import { Text, TextStyle } from 'react-native';
import { MaterialCommunityIcons, Ionicons, MaterialIcons, FontAwesome5 } from '@expo/vector-icons';

export interface CatalogIconProps {
  value?: string | null;
  size?: number;
  color?: string;
  fallbackEmoji?: string;
  style?: TextStyle;
}

const PARSE = /^(mci|ion|mat|fa5):(.+)$/;

export const parseIconValue = (
  value?: string | null,
): { kind: 'mci' | 'ion' | 'mat' | 'fa5'; name: string } | { kind: 'emoji'; value: string } | null => {
  if (!value) return null;
  const match = PARSE.exec(value);
  if (match) {
    const kind = match[1] as 'mci' | 'ion' | 'mat' | 'fa5';
    return { kind, name: match[2] };
  }
  return { kind: 'emoji', value };
};

// Защита от невалидных имён иконок. expo/vector-icons при `name="не_существует"`
// печатает console.warn на КАЖДОМ рендере. В режиме разработки это поднимает
// LogBox-оверлей, который перехватывает touch-фокус и сбрасывает клавиатуру
// у активного TextInput. Поэтому здесь явно проверяем имя через glyphMap
// и при отсутствии — рендерим fallback emoji молча.
const isValidGlyph = (
  font: { glyphMap?: Record<string, unknown> } | undefined,
  name: string,
): boolean => !!(font && font.glyphMap && name in font.glyphMap);

export const CatalogIcon: React.FC<CatalogIconProps> = ({
  value,
  size = 24,
  color = '#666',
  fallbackEmoji = '📦',
  style,
}) => {
  const parsed = parseIconValue(value) ?? { kind: 'emoji' as const, value: fallbackEmoji };

  if (parsed.kind === 'emoji') {
    return <Text style={[{ fontSize: size }, style]}>{parsed.value}</Text>;
  }

  // Подбираем шрифт и валидируем имя; если имя битое — показываем fallback emoji.
  const font =
    parsed.kind === 'mci' ? MaterialCommunityIcons :
    parsed.kind === 'ion' ? Ionicons :
    parsed.kind === 'mat' ? MaterialIcons :
    FontAwesome5;

  if (!isValidGlyph(font as any, parsed.name)) {
    return <Text style={[{ fontSize: size }, style]}>{fallbackEmoji}</Text>;
  }

  if (parsed.kind === 'mci') {
    return <MaterialCommunityIcons name={parsed.name as any} size={size} color={color} />;
  }
  if (parsed.kind === 'ion') {
    return <Ionicons name={parsed.name as any} size={size} color={color} />;
  }
  if (parsed.kind === 'mat') {
    return <MaterialIcons name={parsed.name as any} size={size} color={color} />;
  }
  return <FontAwesome5 name={parsed.name as any} size={size} color={color} />;
};

export default CatalogIcon;
