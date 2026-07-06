import { Redirect, Tabs } from 'expo-router';
import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { ChartNoAxesCombined, LayoutGrid, ServerCog, UsersRound } from 'lucide-react-native';
import { DynamicColorIOS, Platform, StyleSheet, useColorScheme } from 'react-native';

import { adminConfigState, hasAuthenticatedAdminSession } from '@/src/store/admin-config';

const { useSnapshot } = require('valtio/react');

function NativeIosTabs() {
  const activeColor = DynamicColorIOS({
    dark: '#93c5fd',
    light: '#2563eb',
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
      <NativeTabs.Trigger name="manage">
        <Icon sf={{ default: 'square.grid.2x2', selected: 'square.grid.2x2.fill' }} selectedColor={activeColor} />
        <Label selectedStyle={{ color: activeColor, fontWeight: '700' }}>管理</Label>
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
        tabBarActiveBackgroundColor: isDark ? 'rgba(59,130,246,0.18)' : 'rgba(37,99,235,0.1)',
        tabBarActiveTintColor: isDark ? '#93c5fd' : '#2563eb',
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
          borderColor: isDark ? 'rgba(148,163,184,0.2)' : 'rgba(255,255,255,0.94)',
          backgroundColor: isDark ? 'rgba(17,24,39,0.76)' : 'rgba(255,255,255,0.88)',
          shadowColor: isDark ? '#000' : '#93c5fd',
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
        name="manage"
        options={{
          title: '管理',
          tabBarIcon: ({ color, size }) => <LayoutGrid color={color} size={size} />,
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
