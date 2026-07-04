import type { PropsWithChildren, ReactNode } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Edge } from 'react-native-safe-area-context';
import { RefreshControl, ScrollView, Text, View } from 'react-native';

import { useAppTheme } from '@/src/lib/theme';

type ScreenShellProps = PropsWithChildren<{
  title: string;
  subtitle: string;
  titleAside?: ReactNode;
  right?: ReactNode;
  variant?: 'card' | 'minimal';
  scroll?: boolean;
  bottomInsetClassName?: string;
  horizontalInsetClassName?: string;
  contentGapClassName?: string;
  refreshing?: boolean;
  onRefresh?: () => void | Promise<void>;
  safeAreaEdges?: Edge[];
}>;

function ScreenHeader({
  title,
  subtitle,
  titleAside,
  right,
  variant,
}: Pick<ScreenShellProps, 'title' | 'subtitle' | 'titleAside' | 'right' | 'variant'>) {
  const colors = useAppTheme();

  if (variant === 'minimal') {
    return (
      <View className="mt-4 flex-row items-start justify-between gap-4 px-1 py-1">
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>{title}</Text>
            {titleAside}
          </View>
          {subtitle ? (
            <Text numberOfLines={1} style={{ marginTop: 4, color: colors.subtext, fontSize: 11, lineHeight: 16 }}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right ? <View className="items-end justify-start">{right}</View> : null}
      </View>
    );
  }

  return (
    <View
      className="mt-4 px-4 py-4"
      style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1 }}
    >
      <View className="flex-row items-start justify-between gap-4">
        <View className="flex-1">
          <Text style={{ color: colors.text, fontSize: 24, fontWeight: '700' }}>{title}</Text>
          <Text numberOfLines={1} style={{ marginTop: 4, color: colors.subtext, fontSize: 12, lineHeight: 16 }}>
            {subtitle}
          </Text>
        </View>
        {right}
      </View>
    </View>
  );
}

export function ScreenShell({
  title,
  subtitle,
  titleAside,
  right,
  children,
  variant = 'card',
  scroll = true,
  bottomInsetClassName = 'pb-24',
  horizontalInsetClassName = 'px-5',
  contentGapClassName = 'mt-4 gap-4',
  refreshing = false,
  onRefresh,
  safeAreaEdges = ['top', 'bottom'],
}: ScreenShellProps) {
  const colors = useAppTheme();

  if (!scroll) {
    return (
      <SafeAreaView edges={safeAreaEdges} style={{ flex: 1, backgroundColor: colors.page }}>
        <View className={`flex-1 ${horizontalInsetClassName} ${bottomInsetClassName}`}>
          <ScreenHeader title={title} subtitle={subtitle} titleAside={titleAside} right={right} variant={variant} />
          <View className={`flex-1 ${contentGapClassName}`}>{children}</View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={safeAreaEdges} style={{ flex: 1, backgroundColor: colors.page }}>
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined}
      >
        <View className={`${horizontalInsetClassName} ${bottomInsetClassName}`}>
          <ScreenHeader title={title} subtitle={subtitle} titleAside={titleAside} right={right} variant={variant} />
          <View className={contentGapClassName}>{children}</View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
