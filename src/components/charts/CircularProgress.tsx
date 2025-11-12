// src/components/charts/CircularProgress.tsx
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { getThemeColors } from '../../../constants/theme';

interface CircularProgressProps {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  color: string;
  label: string;
  value: string;
}

const CircularProgress: React.FC<CircularProgressProps> = ({
  percentage,
  size = 120,
  strokeWidth = 10,
  color,
  label,
  value,
}) => {
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);
  const clampedPercentage = Math.min(Math.max(percentage, 0), 100);
  
  const progressAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(progressAnim, {
        toValue: clampedPercentage,
        duration: 1200,
        useNativeDriver: false,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 7,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, [clampedPercentage]);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          transform: [{ scale: scaleAnim }],
          opacity: fadeAnim,
        },
      ]}
    >
      {/* Background circle */}
      <View style={[styles.circle, { 
        width: size, 
        height: size, 
        borderRadius: size / 2, 
        borderWidth: strokeWidth, 
        borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#e5e7eb' 
      }]} />
      
      {/* Progress overlay - animated */}
      <View
        style={[
          styles.progressOverlay,
          {
            width: size - strokeWidth * 2,
            height: size - strokeWidth * 2,
            borderRadius: (size - strokeWidth * 2) / 2,
            top: strokeWidth,
            left: strokeWidth,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.progressIndicator,
            {
              width: size - strokeWidth * 2,
              height: progressAnim.interpolate({
                inputRange: [0, 100],
                outputRange: [0, size - strokeWidth * 2],
              }),
              backgroundColor: color,
              opacity: 0.3,
            },
          ]}
        />
      </View>

      {/* Center content */}
      <View style={styles.centerContent}>
        <Text style={[styles.percentageText, { color: colors.text.normal }]}>{clampedPercentage.toFixed(1)}%</Text>
        <Text style={[styles.valueText, { color: colors.text.normal }]}>{value}</Text>
        <Text style={[styles.labelText, { color: colors.text.muted }]}>{label}</Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  circle: {
    position: 'absolute',
  },
  progressOverlay: {
    position: 'absolute',
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  progressIndicator: {
    borderRadius: 0,
  },
  centerContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  percentageText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  valueText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    marginTop: 4,
  },
  labelText: {
    fontSize: 10,
    color: '#6b7280',
    marginTop: 2,
  },
});

export default CircularProgress;

