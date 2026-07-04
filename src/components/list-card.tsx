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
  icon?: LucideIcon;
};

export function ListCard({ title, meta, badge, badgeTone = 'default', children, icon: Icon }: ListCardProps) {
  const colors = useAppTheme();
  const badgeColors = {
    default: { backgroundColor: colors.badgeDefaultBg, color: colors.badgeDefaultText },
    success: { backgroundColor: colors.successBg, color: colors.success },
    muted: { backgroundColor: colors.badgeMutedBg, color: colors.badgeMutedText },
    danger: { backgroundColor: colors.dangerBg, color: colors.danger },
  }[badgeTone];

  return (
    <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: 16, borderWidth: 1, padding: 14 }}>
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            {Icon ? (
              <View style={{ alignItems: 'center', backgroundColor: colors.iconSoftBg, borderRadius: 999, height: 32, justifyContent: 'center', width: 32 }}>
                <Icon color={colors.primary} size={16} />
              </View>
            ) : null}
            <Text style={{ color: colors.text, flex: 1, fontSize: 16, fontWeight: '600' }}>{title}</Text>
          </View>
          {meta ? <Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 12, marginTop: 4 }}>{meta}</Text> : null}
        </View>
        {badge ? (
          <View style={{ backgroundColor: badgeColors.backgroundColor, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ color: badgeColors.color, fontSize: 10, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' }}>{badge}</Text>
          </View>
        ) : null}
      </View>
      {children ? <View style={{ marginTop: 12 }}>{children}</View> : null}
    </View>
  );
}
