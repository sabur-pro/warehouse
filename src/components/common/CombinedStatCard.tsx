// src/components/common/CombinedStatCard.tsx
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { getThemeColors } from '../../../constants/theme';

interface StatItem {
  icon: string;
  title: string;
  value: string;
  subtitle: string;
}

interface CombinedStatCardProps {
  items: StatItem[];
  color: string;
}

const CombinedStatCard: React.FC<CombinedStatCardProps> = ({ items, color }) => {
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: colors.background.card,
          borderColor: colors.border.normal,
          opacity: fadeAnim,
          transform: [{ scale: scaleAnim }],
        },
      ]}
    >
      {items.map((item, index) => (
        <View key={index} style={styles.itemWrapper}>
          {index > 0 && <View style={[styles.verticalDivider, { backgroundColor: colors.border.normal }]} />}
          <View style={styles.statItem}>
            <View style={[styles.iconContainer, { backgroundColor: `${color}15` }]}>
              <MaterialIcons name={item.icon as any} size={24} color={color} />
            </View>
            <View style={styles.textContainer}>
              <Text style={[styles.title, { color: colors.text.muted }]}>{item.title}</Text>
              <Text style={[styles.value, { color: colors.text.normal }]}>{item.value}</Text>
              <Text style={[styles.subtitle, { color: colors.text.muted }]}>{item.subtitle}</Text>
            </View>
          </View>
        </View>
      ))}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  itemWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  textContainer: {
    alignItems: 'center',
  },
  title: {
    fontSize: 10,
    color: '#9ca3af',
    marginBottom: 6,
    textAlign: 'center',
    fontWeight: '500',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  value: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 2,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 10,
    color: '#9ca3af',
    textAlign: 'center',
    fontWeight: '400',
  },
  verticalDivider: {
    width: 1,
    height: '70%',
    backgroundColor: '#e5e7eb',
    marginHorizontal: 10,
    opacity: 0.6,
  },
});

export default CombinedStatCard;

