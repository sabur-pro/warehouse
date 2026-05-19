// App.tsx
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { DatabaseProvider } from './hooks/useDatabase';
import { AuthProvider } from './src/contexts/AuthContext';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import { CurrencyProvider } from './src/contexts/CurrencyContext';
import { CartProvider } from './src/contexts/CartContext';
import { CatalogsProvider } from './src/contexts/CatalogsContext';
import { ScannerProvider } from './src/contexts/ScannerContext';
import { SyncRefreshProvider } from './src/components/sync/SyncStatusBar';
import RootNavigator from './src/navigation/RootNavigator';
import LogService from './src/services/LogService';
import { HardwareScannerInput } from './components/HardwareScannerInput';
import './global.css';

// Инициализируем LogService сразу при загрузке модуля
LogService.initialize();


function AppContent() {
  const { isDark } = useTheme();

  return (
    <>
      <NavigationContainer>
        <RootNavigator />
        <StatusBar style={isDark ? "light" : "dark"} />
      </NavigationContainer>
      {/* Невидимый перехватчик HID-сканера штрихкодов (XB-6208RB / XB-D66 / XB-M82). */}
      <HardwareScannerInput />
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <CurrencyProvider>
          <DatabaseProvider>
            <CatalogsProvider>
              <SyncRefreshProvider>
                <CartProvider>
                  <ScannerProvider>
                    <AppContent />
                  </ScannerProvider>
                </CartProvider>
              </SyncRefreshProvider>
            </CatalogsProvider>
          </DatabaseProvider>
        </CurrencyProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}