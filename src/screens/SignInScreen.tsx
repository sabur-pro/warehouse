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

type SignInScreenNavigationProp = NativeStackNavigationProp<AuthStackParamList, 'SignIn'>;

export default function SignInScreen() {
  const navigation = useNavigation<SignInScreenNavigationProp>();
  const { signIn } = useAuth();
  
  const [loginType, setLoginType] = useState<'admin' | 'assistant'>('admin');
  const [gmail, setGmail] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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

  const handleSignIn = async () => {
    // Validate based on login type
    if (loginType === 'admin') {
      if (!gmail || !password) {
        Alert.alert('Ошибка', 'Пожалуйста, заполните все поля');
        return;
      }
      if (!gmail.includes('@')) {
        Alert.alert('Ошибка', 'Пожалуйста, введите корректный email');
        return;
      }
    } else {
      if (!login || !password) {
        Alert.alert('Ошибка', 'Пожалуйста, заполните все поля');
        return;
      }
    }

    setIsLoading(true);
    try {
      const requestData = loginType === 'admin' 
        ? { gmail, password }
        : { login, password };
      
      const result = await signIn(requestData);
      
      if (result.requiresVerification) {
        Alert.alert('Успешно', result.message || 'Код верификации отправлен на ваш gmail');
        navigation.navigate('Verification', { gmail });
      }
      // If successful login (no verification needed), AuthContext will handle navigation
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Ошибка при входе';
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
                colors={[colors.primary.blue, colors.primary.purple]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.iconGradient}
              >
                <MaterialIcons name="login" size={50} color="#fff" />
              </LinearGradient>
            </BlurView>

            <Text style={styles.title}>С возвращением!</Text>
            <Text style={styles.subtitle}>Войдите чтобы продолжить</Text>

            {/* Login Type Switcher */}
            <View style={styles.switchContainer}>
              <TouchableOpacity
                style={[styles.switchButton, loginType === 'admin' && styles.switchButtonActive]}
                onPress={() => setLoginType('admin')}
                disabled={isLoading}
                activeOpacity={0.8}
              >
                {loginType === 'admin' && (
                  <LinearGradient
                    colors={['rgba(255, 255, 255, 0.3)', 'rgba(255, 255, 255, 0.15)']}
                    style={styles.switchButtonBg}
                  />
                )}
                <MaterialIcons 
                  name="admin-panel-settings" 
                  size={20} 
                  color="#fff"
                />
                <Text style={[styles.switchButtonText, loginType === 'admin' && styles.switchButtonTextActive]}>
                  Администратор
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.switchButton, loginType === 'assistant' && styles.switchButtonActive]}
                onPress={() => setLoginType('assistant')}
                disabled={isLoading}
                activeOpacity={0.8}
              >
                {loginType === 'assistant' && (
                  <LinearGradient
                    colors={['rgba(255, 255, 255, 0.3)', 'rgba(255, 255, 255, 0.15)']}
                    style={styles.switchButtonBg}
                  />
                )}
                <MaterialIcons 
                  name="person" 
                  size={20} 
                  color="#fff"
                />
                <Text style={[styles.switchButtonText, loginType === 'assistant' && styles.switchButtonTextActive]}>
                  Ассистент
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.form}>
              {/* Email or Login */}
              {loginType === 'admin' ? (
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
              ) : (
                <BlurView intensity={30} tint="light" style={styles.inputContainer}>
                  <MaterialIcons name="person" size={20} color={colors.primary.blue} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Логин"
                    placeholderTextColor="rgba(255,255,255,0.6)"
                    value={login}
                    onChangeText={setLogin}
                    autoCapitalize="none"
                    autoComplete="username"
                    editable={!isLoading}
                  />
                </BlurView>
              )}

              {/* Пароль */}
              <BlurView intensity={30} tint="light" style={styles.inputContainer}>
                <MaterialIcons name="lock" size={20} color={colors.primary.purple} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Пароль"
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

              {/* Кнопка входа */}
              <TouchableOpacity
                style={[styles.button, isLoading && styles.buttonDisabled]}
                onPress={handleSignIn}
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
                      <Text style={styles.buttonText}>Войти</Text>
                      <MaterialIcons name="arrow-forward" size={22} color="#fff" />
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              {/* Ссылка на регистрацию - только для администраторов */}
              {loginType === 'admin' && (
                <TouchableOpacity
                  style={styles.signUpLink}
                  onPress={() => navigation.navigate('SignUp')}
                  disabled={isLoading}
                >
                  <Text style={styles.signUpLinkText}>
                    Нет аккаунта? <Text style={styles.signUpLinkBold}>Зарегистрироваться</Text>
                  </Text>
                </TouchableOpacity>
              )}
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
    marginBottom: 24,
    textAlign: 'center',
  },
  switchContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: borderRadius.medium,
    padding: 5,
    marginBottom: 28,
    gap: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  switchButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: borderRadius.small,
    gap: 8,
    overflow: 'hidden',
  },
  switchButtonBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: borderRadius.small,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  switchButtonActive: {
    // Styles handled by LinearGradient
  },
  switchButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    opacity: 0.75,
    zIndex: 1,
  },
  switchButtonTextActive: {
    opacity: 1,
    fontWeight: '700',
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
  signUpLink: {
    marginTop: 24,
    alignItems: 'center',
  },
  signUpLinkText: {
    color: '#fff',
    fontSize: 16,
  },
  signUpLinkBold: {
    fontWeight: 'bold',
    textDecorationLine: 'underline',
  },
});

