import type { LucideIcon } from 'lucide-react-native';
import { TrendingDown, TrendingUp } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { useAppTheme } from '@/src/lib/theme';

type StatCardProps = {
  label: string;
  value: string;
  tone?: 'light' | 'dark';
  trend?: 'up' | 'down';
  icon?: LucideIcon;
};

export function StatCard({ label, value, tone = 'light', trend, icon: Icon }: StatCardProps) {
  const colors = useAppTheme();
  const dark = tone === 'dark';
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : null;
  const labelColor = dark ? colors.primaryText : colors.subtext;

  return (
    <View
      style={{
        backgroundColor: dark ? colors.primary : colors.card,
        borderColor: colors.border,
        borderRadius: 18,
        borderWidth: dark ? 0 : 1,
        padding: 16,
      }}
    >
      <View className="flex-row items-center justify-between gap-3">
        <Text style={{ color: labelColor, fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase' }}>
          {label}
        </Text>
        <View className="flex-row items-center gap-2">
          {TrendIcon ? <TrendIcon color={labelColor} size={14} /> : null}
          {Icon ? <Icon color={labelColor} size={14} /> : null}
        </View>
      </View>
      <Text style={{ color: dark ? colors.primaryText : colors.text, fontSize: 30, fontWeight: '700', marginTop: 12 }}>
        {value}
      </Text>
    </View>
  );
}
