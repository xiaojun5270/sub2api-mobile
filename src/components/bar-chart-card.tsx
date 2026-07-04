import { CircleHelp } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useAppTheme } from '@/src/lib/theme';

type BarChartItem = {
  label: string;
  value: number;
  color?: string;
  meta?: string;
  hint?: string;
};

type BarChartCardProps = {
  title: string;
  subtitle: string;
  items: BarChartItem[];
  formatValue?: (value: number) => string;
};

export function BarChartCard({
  title,
  subtitle,
  items,
  formatValue = (value) => `${value}`,
}: BarChartCardProps) {
  const colors = useAppTheme();
  const [activeHint, setActiveHint] = useState<string | null>(null);
  const maxValue = Math.max(...items.map((item) => item.value), 1);

  return (
    <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, padding: 16 }}>
      <Text style={{ color: colors.subtext, fontSize: 12, letterSpacing: 1.6, textTransform: 'uppercase' }}>{title}</Text>
      <Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 12, marginTop: 4 }}>{subtitle}</Text>

      <View className="mt-4 gap-3">
        {items.map((item) => {
          const barWidth = `${Math.max((item.value / maxValue) * 100, item.value > 0 ? 8 : 0)}%` as `${number}%`;

          return (
            <View key={item.label} className="w-full">
              <View className="w-full flex-row items-center justify-between gap-3">
                <View className="flex-1 flex-row items-center gap-1.5 pr-3">
                  <Text numberOfLines={1} style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>
                    {item.label}
                  </Text>
                  {item.hint ? (
                    <Pressable
                      style={{ alignItems: 'center', backgroundColor: colors.iconSoftBg, borderRadius: 999, height: 16, justifyContent: 'center', width: 16 }}
                      onPress={() => setActiveHint(activeHint === item.label ? null : item.label)}
                    >
                      <CircleHelp color={colors.subtext} size={11} />
                    </Pressable>
                  ) : null}
                </View>
                <Text style={{ color: colors.badgeDefaultText, fontSize: 14, fontWeight: '600' }}>{formatValue(item.value)}</Text>
              </View>

              {item.hint && activeHint === item.label ? (
                <View style={{ backgroundColor: colors.chartPanel, borderRadius: 10, marginTop: 8, paddingHorizontal: 12, paddingVertical: 8 }}>
                  <Text style={{ color: colors.subtext, fontSize: 11, lineHeight: 16 }}>{item.hint}</Text>
                </View>
              ) : null}

              <View className="mt-1 flex-row items-end justify-between gap-3">
                <View className="flex-1 pr-3">
                  {item.meta ? <Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 11 }}>{item.meta}</Text> : null}
                </View>
              </View>

              <View style={{ backgroundColor: colors.chartTrack, borderRadius: 999, height: 10, marginTop: 8, overflow: 'hidden' }}>
                <View
                  style={{
                    borderRadius: 999,
                    height: '100%',
                    width: barWidth,
                    backgroundColor: item.color || '#0f766e',
                  }}
                />
              </View>
            </View>
          );
        })}

        {items.length === 0 ? <Text style={{ color: colors.subtext, fontSize: 14 }}>暂无可视化数据</Text> : null}
      </View>
    </View>
  );
}
