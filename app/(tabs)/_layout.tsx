import { Redirect, Tabs } from 'expo-router';
import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { ChartNoAxesCombined, ServerCog, UsersRound } from 'lucide-react-native';
import { DynamicColorIOS, Platform, StyleSheet, useColorScheme } from 'react-native';

import { adminConfigState, hasAuthenticatedAdminSession } from '@/src/store/admin-config';

const { useSnapshot } = require('valtio/react');

function NativeIosTabs() {
  const activeColor = DynamicColorIOS({
    dark: '#64d2ff',
    light: '#007aff',
  });
  const inactiveColor = DynamicColorIOS({
    dark: 'rgba(235,235,245,0.58)',
    light: 'rgba(60,60,67,0.58)',
  });

  return (
    <NativeTabs
      iconColor={{
        default: inactiveColor,
        selected: activeColor,
      }}
      labelStyle={{
        default: {
          color: inactiveColor,
          fontSize: 12,
          fontWeight: '500',
        },
        selected: {
          color: activeColor,
          fontSize: 12,
          fontWeight: '700',
        },
      }}
      minimizeBehavior="automatic"
      tintColor={activeColor}
    >
      <NativeTabs.Trigger name="index" hidden />
      <NativeTabs.Trigger name="monitor">
        <Icon sf="chart.xyaxis.line" selectedColor={activeColor} />
        <Label selectedStyle={{ color: activeColor, fontWeight: '700' }}>概览</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="users">
        <Icon sf={{ default: 'person.2', selected: 'person.2.fill' }} selectedColor={activeColor} />
        <Label selectedStyle={{ color: activeColor, fontWeight: '700' }}>用户</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <Icon sf="server.rack" selectedColor={activeColor} />
        <Label selectedStyle={{ color: activeColor, fontWeight: '700' }}>服务器</Label>
      </NativeTabs.Trigger>
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
        tabBarActiveBackgroundColor: isDark ? 'rgba(14,165,233,0.14)' : 'rgba(14,165,233,0.11)',
        tabBarActiveTintColor: isDark ? '#67e8f9' : '#0284c7',
        tabBarInactiveTintColor: isDark ? '#94a3b8' : '#64748b',
        tabBarItemStyle: {
          borderRadius: 22,
          marginHorizontal: 5,
          marginVertical: 7,
        },
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
    return <NativeIosTabs />;
  }

  return <FallbackBottomTabs isDark={isDark} />;
}
