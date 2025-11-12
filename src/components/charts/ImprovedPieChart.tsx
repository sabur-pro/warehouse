// src/components/charts/ImprovedPieChart.tsx
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import Svg, { Path, Circle, G } from 'react-native-svg';
import { useTheme } from '../../contexts/ThemeContext';
import { getThemeColors } from '../../../constants/theme';

export interface PieChartData {
  label: string;
  value: number;
  color: string;
}

interface ImprovedPieChartProps {
  data: PieChartData[];
  title?: string;
  size?: number;
}

const ImprovedPieChart: React.FC<ImprovedPieChartProps> = ({ data, title, size = 200 }) => {
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 50,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  if (!data || data.length === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: colors.background.card }]}>
        <Text style={[styles.emptyText, { color: colors.text.muted }]}>Нет данных</Text>
      </View>
    );
  }

  const total = data.reduce((sum, item) => sum + item.value, 0);
  const selectedItem = selectedIndex !== null ? data[selectedIndex] : null;
  const selectedPercentage = selectedItem && total > 0 ? (selectedItem.value / total) * 100 : 0;

  // Создаем пути для SVG сегментов
  const createPiePath = (percentage: number, startAngle: number): string => {
    const angle = (percentage / 100) * 360;
    const radius = (size - 20) / 2;
    const centerX = size / 2;
    const centerY = size / 2;

    const startAngleRad = (startAngle - 90) * (Math.PI / 180);
    const endAngleRad = (startAngle + angle - 90) * (Math.PI / 180);

    const x1 = centerX + radius * Math.cos(startAngleRad);
    const y1 = centerY + radius * Math.sin(startAngleRad);
    const x2 = centerX + radius * Math.cos(endAngleRad);
    const y2 = centerY + radius * Math.sin(endAngleRad);

    const largeArcFlag = angle > 180 ? 1 : 0;

    return `M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
  };

  let currentAngle = 0;
  const segments = data.map((item, index) => {
    const percentage = total > 0 ? (item.value / total) * 100 : 0;
    const path = createPiePath(percentage, currentAngle);
    const segment = { path, percentage, startAngle: currentAngle, item, index };
    currentAngle += (percentage / 100) * 360;
    return segment;
  });

  return (
    <Animated.View 
      style={[
        styles.container,
        {
          backgroundColor: colors.background.card,
          borderColor: colors.border.normal,
          opacity: fadeAnim,
          transform: [{ scale: scaleAnim }],
        }
      ]}
    >
      {title && <Text style={[styles.title, { color: colors.text.normal }]}>{title}</Text>}
      <View style={styles.content}>
        {/* SVG Pie Chart */}
        <View style={styles.chartContainer}>
          <Svg width={size} height={size}>
            {segments.map((segment, index) => (
              <G key={index}>
                <Path
                  d={segment.path}
                  fill={segment.item.color}
                  opacity={selectedIndex === null ? 1 : selectedIndex === index ? 1 : 0.3}
                  onPress={() => setSelectedIndex(selectedIndex === index ? null : index)}
                />
              </G>
            ))}
            {/* Центральный круг */}
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={(size - 20) / 2 * 0.5}
              fill={colors.background.card}
            />
          </Svg>

          {/* Центральная информация */}
          <View style={[styles.centerCircle, { width: size, height: size }]}>
            {selectedItem ? (
              <>
                <Text style={[styles.centerPercentage, { color: colors.text.normal }]}>{selectedPercentage.toFixed(1)}%</Text>
                <Text style={[styles.centerLabel, { color: colors.text.muted }]} numberOfLines={2}>{selectedItem.label}</Text>
                <Text style={[styles.centerValue, { color: colors.text.muted }]}>{selectedItem.value} шт</Text>
              </>
            ) : (
              <>
                <Text style={[styles.centerTotal, { color: colors.text.normal }]}>{total}</Text>
                <Text style={[styles.centerTotalLabel, { color: colors.text.muted }]}>всего</Text>
              </>
            )}
          </View>
        </View>

        {/* Legend in grid */}
        <View style={styles.legend}>
          {data.map((item, index) => {
            const percentage = total > 0 ? (item.value / total) * 100 : 0;
            const isSelected = selectedIndex === index;
            return (
              <TouchableOpacity
                key={index}
                style={[
                  styles.legendItem,
                  {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#f9fafb',
                    borderColor: colors.border.normal,
                  },
                  isSelected && [styles.legendItemSelected, {
                    backgroundColor: isDark ? 'rgba(212, 175, 55, 0.15)' : '#eff6ff',
                    borderColor: isDark ? colors.primary.gold : '#3b82f6',
                  }],
                ]}
                onPress={() => setSelectedIndex(isSelected ? null : index)}
                activeOpacity={0.7}
              >
                <View style={[styles.legendColor, { backgroundColor: item.color }]} />
                <View style={styles.legendTextContainer}>
                  <Text style={[styles.legendLabel, { color: colors.text.normal }]} numberOfLines={1}>{item.label}</Text>
                  <Text style={[styles.legendValue, { color: colors.text.muted }]}>
                    {item.value} ({percentage.toFixed(1)}%)
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
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
    marginBottom: 20,
    letterSpacing: -0.3,
  },
  content: {
    gap: 20,
  },
  chartContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  centerCircle: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'none',
  },
  centerTotal: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#111827',
    letterSpacing: -1,
  },
  centerTotalLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
    fontWeight: '500',
  },
  centerPercentage: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    letterSpacing: -1,
  },
  centerLabel: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 4,
    textAlign: 'center',
    maxWidth: 100,
  },
  centerValue: {
    fontSize: 10,
    color: '#9ca3af',
    marginTop: 2,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 10,
    width: '48%',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  legendItemSelected: {
    backgroundColor: '#eff6ff',
    borderColor: '#3b82f6',
  },
  legendColor: {
    width: 16,
    height: 16,
    borderRadius: 4,
    marginRight: 10,
  },
  legendTextContainer: {
    flex: 1,
  },
  legendLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  legendValue: {
    fontSize: 10,
    color: '#6b7280',
    marginTop: 2,
  },
});

export default ImprovedPieChart;

