// src/components/charts/ProgressBar.tsx
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { getThemeColors } from '../../../constants/theme';

interface ProgressBarProps {
  label: string;
  value: number;
  maxValue: number;
  color: string;
  unit?: string;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ label, value, maxValue, color, unit = '' }) => {
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);
  const percentage = maxValue > 0 ? (value / maxValue) * 100 : 0;
  const clampedPercentage = Math.min(Math.max(percentage, 0), 100);
  
  const widthAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(widthAnim, {
        toValue: clampedPercentage,
        duration: 1000,
        useNativeDriver: false,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, [clampedPercentage]);
  
  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <View style={styles.header}>
        <Text style={[styles.label, { color: colors.text.normal }]}>{label}</Text>
        <Text style={[styles.value, { color: colors.text.normal }]}>
          {value.toFixed(2)} {unit}
        </Text>
      </View>
      <View style={[styles.barContainer, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#e5e7eb' }]}>
        <Animated.View
          style={[
            styles.barFill,
            {
              width: widthAnim.interpolate({
                inputRange: [0, 100],
                outputRange: ['0%', '100%'],
              }),
              backgroundColor: color,
            },
          ]}
        />
      </View>
      <Text style={[styles.percentage, { color: colors.text.muted }]}>{clampedPercentage.toFixed(1)}%</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  value: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  barContainer: {
    height: 12,
    backgroundColor: '#e5e7eb',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 4,
  },
  barFill: {
    height: '100%',
    borderRadius: 6,
  },
  percentage: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'right',
  },
});

export default ProgressBar;

