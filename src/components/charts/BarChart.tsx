// src/components/charts/BarChart.tsx
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Animated } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { getThemeColors } from '../../../constants/theme';

export interface BarChartData {
  label: string;
  value: number;
  color?: string;
}

interface BarChartProps {
  data: BarChartData[];
  title?: string;
  height?: number;
  showValues?: boolean;
}

const BarChart: React.FC<BarChartProps> = ({ data, title, height = 200, showValues = true }) => {
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  if (!data || data.length === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: colors.background.card }]}>
        <Text style={[styles.emptyText, { color: colors.text.muted }]}>Нет данных для отображения</Text>
      </View>
    );
  }

  const maxValue = Math.max(...data.map(item => item.value), 1);
  const barWidth = 60; // Фиксированная ширина для лучшего отображения

  return (
    <Animated.View style={[styles.container, { backgroundColor: colors.background.card, borderColor: colors.border.normal, opacity: fadeAnim }]}>
      {title && <Text style={[styles.title, { color: colors.text.normal }]}>{title}</Text>}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={true}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={[styles.chartContainer, { height, minWidth: data.length * (barWidth + 16) }]}>
          {data.map((item, index) => {
            const barHeight = Math.max((item.value / maxValue) * (height - 60), 4);
            return (
              <AnimatedBar
                key={index}
                item={item}
                barHeight={barHeight}
                barWidth={barWidth}
                showValues={showValues}
                delay={index * 50}
              />
            );
          })}
        </View>
      </ScrollView>
    </Animated.View>
  );
};

interface AnimatedBarProps {
  item: BarChartData;
  barHeight: number;
  barWidth: number;
  showValues: boolean;
  delay: number;
}

const AnimatedBar: React.FC<AnimatedBarProps> = ({ item, barHeight, barWidth, showValues, delay }) => {
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);
  const heightAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(heightAnim, {
        toValue: barHeight,
        duration: 800,
        delay,
        useNativeDriver: false,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 400,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, [barHeight]);

  return (
    <View style={[styles.barWrapper, { width: barWidth + 16 }]}>
      <View style={styles.barContainer}>
        {showValues && (
          <Animated.Text style={[styles.valueText, { color: colors.text.normal, opacity: opacityAnim }]}>
            {item.value.toFixed(0)}
          </Animated.Text>
        )}
        <Animated.View
          style={[
            styles.bar,
            {
              height: heightAnim,
              backgroundColor: item.color || '#3b82f6',
            },
          ]}
        />
      </View>
      <Text style={[styles.labelText, { color: colors.text.muted }]} numberOfLines={2}>
        {item.label}
      </Text>
    </View>
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
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  emptyContainer: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#9ca3af',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  scrollContent: {
    paddingHorizontal: 8,
  },
  chartContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingBottom: 40,
    paddingTop: 10,
    paddingHorizontal: 4,
  },
  barWrapper: {
    alignItems: 'center',
    marginHorizontal: 4,
  },
  barContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    width: '100%',
  },
  bar: {
    width: 48,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    minHeight: 4,
  },
  valueText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  labelText: {
    fontSize: 10,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 8,
    width: '100%',
  },
});

export default BarChart;

