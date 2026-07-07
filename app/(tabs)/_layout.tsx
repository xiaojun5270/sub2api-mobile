import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Redirect, Tabs } from 'expo-router';
import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { ChartNoAxesCombined, LayoutGrid, ServerCog, UsersRound } from 'lucide-react-native';
import { DynamicColorIOS, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { adminConfigState, hasAuthenticatedAdminSession } from '@/src/store/admin-config';

const { useSnapshot } = require('valtio/react');

const ANDROID_TAB_ACTIVE_COLOR = '#2563eb';
const ANDROID_TAB_INACTIVE_COLOR = '#111827';

function AndroidSelectedTabGlow() {
  return (
    <Svg height={76} pointerEvents="none" style={styles.androidTabGlow} width={76}>
      <Defs>
        <RadialGradient cx="50%" cy="50%" id="androidSelectedTabGlow" r="50%">
          <Stop offset="0" stopColor="#e6e9ee" stopOpacity="0.96" />
          <Stop offset="0.48" stopColor="#eef0f3" stopOpacity="0.7" />
          <Stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Circle cx={38} cy={38} fill="url(#androidSelectedTabGlow)" r={38} />
    </Svg>
  );
}

function AndroidPillTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const visibleRoutes = state.routes
    .map((route, routeIndex) => ({
      options: descriptors[route.key].options,
      route,
      routeIndex,
    }))
    .filter(({ options }) => (options as { href?: unknown }).href !== null);

  return (
    <View pointerEvents="box-none" style={[styles.androidTabBarContainer, { bottom: Math.max(insets.bottom + 8, 13) }]}>
      <View style={styles.androidTabBar}>
        {visibleRoutes.map(({ options, route, routeIndex }) => {
          const focused = state.index === routeIndex;
          const color = focused ? ANDROID_TAB_ACTIVE_COLOR : ANDROID_TAB_INACTIVE_COLOR;
          const labelSource = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : options.title;
          const label = labelSource ?? route.name;

          const onPress = () => {
            const event = navigation.emit({
              canPreventDefault: true,
              target: route.key,
              type: 'tabPress',
            });

            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              target: route.key,
              type: 'tabLongPress',
            });
          };

          return (
            <Pressable
              accessibilityLabel={options.tabBarAccessibilityLabel}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : undefined}
              key={route.key}
              onLongPress={onLongPress}
              onPress={onPress}
              style={styles.androidTabItem}
              testID={options.tabBarButtonTestID}
            >
              {focused ? <AndroidSelectedTabGlow /> : null}
              <View style={styles.androidTabContent}>
                {options.tabBarIcon?.({
                  color,
                  focused,
                  size: focused ? 25 : 24,
                })}
                <Text
                  numberOfLines={1}
                  style={[
                    styles.androidTabLabel,
                    {
                      color,
                      fontWeight: focused ? '800' : '500',
                    },
                  ]}
                >
                  {label}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

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
    </NativeTabs>
  );
}

function FallbackBottomTabs() {
  return (
    <Tabs
      initialRouteName="monitor"
      tabBar={(props) => <AndroidPillTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: ANDROID_TAB_ACTIVE_COLOR,
        tabBarInactiveTintColor: ANDROID_TAB_INACTIVE_COLOR,
      }}
    >
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen
        name="monitor"
        options={{
          title: '概览',
          tabBarIcon: ({ color, focused, size }) => (
            <ChartNoAxesCombined color={color} size={focused ? size + 2 : size} strokeWidth={focused ? 2.75 : 2} />
          ),
        }}
      />
      <Tabs.Screen
        name="users"
        options={{
          title: '用户',
          tabBarIcon: ({ color, focused, size }) => <UsersRound color={color} size={focused ? size + 2 : size} strokeWidth={focused ? 2.75 : 2} />,
        }}
      />
      <Tabs.Screen
        name="manage"
        options={{
          title: '管理',
          tabBarIcon: ({ color, focused, size }) => <LayoutGrid color={color} size={focused ? size + 2 : size} strokeWidth={focused ? 2.75 : 2} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '服务器',
          tabBarIcon: ({ color, focused, size }) => <ServerCog color={color} size={focused ? size + 2 : size} strokeWidth={focused ? 2.75 : 2} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  androidTabBar: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#d7dce3',
    borderRadius: 46,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 12,
    flexDirection: 'row',
    height: 92,
    paddingHorizontal: 8,
    paddingVertical: 8,
    shadowColor: '#9ca3af',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
  },
  androidTabBarContainer: {
    bottom: 13,
    left: 14,
    position: 'absolute',
    right: 14,
  },
  androidTabContent: {
    alignItems: 'center',
    gap: 4,
    justifyContent: 'center',
    zIndex: 1,
  },
  androidTabGlow: {
    left: '50%',
    marginLeft: -38,
    position: 'absolute',
    top: 0,
  },
  androidTabItem: {
    alignItems: 'center',
    borderRadius: 38,
    flex: 1,
    height: 76,
    justifyContent: 'center',
    minWidth: 0,
    overflow: 'hidden',
  },
  androidTabLabel: {
    fontSize: 12,
    lineHeight: 15,
    textAlign: 'center',
  },
});

export default function TabsLayout() {
  const config = useSnapshot(adminConfigState);
  const hasAccount = hasAuthenticatedAdminSession(config);

  if (!hasAccount) {
    return <Redirect href="/login" />;
  }

  if (Platform.OS === 'ios') {
    return <NativeIosTabs />;
  }

  return <FallbackBottomTabs />;
}
