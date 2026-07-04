import { Redirect, Tabs } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { ChartNoAxesCombined, ServerCog, UsersRound } from 'lucide-react-native';
import { Platform, StyleSheet, useColorScheme } from 'react-native';

import { adminConfigState, hasAuthenticatedAdminSession } from '@/src/store/admin-config';

const { useSnapshot } = require('valtio/react');

function NativeIosTabs({ isDark }: { isDark: boolean }) {
  const glassBackground = isDark ? 'rgba(15,23,42,0.42)' : 'rgba(255,255,255,0.72)';
  const defaultColor = isDark ? '#f8fafc' : '#111827';
  const selectedColor = '#3578e5';

  return (
    <NativeTabs
      backgroundColor={glassBackground}
      blurEffect={isDark ? 'systemThinMaterialDark' : 'systemUltraThinMaterialLight'}
      disableTransparentOnScrollEdge
      iconColor={{
        default: defaultColor,
        selected: selectedColor,
      }}
      labelStyle={{
        default: {
          color: defaultColor,
          fontSize: 13,
          fontWeight: '700',
        },
        selected: {
          color: selectedColor,
          fontSize: 13,
          fontWeight: '800',
        },
      }}
      minimizeBehavior="never"
      shadowColor={isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.12)'}
      tintColor={selectedColor}
    >
      <NativeTabs.Trigger name="index" hidden />
      <NativeTabs.Trigger
        name="monitor"
        options={{
          title: '概览',
          icon: { sf: 'chart.xyaxis.line' },
          selectedIcon: { sf: 'chart.xyaxis.line' },
          backgroundColor: glassBackground,
          blurEffect: isDark ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight',
          iconColor: selectedColor,
          shadowColor: 'rgba(53,120,229,0.16)',
        }}
      />
      <NativeTabs.Trigger
        name="users"
        options={{
          title: '用户',
          icon: { sf: 'person.2' },
          selectedIcon: { sf: 'person.2.fill' },
          backgroundColor: glassBackground,
          blurEffect: isDark ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight',
          iconColor: selectedColor,
          shadowColor: 'rgba(53,120,229,0.16)',
        }}
      />
      <NativeTabs.Trigger
        name="settings"
        options={{
          title: '服务器',
          icon: { sf: 'server.rack' },
          selectedIcon: { sf: 'server.rack' },
          backgroundColor: glassBackground,
          blurEffect: isDark ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight',
          iconColor: selectedColor,
          shadowColor: 'rgba(53,120,229,0.16)',
        }}
      />
      <NativeTabs.Trigger name="groups" hidden />
      <NativeTabs.Trigger name="accounts" hidden />
    </NativeTabs>
  );
}

function FallbackBottomTabs({ isDark }: { isDark: boolean }) {
  return (
    <Tabs
      initialRouteName="monitor"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#3578e5',
        tabBarInactiveTintColor: isDark ? '#dbeafe' : '#111827',
        tabBarStyle: {
          position: 'absolute',
          left: 18,
          right: 18,
          bottom: 14,
          height: 76,
          paddingTop: 8,
          paddingBottom: 12,
          borderRadius: 32,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.92)',
          backgroundColor: isDark ? 'rgba(15,23,42,0.72)' : 'rgba(255,255,255,0.86)',
          shadowColor: isDark ? '#000' : '#60a5fa',
          shadowOpacity: isDark ? 0.22 : 0.14,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 14 },
          elevation: 16,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '800',
        },
      }}
    >
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen
        name="monitor"
        options={{
          title: '概览',
          tabBarIcon: ({ color, size }) => <ChartNoAxesCombined color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="users"
        options={{
          title: '用户',
          tabBarIcon: ({ color, size }) => <UsersRound color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '服务器',
          tabBarIcon: ({ color, size }) => <ServerCog color={color} size={size} />,
        }}
      />
      <Tabs.Screen name="groups" options={{ href: null }} />
      <Tabs.Screen name="accounts" options={{ href: null }} />
    </Tabs>
  );
}

export default function TabsLayout() {
  const config = useSnapshot(adminConfigState);
  const hasAccount = hasAuthenticatedAdminSession(config);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  if (!hasAccount) {
    return <Redirect href="/login" />;
  }

  if (Platform.OS === 'ios') {
    return <NativeIosTabs isDark={isDark} />;
  }

  return <FallbackBottomTabs isDark={isDark} />;
}
