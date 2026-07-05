import '@/src/global.css';

import { QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { queryClient } from '@/src/lib/query-client';
import { useAppTheme } from '@/src/lib/theme';
import { markPerformance } from '@/src/lib/performance';
import { adminConfigState, hydrateAdminConfig } from '@/src/store/admin-config';

const { useSnapshot } = require('valtio/react');

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

export default function RootLayout() {
  const config = useSnapshot(adminConfigState);
  const colors = useAppTheme();

  useEffect(() => {
    hydrateAdminConfig()
      .then(() => markPerformance('config_hydrated'))
      .catch(() => undefined);
  }, []);

  const isReady = config.hydrated;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar backgroundColor={colors.page} style={colors.mode === 'dark' ? 'light' : 'dark'} />
      <QueryClientProvider client={queryClient}>
        {!isReady ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.page }}>
            <ActivityIndicator color={colors.primary} />
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
                headerTintColor: colors.text,
                headerStyle: { backgroundColor: colors.page },
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
                headerTintColor: colors.text,
                headerStyle: { backgroundColor: colors.page },
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
                headerTintColor: colors.text,
                headerStyle: { backgroundColor: colors.page },
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
                headerTintColor: colors.text,
                headerStyle: { backgroundColor: colors.page },
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
                headerTintColor: colors.text,
                headerStyle: { backgroundColor: colors.page },
                headerShadowVisible: false,
              }}
            />
            <Stack.Screen
              name="accounts/[id]"
              options={{
                animation: 'slide_from_right',
                presentation: 'card',
                headerShown: true,
                title: '账号详情',
                headerBackTitle: '返回',
                headerTintColor: colors.text,
                headerStyle: { backgroundColor: colors.page },
                headerShadowVisible: false,
              }}
            />
            <Stack.Screen
              name="api-keys/index"
              options={{
                animation: 'slide_from_right',
                presentation: 'card',
                headerShown: true,
                title: 'API 密钥管理',
                headerBackTitle: '返回',
                headerTintColor: colors.text,
                headerStyle: { backgroundColor: colors.page },
                headerShadowVisible: false,
              }}
            />
            <Stack.Screen
              name="ops/index"
              options={{
                animation: 'slide_from_right',
                presentation: 'card',
                headerShown: true,
                title: '运维监控',
                headerBackTitle: '返回',
                headerTintColor: colors.text,
                headerStyle: { backgroundColor: colors.page },
                headerShadowVisible: false,
              }}
            />
          </Stack>
        )}
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
