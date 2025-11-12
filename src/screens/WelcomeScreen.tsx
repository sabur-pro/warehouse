import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Dimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, shadows, borderRadius, spacing } from '../../constants/theme';

type AuthStackParamList = {
  Welcome: undefined;
  SignIn: undefined;
  SignUp: undefined;
};

type WelcomeScreenNavigationProp = NativeStackNavigationProp<AuthStackParamList, 'Welcome'>;

const { width, height } = Dimensions.get('window');

export default function WelcomeScreen() {
  const navigation = useNavigation<WelcomeScreenNavigationProp>();
  
  // Анимации
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const iconRotate = useRef(new Animated.Value(0)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Запуск всех анимаций
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 40,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 40,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(iconRotate, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
    ]).start();

    // Плавающая анимация для иконки
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: -10,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 10,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const spin = iconRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <LinearGradient
      colors={colors.gradients.main}
      style={styles.container}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      {/* Декоративные круги на фоне */}
      <View style={styles.circle1} />
      <View style={styles.circle2} />
      <View style={styles.circle3} />
      <View style={styles.circle4} />
      <View style={styles.circle5} />

      <Animated.View
        style={[
          styles.content,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
          },
        ]}
      >
        {/* Анимированная иконка */}
        <Animated.View
          style={[
            styles.iconContainer,
            {
              transform: [
                { rotate: spin },
                { translateY: floatAnim },
              ],
            },
          ]}
        >
          <MaterialIcons name="inventory-2" size={80} color="#fff" />
        </Animated.View>

        <Text style={styles.title}>Добро пожаловать!</Text>
        <Text style={styles.subtitle}>
          Управляйте складом{'\n'}легко и эффективно
        </Text>

        {/* Фичи */}
        <View style={styles.featuresContainer}>
          <View style={styles.feature}>
            <MaterialIcons name="check-circle" size={24} color="#fff" />
            <Text style={styles.featureText}>Учет товаров</Text>
          </View>
          <View style={styles.feature}>
            <MaterialIcons name="check-circle" size={24} color="#fff" />
            <Text style={styles.featureText}>Статистика</Text>
          </View>
          <View style={styles.feature}>
            <MaterialIcons name="check-circle" size={24} color="#fff" />
            <Text style={styles.featureText}>История операций</Text>
          </View>
        </View>

        {/* Кнопки */}
        <View style={styles.buttonsContainer}>
          <TouchableOpacity
            style={styles.signUpButton}
            onPress={() => navigation.navigate('SignUp')}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={[colors.primary.blue, colors.primary.purple]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.signUpButtonGradient}
            >
              <Text style={styles.signUpButtonText}>Регистрация</Text>
              <MaterialIcons name="arrow-forward" size={22} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.signInButton}
            onPress={() => navigation.navigate('SignIn')}
            activeOpacity={0.8}
          >
            <Text style={styles.signInButtonText}>Уже есть аккаунт? Войти</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },
  circle1: {
    position: 'absolute',
    width: 350,
    height: 350,
    borderRadius: 175,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    top: -120,
    right: -120,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  circle2: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(126, 81, 212, 0.12)',
    bottom: -60,
    left: -60,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  circle3: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    top: height / 2 - 90,
    right: -90,
  },
  circle4: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(42, 171, 238, 0.15)',
    top: height * 0.25,
    left: -40,
  },
  circle5: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    bottom: height * 0.3,
    right: 30,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    zIndex: 1,
  },
  iconContainer: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 35,
    borderWidth: 4,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    ...shadows.large,
  },
  title: {
    fontSize: 38,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginBottom: 14,
    textAlign: 'center',
    textShadowColor: 'rgba(126, 81, 212, 0.3)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 6,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 19,
    color: colors.text.secondary,
    marginBottom: 45,
    textAlign: 'center',
    lineHeight: 28,
    fontWeight: '400',
  },
  featuresContainer: {
    marginBottom: 55,
    alignSelf: 'stretch',
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: borderRadius.large,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    ...shadows.small,
  },
  featureText: {
    fontSize: 17,
    color: colors.text.primary,
    marginLeft: 14,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  buttonsContainer: {
    width: '100%',
    gap: 18,
  },
  signUpButton: {
    borderRadius: borderRadius.large,
    overflow: 'hidden',
    ...shadows.medium,
  },
  signUpButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 32,
  },
  signUpButtonText: {
    color: colors.text.primary,
    fontSize: 18,
    fontWeight: 'bold',
    marginRight: 10,
    letterSpacing: 0.5,
  },
  signInButton: {
    paddingVertical: 17,
    paddingHorizontal: 32,
    borderRadius: borderRadius.large,
    borderWidth: 2.5,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  signInButtonText: {
    color: colors.text.primary,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
});
