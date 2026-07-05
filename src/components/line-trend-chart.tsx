import type { LucideIcon } from 'lucide-react-native';
import { useMemo } from 'react';
import { Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { IconBadge } from '@/src/components/icon-badge';
import { useAppTheme } from '@/src/lib/theme';

type Point = {
  label: string;
  value: number;
};

type LineTrendChartProps = {
  points: Point[];
  color?: string;
  title: string;
  subtitle: string;
  icon?: LucideIcon;
  formatValue?: (value: number) => string;
  compact?: boolean;
};

export function LineTrendChart({
  points,
  color = '#0f766e',
  title,
  subtitle,
  icon,
  formatValue = (value) => `${value}`,
  compact = false,
}: LineTrendChartProps) {
  const colors = useAppTheme();
  const width = 320;
  const height = compact ? 104 : 144;
  const maxValue = Math.max(...points.map((point) => point.value), 1);
  const minValue = Math.min(...points.map((point) => point.value), 0);
  const range = Math.max(maxValue - minValue, 1);
  const gradientId = useMemo(
    () => `trendFill-${title.replace(/[^a-zA-Z0-9_-]/g, '')}-${compact ? 'compact' : 'full'}`,
    [compact, title]
  );

  const line = points
    .map((point, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * width;
      const y = height - ((point.value - minValue) / range) * (height - 18) - 12;

      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

  const area = `${line} L ${width} ${height} L 0 ${height} Z`;
  const latest = points[points.length - 1]?.value ?? 0;
  const maxTicks = compact ? 6 : 7;
  const tickStep = Math.max(Math.ceil(points.length / maxTicks), 1);
  const tickPoints = points.filter((_, index) => index === 0 || index === points.length - 1 || index % tickStep === 0);

  return (
    <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, padding: 16 }}>
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: 10 }}>
        {icon ? <IconBadge icon={icon} containerSize={34} size={16} /> : null}
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.subtext, fontSize: 12, letterSpacing: 1.6, textTransform: 'uppercase' }}>{title}</Text>
          <Text style={{ color: colors.text, fontSize: compact ? 22 : 28, fontWeight: '700', marginTop: 4 }}>{formatValue(latest)}</Text>
          <Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 12, marginTop: 4 }}>{subtitle}</Text>
        </View>
      </View>

      <View style={{ backgroundColor: colors.chartPanel, borderRadius: 14, marginTop: compact ? 12 : 16, overflow: 'hidden', padding: 12 }}>
        <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
          <Defs>
            <LinearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <Stop offset="0%" stopColor={color} stopOpacity="0.28" />
              <Stop offset="100%" stopColor={color} stopOpacity="0.02" />
            </LinearGradient>
          </Defs>
          <Path d={area} fill={`url(#${gradientId})`} />
          <Path d={line} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        </Svg>

        <View className="mt-2 flex-row justify-between">
          {tickPoints.map((point, index) => (
            <Text key={`${point.label}-${index}`} style={{ color: colors.subtext, fontSize: compact ? 10 : 12 }}>
              {point.label}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}
