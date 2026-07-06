import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Activity, AlertTriangle, ChevronRight, KeyRound, ServerCog, ShieldCheck } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import { IconBadge } from '@/src/components/icon-badge';
import { ScreenShell } from '@/src/components/screen-shell';
import { formatCompactNumber } from '@/src/lib/formatters';
import { useAppTheme } from '@/src/lib/theme';
import { getDashboardStats } from '@/src/services/admin';

type ManageModule = {
  title: string;
  subtitle: string;
  detail: string;
  icon: LucideIcon;
  href: '/accounts/overview' | '/api-keys' | '/ops';
  accent: string;
};

const MODULES: ManageModule[] = [
  {
    title: '账号管理',
    subtitle: '账号状态、调度、异常处理',
    detail: '查看账号清单、限流、错误和调度状态',
    icon: ShieldCheck,
    href: '/accounts/overview',
    accent: '#047857',
  },
  {
    title: 'API 密钥管理',
    subtitle: '密钥搜索、复制、分组调整',
    detail: '查看用户密钥、使用额度和关联分组',
    icon: KeyRound,
    href: '/api-keys',
    accent: '#2563eb',
  },
  {
    title: '运维监控',
    subtitle: '实时流量、错误、日志、告警',
    detail: '检查请求错误、系统日志和运行指标',
    icon: ServerCog,
    href: '/ops',
    accent: '#7c3aed',
  },
];

function StatTile({ label, value, icon: Icon }: { label: string; value: string; icon: LucideIcon }) {
  const colors = useAppTheme();

  return (
    <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: 16, borderWidth: 1, flex: 1, minWidth: 104, padding: 14 }}>
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: 8 }}>
        <Icon color={colors.primary} size={16} />
        <Text numberOfLines={1} style={{ color: colors.subtext, flex: 1, fontSize: 11 }}>{label}</Text>
      </View>
      <Text numberOfLines={1} style={{ color: colors.text, fontSize: 22, fontWeight: '800', marginTop: 8 }}>{value}</Text>
    </View>
  );
}

export default function ManageScreen() {
  const colors = useAppTheme();
  const statsQuery = useQuery({
    queryKey: ['manage-dashboard-stats'],
    queryFn: getDashboardStats,
    staleTime: 60_000,
  });
  const stats = statsQuery.data;

  return (
    <ScreenShell
      title="管理"
      subtitle="账号、API Key 和运维入口。"
      icon={ServerCog}
      variant="minimal"
      refreshing={statsQuery.isRefetching}
      onRefresh={() => {
        void statsQuery.refetch();
      }}
      bottomInsetClassName="pb-28"
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <StatTile label="账号" value={formatCompactNumber(stats?.total_accounts ?? 0)} icon={ShieldCheck} />
        <StatTile label="API Key" value={formatCompactNumber(stats?.total_api_keys ?? 0)} icon={KeyRound} />
        <StatTile label="今日请求" value={formatCompactNumber(stats?.today_requests ?? 0)} icon={Activity} />
        <StatTile label="异常账号" value={formatCompactNumber(stats?.error_accounts ?? 0)} icon={AlertTriangle} />
      </View>

      <View style={{ gap: 12 }}>
        {MODULES.map((item) => (
          <Pressable
            key={item.href}
            onPress={() => router.push(item.href)}
            style={({ pressed }) => ({
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderRadius: 18,
              borderWidth: 1,
              opacity: pressed ? 0.72 : 1,
              overflow: 'hidden',
              padding: 16,
            })}
          >
            <View style={{ backgroundColor: item.accent, bottom: 0, left: 0, opacity: colors.mode === 'dark' ? 0.16 : 0.1, position: 'absolute', top: 0, width: 4 }} />
            <View style={{ alignItems: 'center', flexDirection: 'row', gap: 13 }}>
              <IconBadge icon={item.icon} containerSize={42} size={20} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800' }}>{item.title}</Text>
                <Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 12, marginTop: 4 }}>{item.subtitle}</Text>
                <Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 11, marginTop: 7 }}>{item.detail}</Text>
              </View>
              <ChevronRight color={colors.subtext} size={18} />
            </View>
          </Pressable>
        ))}
      </View>
    </ScreenShell>
  );
}
