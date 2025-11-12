// Цветовая схема с поддержкой темной темы
export const lightColors = {
  // Основные цвета Telegram
  primary: {
    blue: '#2AABEE',
    darkBlue: '#229ED9',
    deepBlue: '#0088CC',
    purple: '#7E51D4',
    lightPurple: '#9B7CD6',
    violet: '#6B5FD8',
    gold: '#D4AF37',
    lightGold: '#E6C84E',
  },
  
  // Градиенты
  gradients: {
    main: ['#2AABEE', '#7E51D4'] as const, // Синий -> Фиолетовый
    secondary: ['#229ED9', '#6B5FD8'] as const, // Темный синий -> Фиолетовый
    accent: ['#0088CC', '#9B7CD6'] as const, // Глубокий синий -> Светло-фиолетовый
    soft: ['#5DBBE8', '#A98BE8'] as const, // Мягкий градиент
  },
  
  // Дополнительные цвета
  background: {
    light: '#F5F7FA',
    white: '#FFFFFF',
    overlay: 'rgba(42, 171, 238, 0.1)',
    card: '#FFFFFF',
    screen: '#F5F7FA',
  },
  
  text: {
    primary: '#FFFFFF',
    secondary: 'rgba(255, 255, 255, 0.9)',
    dark: '#2C3E50',
    normal: '#333333',
    muted: '#666666',
  },
  
  // Эффекты
  effects: {
    glow: 'rgba(42, 171, 238, 0.4)',
    shadow: 'rgba(126, 81, 212, 0.3)',
    overlay: 'rgba(255, 255, 255, 0.15)',
  },

  border: {
    light: '#f0f0f0',
    normal: '#e5e7eb',
  },
};

// Темная тема - черный + золотисто-серый
export const darkColors = {
  // Основные цвета адаптированные для темной темы
  primary: {
    blue: '#3BBCFF',
    darkBlue: '#2AABEE',
    deepBlue: '#1A9FE0',
    purple: '#9A6FE8',
    lightPurple: '#B08FF0',
    violet: '#8575E8',
    gold: '#D4AF37', // Золотой
    lightGold: '#E6C84E', // Светло-золотой
  },
  
  // Градиенты для темной темы
  gradients: {
    main: ['#3BBCFF', '#9A6FE8'] as const, // Яркий синий -> Фиолетовый
    secondary: ['#2AABEE', '#8575E8'] as const, 
    accent: ['#D4AF37', '#9A6FE8'] as const, // Золотой -> Фиолетовый
    soft: ['#5DBBE8', '#B08FF0'] as const,
    dark: ['#1a1a1a', '#2d2d2d'] as const, // Черный градиент
    darkGold: ['#2d2d2d', '#3a3528'] as const, // Черный -> Золотисто-серый
  },
  
  // Фоны
  background: {
    light: '#1a1a1a', // Черный
    white: '#2d2d2d', // Темно-серый
    overlay: 'rgba(212, 175, 55, 0.1)', // Золотистый оверлей
    card: '#2d2d2d', // Темно-серый для карточек
    screen: '#121212', // Почти черный для экранов
  },
  
  text: {
    primary: '#FFFFFF',
    secondary: 'rgba(255, 255, 255, 0.8)',
    dark: '#E5E5E5',
    normal: '#E5E5E5',
    muted: '#999999',
    gold: '#D4AF37', // Золотой текст
  },
  
  // Эффекты
  effects: {
    glow: 'rgba(212, 175, 55, 0.5)', // Золотистое свечение
    shadow: 'rgba(0, 0, 0, 0.8)',
    overlay: 'rgba(255, 255, 255, 0.05)',
  },

  border: {
    light: '#3a3a3a',
    normal: '#4a4a4a',
  },
};

// Экспорт по умолчанию (светлая тема для обратной совместимости)
export const colors = lightColors;

// Helper функция для получения цветов в зависимости от темы
export const getThemeColors = (isDark: boolean) => isDark ? darkColors : lightColors;

// Тени
export const shadows = {
  small: {
    shadowColor: colors.primary.purple,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  medium: {
    shadowColor: colors.primary.blue,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  large: {
    shadowColor: colors.primary.purple,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
};

// Размеры
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

// Радиусы
export const borderRadius = {
  small: 12,
  medium: 20,
  large: 30,
  full: 9999,
};

