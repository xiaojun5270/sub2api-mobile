import '@/src/global.css';

import { QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { router, Stack } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { queryClient } from '@/src/lib/query-client';
import { useAppTheme } from '@/src/lib/theme';
import { markPerformance } from '@/src/lib/performance';
import { adminConfigState, hydrateAdminConfig } from '@/src/store/admin-config';

const { useSnapshot } = require('valtio/react');

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

function HeaderBackButton({ fallbackHref }: { fallbackHref: string }) {
  const colors = useAppTheme();

  function handlePress() {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace(fallbackHref as Parameters<typeof router.replace>[0]);
  }

  return (
    <Pressable
      hitSlop={10}
      onPress={handlePress}
      style={{ alignItems: 'center', flexDirection: 'row', marginLeft: -6, paddingHorizontal: 6, paddingVertical: 8 }}
    >
      <ChevronLeft color={colors.primary} size={22} strokeWidth={2.4} />
      <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}>返回</Text>
    </Pressable>
  );
}

export default function RootLayout() {
  const config = useSnapshot(adminConfigState);
  const colors = useAppTheme();

  useEffect(() => {
    hydrateAdminConfig()
      .then(() => markPerformance('config_hydrated'))
      .catch(() => undefined);
  }, []);

  const getStackHeaderOptions = (title: string, fallbackHref: string) => ({
    animation: 'slide_from_right' as const,
    presentation: 'card' as const,
    headerShown: true,
    title,
    headerBackTitle: '返回',
    headerTintColor: colors.text,
    headerStyle: { backgroundColor: colors.page },
    headerShadowVisible: false,
    headerLeft: () => <HeaderBackButton fallbackHref={fallbackHref} />,
  });

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
              options={getStackHeaderOptions('用户详情', '/users')}
            />
            <Stack.Screen
              name="users/create-account"
              options={getStackHeaderOptions('添加账号', '/users')}
            />
            <Stack.Screen
              name="users/create-user"
              options={getStackHeaderOptions('添加用户', '/users')}
            />
            <Stack.Screen
              name="accounts/create"
              options={getStackHeaderOptions('添加账号', '/manage')}
            />
            <Stack.Screen
              name="accounts/overview"
              options={getStackHeaderOptions('账号清单', '/manage')}
            />
            <Stack.Screen
              name="accounts/[id]"
              options={getStackHeaderOptions('账号详情', '/manage')}
            />
            <Stack.Screen
              name="api-keys/index"
              options={getStackHeaderOptions('API 密钥管理', '/manage')}
            />
            <Stack.Screen
              name="ops/index"
              options={getStackHeaderOptions('运维监控', '/manage')}
            />
          </Stack>
        )}
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
