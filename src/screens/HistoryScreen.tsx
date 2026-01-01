// src/screens/HistoryScreen.tsx
import React, { useRef } from 'react';
import { View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import HistoryContentNew, { HistoryContentNewRef } from '../components/history/HistoryContentNew';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../../constants/theme';

const HistoryScreen: React.FC = () => {
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);
  const historyContentRef = useRef<HistoryContentNewRef>(null);

  const handleRefresh = () => {
    historyContentRef.current?.refresh();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.screen }]} edges={['top']}>
      <View style={[styles.header, {
        backgroundColor: colors.background.card,
        borderBottomColor: colors.border.normal
      }]}>
        <Text style={[styles.headerTitle, { color: colors.text.normal }]}>История транзакций</Text>
        <TouchableOpacity onPress={handleRefresh} activeOpacity={0.7}>
          <MaterialIcons
            name="history"
            size={24}
            color={isDark ? colors.primary.gold : '#10b981'}
          />
        </TouchableOpacity>
      </View>
      <HistoryContentNew ref={historyContentRef} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingTop: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
});

export default HistoryScreen;
