import '@/src/global.css';

import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { queryClient } from '@/src/lib/query-client';
import { markPerformance } from '@/src/lib/performance';
import { adminConfigState, hydrateAdminConfig } from '@/src/store/admin-config';

const { useSnapshot } = require('valtio/react');

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

export default function RootLayout() {
  const config = useSnapshot(adminConfigState);

  useEffect(() => {
    hydrateAdminConfig()
      .then(() => markPerformance('config_hydrated'))
      .catch(() => undefined);
  }, []);

  const isReady = config.hydrated;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        {!isReady ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f7f9fc' }}>
            <ActivityIndicator color="#0f766e" />
          </View>
        ) : (
          <Stack initialRouteName="(tabs)" screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="login" />
            <Stack.Screen
              name="users/[id]"
              options={{
                animation: 'slide_from_right',
                presentation: 'card',
                headerShown: true,
                title: '用户详情',
                headerBackTitle: '返回',
                headerTintColor: '#0f172a',
                headerStyle: { backgroundColor: '#f7f9fc' },
                headerShadowVisible: false,
              }}
            />
            <Stack.Screen
              name="users/create-account"
              options={{
                animation: 'slide_from_right',
                presentation: 'card',
                headerShown: true,
                title: '添加账号',
                headerBackTitle: '返回',
                headerTintColor: '#0f172a',
                headerStyle: { backgroundColor: '#f7f9fc' },
                headerShadowVisible: false,
              }}
            />
            <Stack.Screen
              name="users/create-user"
              options={{
                animation: 'slide_from_right',
                presentation: 'card',
                headerShown: true,
                title: '添加用户',
                headerBackTitle: '返回',
                headerTintColor: '#0f172a',
                headerStyle: { backgroundColor: '#f7f9fc' },
                headerShadowVisible: false,
              }}
            />
            <Stack.Screen
              name="accounts/create"
              options={{
                animation: 'slide_from_right',
                presentation: 'card',
                headerShown: true,
                title: '添加账号',
                headerBackTitle: '返回',
                headerTintColor: '#0f172a',
                headerStyle: { backgroundColor: '#f7f9fc' },
                headerShadowVisible: false,
              }}
            />
            <Stack.Screen
              name="accounts/overview"
              options={{
                animation: 'slide_from_right',
                presentation: 'card',
                headerShown: true,
                title: '账号清单',
                headerBackTitle: '返回',
                headerTintColor: '#0f172a',
                headerStyle: { backgroundColor: '#f7f9fc' },
                headerShadowVisible: false,
              }}
            />
          </Stack>
        )}
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
