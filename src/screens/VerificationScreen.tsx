import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { colors, shadows, borderRadius, spacing } from '../../constants/theme';

type AuthStackParamList = {
  Verification: { gmail: string };
};

type VerificationScreenRouteProp = RouteProp<AuthStackParamList, 'Verification'>;

export default function VerificationScreen() {
  const route = useRoute<VerificationScreenRouteProp>();
  const { gmail } = route.params;
  const { verify } = useAuth();

  const [code, setCode] = useState(['', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const inputRefs = useRef<(TextInput | null)[]>([]);
  
  // Анимации
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const scaleAnims = useRef([...Array(4)].map(() => new Animated.Value(1))).current;

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

  const handleCodeChange = (text: string, index: number) => {
    if (text.length > 1) {
      text = text[text.length - 1];
    }

    const newCode = [...code];
    newCode[index] = text;
    setCode(newCode);

    // Анимация при вводе
    Animated.sequence([
      Animated.timing(scaleAnims[index], {
        toValue: 1.2,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnims[index], {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto focus next input
    if (text && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto submit when all digits are entered
    if (index === 3 && text && newCode.every((digit) => digit !== '')) {
      handleVerify(newCode.join(''));
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async (fullCode?: string) => {
    const verificationCode = fullCode || code.join('');
    
    if (verificationCode.length !== 4) {
      Alert.alert('Ошибка', 'Пожалуйста, введите 4-значный код');
      return;
    }

    setIsLoading(true);
    try {
      await verify({ code: verificationCode, gmail });
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Ошибка при верификации';
      Alert.alert('Ошибка', errorMessage);
      setCode(['', '', '', '']);
      inputRefs.current[0]?.focus();
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
            <MaterialIcons name="verified-user" size={50} color="#fff" />
          </LinearGradient>
        </BlurView>

        <Text style={styles.title}>Подтверждение</Text>
        <Text style={styles.subtitle}>
          Введите 4-значный код, отправленный на
        </Text>
        <Text style={styles.email}>{gmail}</Text>

        <View style={styles.codeContainer}>
          {code.map((digit, index) => (
            <Animated.View
              key={index}
              style={[
                styles.codeInputWrapper,
                {
                  transform: [{ scale: scaleAnims[index] }],
                },
              ]}
            >
              <BlurView intensity={25} tint="light" style={styles.codeInputBlur}>
                <TextInput
                  ref={(ref) => { inputRefs.current[index] = ref; }}
                  style={[
                    styles.codeInput,
                    digit !== '' && styles.codeInputFilled,
                  ]}
                  value={digit}
                  onChangeText={(text) => handleCodeChange(text, index)}
                  onKeyPress={(e) => handleKeyPress(e, index)}
                  keyboardType="number-pad"
                  maxLength={1}
                  editable={!isLoading}
                  selectTextOnFocus
                  placeholderTextColor="rgba(255,255,255,0.3)"
                />
              </BlurView>
            </Animated.View>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={() => handleVerify()}
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
                <Text style={styles.buttonText}>Подтвердить</Text>
                <MaterialIcons name="check-circle" size={22} color="#fff" />
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <BlurView intensity={20} tint="light" style={styles.helpContainer}>
          <MaterialIcons name="info-outline" size={20} color="#fff" />
          <Text style={styles.helpText}>Проверьте папку "Спам" если письмо не пришло</Text>
        </BlurView>
      </Animated.View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  iconContainer: {
    width: 110,
    height: 110,
    borderRadius: 55,
    overflow: 'hidden',
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
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    marginBottom: 4,
  },
  email: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 40,
  },
  codeContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 40,
    gap: 12,
  },
  codeInputWrapper: {
    ...shadows.medium,
  },
  codeInputBlur: {
    width: 64,
    height: 74,
    borderRadius: borderRadius.medium,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  codeInput: {
    width: '100%',
    height: '100%',
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#fff',
  },
  codeInputFilled: {
    borderColor: '#fff',
  },
  button: {
    borderRadius: borderRadius.large,
    overflow: 'hidden',
    width: '100%',
    borderWidth: 2.5,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    ...shadows.medium,
  },
  buttonGradient: {
    paddingVertical: 18,
    paddingHorizontal: 40,
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
  helpContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 30,
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 10,
    borderRadius: borderRadius.medium,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  helpText: {
    flex: 1,
    fontSize: 14,
    color: '#fff',
    fontWeight: '500',
  },
});
