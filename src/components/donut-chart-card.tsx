import type { LucideIcon } from 'lucide-react-native';
import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { IconBadge } from '@/src/components/icon-badge';
import { useAppTheme } from '@/src/lib/theme';

type DonutSegment = {
  label: string;
  value: number;
  color: string;
};

type DonutChartCardProps = {
  title: string;
  subtitle: string;
  segments: DonutSegment[];
  centerLabel: string;
  centerValue: string;
  icon?: LucideIcon;
};

export function DonutChartCard({
  title,
  subtitle,
  segments,
  centerLabel,
  centerValue,
  icon,
}: DonutChartCardProps) {
  const colors = useAppTheme();
  const total = Math.max(
    segments.reduce((sum, segment) => sum + segment.value, 0),
    1
  );
  const size = 152;
  const strokeWidth = 16;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;

  return (
    <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, padding: 16 }}>
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: 10 }}>
        {icon ? <IconBadge icon={icon} containerSize={34} size={16} /> : null}
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.subtext, fontSize: 12, letterSpacing: 1.6, textTransform: 'uppercase' }}>{title}</Text>
          <Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 12, marginTop: 4 }}>{subtitle}</Text>
        </View>
      </View>

      <View className="mt-4 items-center justify-center">
        <View className="items-center justify-center">
          <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={colors.chartTrack}
              strokeWidth={strokeWidth}
              fill="none"
            />
            {segments.map((segment) => {
              const length = (segment.value / total) * circumference;
              const circleOffset = circumference - offset;
              offset += length;

              return (
                <Circle
                  key={segment.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  stroke={segment.color}
                  strokeWidth={strokeWidth}
                  fill="none"
                  strokeDasharray={`${length} ${circumference - length}`}
                  strokeDashoffset={circleOffset}
                  strokeLinecap="round"
                  transform={`rotate(-90 ${size / 2} ${size / 2})`}
                />
              );
            })}
          </Svg>

          <View className="absolute items-center">
            <Text style={{ color: colors.subtext, fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase' }}>{centerLabel}</Text>
            <Text style={{ color: colors.text, fontSize: 28, fontWeight: '700', marginTop: 4 }}>{centerValue}</Text>
          </View>
        </View>
      </View>

      <View className="mt-4 gap-2.5">
        {segments.map((segment) => {
          const percentage = Math.round((segment.value / total) * 100);

          return (
            <View
              key={segment.label}
              style={{ alignItems: 'center', backgroundColor: colors.chartPanel, borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10 }}
            >
              <View className="flex-row items-center gap-3">
                <View className="h-3 w-3 rounded-full" style={{ backgroundColor: segment.color }} />
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>{segment.label}</Text>
              </View>
              <Text style={{ color: colors.badgeDefaultText, fontSize: 12 }}>{segment.value} · {percentage}%</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
