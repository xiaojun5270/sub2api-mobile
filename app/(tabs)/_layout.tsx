import { Redirect, Tabs } from 'expo-router';
import { ChartNoAxesCombined, ServerCog, UsersRound } from 'lucide-react-native';

import { adminConfigState, hasAuthenticatedAdminSession } from '@/src/store/admin-config';

const { useSnapshot } = require('valtio/react');

export default function TabsLayout() {
  const config = useSnapshot(adminConfigState);
  const hasAccount = hasAuthenticatedAdminSession(config);

  if (!hasAccount) {
    return <Redirect href="/login" />;
  }

  return (
    <Tabs
      initialRouteName={hasAccount ? 'monitor' : 'settings'}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#0f766e',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarStyle: {
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: 12,
          backgroundColor: '#ffffff',
          borderTopWidth: 0,
          borderRadius: 20,
          height: 72,
          paddingTop: 8,
          paddingBottom: 12,
          shadowColor: '#0f172a',
          shadowOpacity: 0.1,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 10 },
          elevation: 12,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          href: null,
        }}
      />
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
