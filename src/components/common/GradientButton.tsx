import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, shadows, borderRadius } from '../../../constants/theme';

interface GradientButtonProps {
  title: string;
  onPress: () => void;
  icon?: keyof typeof MaterialIcons.glyphMap;
  variant?: 'primary' | 'secondary' | 'outline' | 'glass';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
}

export const GradientButton: React.FC<GradientButtonProps> = ({
  title,
  onPress,
  icon,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  fullWidth = true,
}) => {
  const getGradientColors = () => {
    switch (variant) {
      case 'primary':
        return [colors.primary.blue, colors.primary.purple];
      case 'secondary':
        return [colors.primary.darkBlue, colors.primary.violet];
      default:
        return [colors.primary.blue, colors.primary.purple];
    }
  };

  const getSizeStyles = () => {
    switch (size) {
      case 'small':
        return { paddingVertical: 10, paddingHorizontal: 20, fontSize: 14 };
      case 'large':
        return { paddingVertical: 18, paddingHorizontal: 40, fontSize: 18 };
      default:
        return { paddingVertical: 16, paddingHorizontal: 32, fontSize: 16 };
    }
  };

  const sizeStyles = getSizeStyles();

  if (variant === 'glass') {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled || loading}
        activeOpacity={0.8}
        style={[
          styles.button,
          fullWidth && styles.fullWidth,
          disabled && styles.disabled,
        ]}
      >
        <BlurView intensity={30} tint="light" style={styles.glassContainer}>
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.25)', 'rgba(255, 255, 255, 0.1)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.gradient, { paddingVertical: sizeStyles.paddingVertical, paddingHorizontal: sizeStyles.paddingHorizontal }]}
          >
            {icon && <MaterialIcons name={icon} size={20} color="#fff" style={styles.icon} />}
            <Text style={[styles.text, { fontSize: sizeStyles.fontSize }]}>{title}</Text>
          </LinearGradient>
        </BlurView>
      </TouchableOpacity>
    );
  }

  if (variant === 'outline') {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled || loading}
        activeOpacity={0.8}
        style={[
          styles.button,
          styles.outlineButton,
          fullWidth && styles.fullWidth,
          disabled && styles.disabled,
        ]}
      >
        <View style={[styles.gradient, { paddingVertical: sizeStyles.paddingVertical, paddingHorizontal: sizeStyles.paddingHorizontal }]}>
          {icon && (
            <LinearGradient
              colors={getGradientColors()}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.iconGradientWrapper}
            >
              <MaterialIcons name={icon} size={20} color="#fff" style={styles.icon} />
            </LinearGradient>
          )}
          <LinearGradient
            colors={getGradientColors()}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.textGradientWrapper}
          >
            <Text style={[styles.outlineText, { fontSize: sizeStyles.fontSize }]}>{title}</Text>
          </LinearGradient>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.9}
      style={[
        styles.button,
        fullWidth && styles.fullWidth,
        disabled && styles.disabled,
      ]}
    >
      <LinearGradient
        colors={getGradientColors()}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.gradient, { paddingVertical: sizeStyles.paddingVertical, paddingHorizontal: sizeStyles.paddingHorizontal }]}
      >
        {icon && <MaterialIcons name={icon} size={20} color="#fff" style={styles.icon} />}
        <Text style={[styles.text, { fontSize: sizeStyles.fontSize }]}>{title}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    borderRadius: borderRadius.large,
    overflow: 'hidden',
    ...shadows.medium,
  },
  fullWidth: {
    width: '100%',
  },
  gradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glassContainer: {
    borderRadius: borderRadius.large,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  outlineButton: {
    backgroundColor: 'transparent',
    borderWidth: 2.5,
    borderColor: 'transparent',
    shadowOpacity: 0,
  },
  text: {
    color: colors.text.primary,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  outlineText: {
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  icon: {
    marginRight: 8,
  },
  iconGradientWrapper: {
    borderRadius: 20,
    marginRight: 8,
  },
  textGradientWrapper: {
    borderRadius: 20,
  },
  disabled: {
    opacity: 0.5,
  },
});

