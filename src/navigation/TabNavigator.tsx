// src/navigation/TabNavigator.tsx
import React, { useMemo } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { getThemeColors } from '../../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { SyncStatusBar } from '../components/sync/SyncStatusBar';

import { RootTabParamList, ProfileStackParamList } from '../types/navigation';
import WarehouseScreen from '../screens/WarehouseScreen';
import HistoryScreen from '../screens/HistoryScreen';
import StatisticsScreen from '../screens/StatisticsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SubscriptionScreen from '../screens/SubscriptionScreen';
import PendingActionsScreen from '../screens/PendingActionsScreen';
import { useAuth } from '../contexts/AuthContext';

const Tab = createBottomTabNavigator<RootTabParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();

function ProfileNavigator() {
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);

  return (
    <ProfileStack.Navigator
      screenOptions={{
        headerShown: false,
        headerStyle: {
          backgroundColor: colors.background.card,
        },
        headerTintColor: colors.text.normal,
        headerTitleStyle: {
          color: colors.text.normal,
        },
      }}
    >
      <ProfileStack.Screen name="ProfileMain" component={ProfileScreen} />
      <ProfileStack.Screen
        name="Subscription"
        component={SubscriptionScreen}
        options={{
          headerShown: true,
          headerTitle: 'Подписка',
          headerBackTitle: 'Назад',
          headerStyle: {
            backgroundColor: colors.background.card,
          },
          headerTintColor: isDark ? colors.primary.gold : colors.primary.blue,
          headerTitleStyle: {
            color: colors.text.normal,
          },
        }}
      />
      <ProfileStack.Screen
        name="PendingActions"
        component={PendingActionsScreen}
        options={{
          headerShown: false,
        }}
      />
    </ProfileStack.Navigator>
  );
}

interface CustomTabBarProps {
  state: any;
  descriptors: any;
  navigation: any;
}

const CustomTabBar: React.FC<CustomTabBarProps> = ({ state, descriptors, navigation }) => {
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);

  // Простой способ - SyncStatusBar сам вызовет triggerRefreshAll через контекст
  return (
    <View style={[styles.tabBarWrapper, { backgroundColor: colors.background.screen }]}>
      <SyncStatusBar />
      <View style={[styles.tabBar, {
        backgroundColor: colors.background.card
      }]}>
        {state.routes.map((route: any, index: number) => {
          const { options } = descriptors[route.key];
          const label = options.tabBarLabel !== undefined ? options.tabBarLabel : route.name;
          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const getIconName = (routeName: string): keyof typeof MaterialIcons.glyphMap => {
            switch (routeName) {
              case 'Warehouse':
                return 'inventory';
              case 'History':
                return 'history';
              case 'Statistics':
                return 'analytics';
              case 'Profile':
                return 'person';
              default:
                return 'circle';
            }
          };

          // Обычные табы без специальной обработки центральной кнопки
          const focusedColor = isDark ? colors.primary.gold : colors.primary.blue;
          const unfocusedColor = isDark ? colors.text.muted : '#9CA3AF';

          const iconContainerStyle = useMemo(() => [
            styles.tabIconContainer,
            {
              borderRadius: 12,
              backgroundColor: isFocused
                ? (isDark ? 'rgba(212, 175, 55, 0.15)' : 'rgba(42, 171, 238, 0.12)')
                : 'transparent'
            }
          ], [isFocused, isDark]);

          return (
            <TouchableOpacity
              key={index}
              onPress={onPress}
              style={styles.tabItem}
              activeOpacity={0.7}
            >
              <View style={iconContainerStyle}>
                <MaterialIcons
                  name={getIconName(route.name)}
                  size={24}
                  color={isFocused ? focusedColor : unfocusedColor}
                />
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const TabNavigator: React.FC = () => {
  const { isAssistant } = useAuth();

  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
      initialRouteName="Warehouse"
    >
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{
          tabBarLabel: 'История',
        }}
      />
      <Tab.Screen
        name="Warehouse"
        component={WarehouseScreen}
        options={{
          tabBarLabel: 'Склад',
        }}
      />
      {/* Скрываем статистику для ассистентов */}
      {!isAssistant() && (
        <Tab.Screen
          name="Statistics"
          component={StatisticsScreen}
          options={{
            tabBarLabel: 'Статистика',
          }}
        />
      )}
      <Tab.Screen
        name="Profile"
        component={ProfileNavigator}
        options={{
          tabBarLabel: 'Профиль',
        }}
      />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  tabBarWrapper: {
    paddingTop: 0,
  },
  tabBar: {
    flexDirection: 'row',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 20,
    paddingTop: 10,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  tabIconContainer: {
    padding: 10,
  },
  centerSpace: {
    flex: 1,
  },
});

export default TabNavigator;
