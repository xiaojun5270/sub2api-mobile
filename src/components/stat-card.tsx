import type { LucideIcon } from 'lucide-react-native';
import { TrendingDown, TrendingUp } from 'lucide-react-native';
import { Text, View } from 'react-native';

type StatCardProps = {
  label: string;
  value: string;
  tone?: 'light' | 'dark';
  trend?: 'up' | 'down';
  icon?: LucideIcon;
};

export function StatCard({ label, value, tone = 'light', trend, icon: Icon }: StatCardProps) {
  const dark = tone === 'dark';
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : null;

  return (
    <View className={dark ? 'rounded-[18px] bg-[#0f766e] p-4' : 'rounded-[18px] border border-[#dbe5ef] bg-white p-4'}>
      <View className="flex-row items-center justify-between gap-3">
        <Text className={dark ? 'text-xs uppercase tracking-[1.5px] text-[#ccfbf1]' : 'text-xs uppercase tracking-[1.5px] text-[#64748b]'}>
          {label}
        </Text>
        <View className="flex-row items-center gap-2">
          {TrendIcon ? <TrendIcon color={dark ? '#ccfbf1' : '#64748b'} size={14} /> : null}
          {Icon ? <Icon color={dark ? '#ccfbf1' : '#64748b'} size={14} /> : null}
        </View>
      </View>
      <Text className={dark ? 'mt-3 text-3xl font-bold text-white' : 'mt-3 text-3xl font-bold text-[#0f172a]'}>
        {value}
      </Text>
    </View>
  );
}
