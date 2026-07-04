import { useQuery } from '@tanstack/react-query';
import { FolderKanban, Layers3, Search } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, Text, TextInput, View } from 'react-native';

import { ListCard } from '@/src/components/list-card';
import { ScreenShell } from '@/src/components/screen-shell';
import { useDebouncedValue } from '@/src/hooks/use-debounced-value';
import { listGroups } from '@/src/services/admin';

export default function GroupsScreen() {
  const [searchText, setSearchText] = useState('');
  const keyword = useDebouncedValue(searchText.trim(), 300);

  const groupsQuery = useQuery({
    queryKey: ['groups', keyword],
    queryFn: () => listGroups(keyword),
  });

  const items = groupsQuery.data?.items ?? [];
  const errorMessage = groupsQuery.error instanceof Error ? groupsQuery.error.message : '';
  const listHeader = useMemo(
    () => (
      <View className="pb-4">
        <View className="flex-row items-center rounded-[18px] border border-[#dbe5ef] bg-white px-4 py-3">
          <Search color="#64748b" size={18} />
          <TextInput
            defaultValue=""
            onChangeText={setSearchText}
            placeholder="搜索分组名称"
            placeholderTextColor="#94a3b8"
            className="ml-3 flex-1 text-base text-[#0f172a]"
          />
        </View>
      </View>
    ),
    []
  );
  const renderItem = useCallback(
    ({ item: group }: { item: (typeof items)[number] }) => (
      <ListCard
        title={group.name}
        meta={`${group.platform} · 倍率 ${group.rate_multiplier ?? 1} · ${group.subscription_type || 'standard'}`}
        badge={group.status || 'active'}
        icon={FolderKanban}
      >
        <View className="flex-row items-center gap-2">
          <Layers3 color="#64748b" size={14} />
          <Text className="text-sm text-[#64748b]">
            账号数 {group.account_count ?? 0} · {group.is_exclusive ? '独占分组' : '共享分组'}
          </Text>
        </View>
      </ListCard>
    ),
    []
  );
  const emptyState = useMemo(
    () => <ListCard title="暂无分组" meta={errorMessage || '连上 Sub2API 后，这里会展示分组列表。'} icon={FolderKanban} />,
    [errorMessage]
  );

  return (
    <ScreenShell
      title="分组管理"
      subtitle=""
      titleAside={<Text className="text-[11px] text-[#a2988a]">查看分组与调度归属。</Text>}
      variant="minimal"
      scroll={false}
    >
      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => `${item.id}`}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={groupsQuery.isRefetching} onRefresh={() => void groupsQuery.refetch()} tintColor="#0f766e" />}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={emptyState}
        ItemSeparatorComponent={() => <View className="h-4" />}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={5}
      />
    </ScreenShell>
  );
}
