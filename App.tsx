// App.tsx
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { DatabaseProvider } from './hooks/useDatabase';
import { AuthProvider } from './src/contexts/AuthContext';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import { SyncRefreshProvider } from './src/components/sync/SyncStatusBar';
import RootNavigator from './src/navigation/RootNavigator';
import './global.css';

function AppContent() {
  const { isDark } = useTheme();

  return (
    <>
      <NavigationContainer>
        <RootNavigator />
        <StatusBar style={isDark ? "light" : "dark"} />
      </NavigationContainer>
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <DatabaseProvider>
          <SyncRefreshProvider>
            <AppContent />
          </SyncRefreshProvider>
        </DatabaseProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}