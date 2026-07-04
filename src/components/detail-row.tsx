import { Text, View } from 'react-native';

import { useAppTheme } from '@/src/lib/theme';

type DetailRowProps = {
  label: string;
  value: string;
};

export function DetailRow({ label, value }: DetailRowProps) {
  const colors = useAppTheme();

  return (
    <View style={{ borderBottomColor: colors.rowBorder, borderBottomWidth: 1, flexDirection: 'row', gap: 16, justifyContent: 'space-between', paddingVertical: 12 }}>
      <Text style={{ color: colors.subtext, fontSize: 14 }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 14, fontWeight: '500', maxWidth: '62%', textAlign: 'right' }}>{value}</Text>
    </View>
  );
}
