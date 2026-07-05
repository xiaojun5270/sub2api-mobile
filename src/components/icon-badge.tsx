import type { LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';

import { useAppTheme } from '@/src/lib/theme';

type IconBadgeTone = 'primary' | 'success' | 'danger' | 'accent' | 'muted';

type IconBadgeProps = {
  icon: LucideIcon;
  tone?: IconBadgeTone;
  size?: number;
  containerSize?: number;
};

export function IconBadge({ icon: Icon, tone = 'primary', size = 18, containerSize = 38 }: IconBadgeProps) {
  const colors = useAppTheme();
  const palette = {
    primary: { backgroundColor: colors.iconSoftBg, color: colors.primary },
    success: { backgroundColor: colors.successBg, color: colors.success },
    danger: { backgroundColor: colors.dangerBg, color: colors.danger },
    accent: { backgroundColor: colors.accentBg, color: colors.accentText },
    muted: { backgroundColor: colors.mutedCard, color: colors.subtext },
  }[tone];

  return (
    <View
      style={{
        alignItems: 'center',
        backgroundColor: palette.backgroundColor,
        borderRadius: containerSize / 2,
        height: containerSize,
        justifyContent: 'center',
        width: containerSize,
      }}
    >
      <Icon color={palette.color} size={size} strokeWidth={2.25} />
    </View>
  );
}
