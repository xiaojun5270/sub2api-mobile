import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { useAppTheme } from '@/src/lib/theme';

type ListCardProps = {
  title: string;
  meta?: string;
  badge?: string;
  badgeTone?: 'default' | 'success' | 'muted' | 'danger';
  children?: ReactNode;
  compact?: boolean;
  icon?: LucideIcon;
  metaInline?: boolean;
};

export function ListCard({ title, meta, badge, badgeTone = 'default', children, compact, icon: Icon, metaInline }: ListCardProps) {
  const colors = useAppTheme();
  const badgeColors = {
    default: { backgroundColor: colors.badgeDefaultBg, color: colors.badgeDefaultText },
    success: { backgroundColor: colors.successBg, color: colors.success },
    muted: { backgroundColor: colors.badgeMutedBg, color: colors.badgeMutedText },
    danger: { backgroundColor: colors.dangerBg, color: colors.danger },
  }[badgeTone];

  return (
    <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: 16, borderWidth: 1, padding: compact ? 8 : 14 }}>
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            {Icon ? (
              <View style={{ alignItems: 'center', backgroundColor: colors.iconSoftBg, borderRadius: 999, height: compact ? 28 : 32, justifyContent: 'center', width: compact ? 28 : 32 }}>
                <Icon color={colors.primary} size={compact ? 14 : 16} />
              </View>
            ) : null}
            <Text numberOfLines={1} style={{ color: colors.text, flexShrink: 1, fontSize: compact ? 15 : 16, fontWeight: '600' }}>{title}</Text>
            {meta && metaInline ? (
              <Text
                numberOfLines={1}
                style={{
                  backgroundColor: colors.mutedCard,
                  borderRadius: 999,
                  color: colors.badgeDefaultText,
                  flexShrink: 0,
                  fontSize: 10,
                  fontWeight: '700',
                  maxWidth: 138,
                  paddingHorizontal: 7,
                  paddingVertical: 3,
                }}
              >
                {meta}
              </Text>
            ) : null}
          </View>
          {meta && !metaInline ? <Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 12, marginTop: compact ? 2 : 4 }}>{meta}</Text> : null}
        </View>
        {badge ? (
          <View style={{ backgroundColor: badgeColors.backgroundColor, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ color: badgeColors.color, fontSize: 10, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' }}>{badge}</Text>
          </View>
        ) : null}
      </View>
      {children ? <View style={{ marginTop: compact ? 5 : 12 }}>{children}</View> : null}
    </View>
  );
}
