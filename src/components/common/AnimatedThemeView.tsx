// src/components/common/AnimatedThemeView.tsx
import React from 'react';
import { Animated, StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { lightColors, darkColors } from '../../../constants/theme';

interface AnimatedThemeViewProps {
  lightColor: string;
  darkColor: string;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/**
 * Компонент с анимированным фоном при переключении темы
 */
export const AnimatedThemeView: React.FC<AnimatedThemeViewProps> = ({
  lightColor,
  darkColor,
  style,
  children,
}) => {
  const { themeAnimation } = useTheme();

  const backgroundColor = themeAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [lightColor, darkColor],
  });

  return (
    <Animated.View style={[style, { backgroundColor }]}>
      {children}
    </Animated.View>
  );
};

/**
 * Компонент анимированного текста при переключении темы
 */
export const AnimatedThemeText: React.FC<{
  lightColor: string;
  darkColor: string;
  style?: any;
  children?: React.ReactNode;
}> = ({ lightColor, darkColor, style, children }) => {
  const { themeAnimation } = useTheme();

  const color = themeAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [lightColor, darkColor],
  });

  return (
    <Animated.Text style={[style, { color }]}>
      {children}
    </Animated.Text>
  );
};

