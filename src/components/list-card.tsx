import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

type ListCardProps = {
  title: string;
  meta?: string;
  badge?: string;
  badgeTone?: 'default' | 'success' | 'muted' | 'danger';
  children?: ReactNode;
  icon?: LucideIcon;
};

const badgeClassMap: Record<NonNullable<ListCardProps['badgeTone']>, { wrap: string; text: string }> = {
  default: {
    wrap: 'rounded-full bg-[#eef3f8] px-2.5 py-1',
    text: 'text-[10px] font-semibold uppercase tracking-[1px] text-[#475569]',
  },
  success: {
    wrap: 'rounded-full bg-[#ecfdf5] px-2.5 py-1',
    text: 'text-[10px] font-semibold uppercase tracking-[1px] text-[#0f766e]',
  },
  muted: {
    wrap: 'rounded-full bg-[#f1f5f9] px-2.5 py-1',
    text: 'text-[10px] font-semibold uppercase tracking-[1px] text-[#64748b]',
  },
  danger: {
    wrap: 'rounded-full bg-[#fef2f2] px-2.5 py-1',
    text: 'text-[10px] font-semibold uppercase tracking-[1px] text-[#dc2626]',
  },
};

export function ListCard({ title, meta, badge, badgeTone = 'default', children, icon: Icon }: ListCardProps) {
  const badgeClass = badgeClassMap[badgeTone];

  return (
    <View className="rounded-[16px] border border-[#dbe5ef] bg-white p-3.5">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            {Icon ? (
              <View className="h-8 w-8 items-center justify-center rounded-full bg-[#eef3f8]">
                <Icon color="#0f766e" size={16} />
              </View>
            ) : null}
            <Text className="flex-1 text-base font-semibold text-[#0f172a]">{title}</Text>
          </View>
          {meta ? <Text numberOfLines={1} className="mt-1 text-xs text-[#64748b]">{meta}</Text> : null}
        </View>
        {badge ? (
          <View className={badgeClass.wrap}>
            <Text className={badgeClass.text}>{badge}</Text>
          </View>
        ) : null}
      </View>
      {children ? <View className="mt-3">{children}</View> : null}
    </View>
  );
}
