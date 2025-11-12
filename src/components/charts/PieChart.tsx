// src/components/charts/PieChart.tsx
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { getThemeColors } from '../../../constants/theme';

export interface PieChartData {
  label: string;
  value: number;
  color: string;
}

interface PieChartProps {
  data: PieChartData[];
  title?: string;
  size?: number;
}

const PieChart: React.FC<PieChartProps> = ({ data, title, size = 160 }) => {
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
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
        <Text style={[styles.emptyText, { color: colors.text.muted }]}>Нет данных</Text>
      </View>
    );
  }

  const total = data.reduce((sum, item) => sum + item.value, 0);
  const selectedItem = selectedIndex !== null ? data[selectedIndex] : null;
  const selectedPercentage = selectedItem && total > 0 ? (selectedItem.value / total) * 100 : 0;
  
  return (
    <Animated.View style={[styles.container, { backgroundColor: colors.background.card, borderColor: colors.border.normal, opacity: fadeAnim }]}>
      {title && <Text style={[styles.title, { color: colors.text.normal }]}>{title}</Text>}
      <View style={styles.content}>
        {/* Pie Chart with center info */}
        <View style={styles.chartContainer}>
          <View style={[styles.pieContainer, { width: size, height: size, borderColor: colors.border.normal }]}>
            {data.map((item, index) => {
              const percentage = total > 0 ? (item.value / total) * 100 : 0;
              const isSelected = selectedIndex === index;
              return (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.pieSegment,
                    {
                      backgroundColor: item.color,
                      width: `${percentage}%`,
                      opacity: selectedIndex === null ? 1 : isSelected ? 1 : 0.4,
                    },
                  ]}
                  onPress={() => setSelectedIndex(isSelected ? null : index)}
                  activeOpacity={0.7}
                />
              );
            })}
            
            {/* Center info circle */}
            <View style={[styles.centerCircle, { backgroundColor: colors.background.card }]}>
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
  content: {
    gap: 16,
  },
  chartContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pieContainer: {
    borderRadius: 999,
    overflow: 'hidden',
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderWidth: 3,
    borderColor: '#e5e7eb',
    position: 'relative',
  },
  pieSegment: {
    height: '100%',
  },
  centerCircle: {
    position: 'absolute',
    width: '55%',
    height: '55%',
    borderRadius: 999,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    top: '22.5%',
    left: '22.5%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    padding: 8,
  },
  centerTotal: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
  },
  centerTotalLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  centerPercentage: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  centerLabel: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 2,
    textAlign: 'center',
  },
  centerValue: {
    fontSize: 10,
    color: '#9ca3af',
    marginTop: 2,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 8,
    width: '48%',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  legendItemSelected: {
    backgroundColor: '#eff6ff',
    borderColor: '#3b82f6',
  },
  legendColor: {
    width: 14,
    height: 14,
    borderRadius: 3,
    marginRight: 8,
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

export default PieChart;

