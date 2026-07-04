import { Text, View } from 'react-native';

type DetailRowProps = {
  label: string;
  value: string;
};

export function DetailRow({ label, value }: DetailRowProps) {
  return (
    <View className="flex-row items-start justify-between gap-4 border-b border-[#e2e8f0] py-3 last:border-b-0">
      <Text className="text-sm text-[#64748b]">{label}</Text>
      <Text className="max-w-[62%] text-right text-sm font-medium text-[#0f172a]">{value}</Text>
    </View>
  );
}
