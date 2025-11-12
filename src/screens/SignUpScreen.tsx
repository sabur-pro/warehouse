import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { colors, shadows, borderRadius, spacing } from '../../constants/theme';

type AuthStackParamList = {
  Welcome: undefined;
  SignIn: undefined;
  SignUp: undefined;
  Verification: { gmail: string };
};

type SignUpScreenNavigationProp = NativeStackNavigationProp<AuthStackParamList, 'SignUp'>;

export default function SignUpScreen() {
  const navigation = useNavigation<SignUpScreenNavigationProp>();
  const { signIn } = useAuth();
  
  const [gmail, setGmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Анимации
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleSignUp = async () => {
    if (!gmail || !password || !confirmPassword) {
      Alert.alert('Ошибка', 'Пожалуйста, заполните все поля');
      return;
    }

    if (!gmail.includes('@')) {
      Alert.alert('Ошибка', 'Пожалуйста, введите корректный email');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Ошибка', 'Пароль должен содержать минимум 6 символов');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Ошибка', 'Пароли не совпадают');
      return;
    }

    setIsLoading(true);
    try {
      const result = await signIn({ gmail, password });
      
      if (result.requiresVerification) {
        Alert.alert('Успешно', result.message || 'Код верификации отправлен на ваш email');
        navigation.navigate('Verification', { gmail });
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Ошибка при регистрации';
      Alert.alert('Ошибка', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <LinearGradient
      colors={colors.gradients.main}
      style={styles.container}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Animated.View
            style={[
              styles.content,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            {/* Иконка */}
            <BlurView intensity={40} tint="light" style={styles.iconContainer}>
              <LinearGradient
                colors={[colors.primary.purple, colors.primary.blue]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.iconGradient}
              >
                <MaterialIcons name="person-add" size={50} color="#fff" />
              </LinearGradient>
            </BlurView>

            <Text style={styles.title}>Создать аккаунт</Text>
            <Text style={styles.subtitle}>Начните управлять складом прямо сейчас</Text>

            <View style={styles.form}>
              {/* Email */}
              <BlurView intensity={30} tint="light" style={styles.inputContainer}>
                <MaterialIcons name="email" size={20} color={colors.primary.blue} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Email"
                  placeholderTextColor="rgba(255,255,255,0.6)"
                  value={gmail}
                  onChangeText={setGmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  editable={!isLoading}
                />
              </BlurView>

              {/* Пароль */}
              <BlurView intensity={30} tint="light" style={styles.inputContainer}>
                <MaterialIcons name="lock" size={20} color={colors.primary.purple} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Пароль (минимум 6 символов)"
                  placeholderTextColor="rgba(255,255,255,0.6)"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoComplete="password"
                  editable={!isLoading}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeIcon}
                >
                  <MaterialIcons
                    name={showPassword ? 'visibility' : 'visibility-off'}
                    size={20}
                    color="rgba(255,255,255,0.8)"
                  />
                </TouchableOpacity>
              </BlurView>

              {/* Подтверждение пароля */}
              <BlurView intensity={30} tint="light" style={styles.inputContainer}>
                <MaterialIcons name="lock-outline" size={20} color={colors.primary.violet} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Подтвердите пароль"
                  placeholderTextColor="rgba(255,255,255,0.6)"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirmPassword}
                  autoComplete="password"
                  editable={!isLoading}
                />
                <TouchableOpacity
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={styles.eyeIcon}
                >
                  <MaterialIcons
                    name={showConfirmPassword ? 'visibility' : 'visibility-off'}
                    size={20}
                    color="rgba(255,255,255,0.8)"
                  />
                </TouchableOpacity>
              </BlurView>

              {/* Кнопка регистрации */}
              <TouchableOpacity
                style={[styles.button, isLoading && styles.buttonDisabled]}
                onPress={handleSignUp}
                disabled={isLoading}
                activeOpacity={0.9}
              >
                <LinearGradient
                  colors={['rgba(255, 255, 255, 0.35)', 'rgba(255, 255, 255, 0.25)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.buttonGradient}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Text style={styles.buttonText}>Зарегистрироваться</Text>
                      <MaterialIcons name="arrow-forward" size={22} color="#fff" />
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              {/* Ссылка на вход */}
              <TouchableOpacity
                style={styles.signInLink}
                onPress={() => navigation.navigate('SignIn')}
                disabled={isLoading}
              >
                <Text style={styles.signInLinkText}>
                  Уже есть аккаунт? <Text style={styles.signInLinkBold}>Войти</Text>
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  content: {
    width: '100%',
  },
  iconContainer: {
    width: 110,
    height: 110,
    borderRadius: 55,
    overflow: 'hidden',
    alignSelf: 'center',
    marginBottom: 28,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    ...shadows.large,
  },
  iconGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 32,
    textAlign: 'center',
  },
  form: {
    width: '100%',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.medium,
    marginBottom: 16,
    paddingHorizontal: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  inputIcon: {
    marginRight: 14,
  },
  input: {
    flex: 1,
    paddingVertical: 18,
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
  },
  eyeIcon: {
    padding: 8,
  },
  button: {
    borderRadius: borderRadius.large,
    overflow: 'hidden',
    marginTop: 12,
    borderWidth: 2.5,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    ...shadows.medium,
  },
  buttonGradient: {
    paddingVertical: 18,
    paddingHorizontal: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginRight: 10,
    letterSpacing: 0.5,
  },
  signInLink: {
    marginTop: 24,
    alignItems: 'center',
  },
  signInLinkText: {
    color: '#fff',
    fontSize: 16,
  },
  signInLinkBold: {
    fontWeight: 'bold',
    textDecorationLine: 'underline',
  },
});
