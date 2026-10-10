import 'react-native-gesture-handler';
import React, { useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme, NavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, Text, StyleSheet, Platform, DeviceEventEmitter } from 'react-native';
import { COLORS, FONTS, SIZES } from './src/constants/theme';
import VoiceScreen from './src/screens/VoiceScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { WAKE_WORD_EVENT } from './src/hooks/useWakeWord';

export type RootTabParamList = {
  Voice: undefined;
  History: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

const JarvisTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    primary: COLORS.accent,
    background: COLORS.background,
    card: COLORS.surface,
    text: COLORS.textPrimary,
    border: COLORS.border,
    notification: COLORS.danger,
  },
};

interface TabIconProps {
  focused: boolean;
  icon: string;
  label: string;
}

const TabIcon: React.FC<TabIconProps> = ({ focused, icon, label }) => (
  <View style={[tabStyles.iconWrapper, focused && tabStyles.iconWrapperFocused]}>
    <Text style={[tabStyles.icon, focused && tabStyles.iconFocused]}>{icon}</Text>
    <Text style={[tabStyles.label, focused && tabStyles.labelFocused]}>{label}</Text>
  </View>
);

const tabStyles = StyleSheet.create({
  iconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: SIZES.xs,
    width: 72,
  },
  iconWrapperFocused: {
    // no background — rely on label color only for clean look
  },
  icon: {
    fontSize: 20,
    color: COLORS.textMuted,
    marginBottom: 2,
  },
  iconFocused: {
    color: COLORS.accent,
  },
  label: {
    fontSize: 9,
    color: COLORS.textMuted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontWeight: FONTS.weights.medium,
  },
  labelFocused: {
    color: COLORS.accent,
  },
});

export default function App() {
  const navRef = useRef<NavigationContainerRef<RootTabParamList>>(null);

  // Listen for wake word event from background service
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(WAKE_WORD_EVENT, () => {
      // Navigate to Voice tab; VoiceScreen handles auto-triggering the mic
      navRef.current?.navigate('Voice');
    });
    return () => sub.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <NavigationContainer theme={JarvisTheme} ref={navRef}>
        <StatusBar style="light" backgroundColor={COLORS.background} />
        <Tab.Navigator
          screenOptions={{
            headerShown: false,
            tabBarShowLabel: false,
            tabBarStyle: {
              backgroundColor: COLORS.surface,
              borderTopColor: COLORS.border,
              borderTopWidth: StyleSheet.hairlineWidth,
              height: SIZES.tabBarHeight + (Platform.OS === 'ios' ? 20 : 0),
              paddingBottom: Platform.OS === 'ios' ? 20 : 0,
              elevation: 0,
              shadowOpacity: 0,
            },
          }}
        >
          <Tab.Screen
            name="Voice"
            component={VoiceScreen}
            options={{
              tabBarIcon: ({ focused }) => (
                <TabIcon focused={focused} icon="🎤" label="JARVIS" />
              ),
            }}
          />
          <Tab.Screen
            name="History"
            component={HistoryScreen}
            options={{
              tabBarIcon: ({ focused }) => (
                <TabIcon focused={focused} icon="◎" label="History" />
              ),
            }}
          />
          <Tab.Screen
            name="Settings"
            component={SettingsScreen}
            options={{
              tabBarIcon: ({ focused }) => (
                <TabIcon focused={focused} icon="⚙" label="Settings" />
              ),
            }}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
