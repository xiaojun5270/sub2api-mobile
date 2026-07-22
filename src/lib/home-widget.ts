import { NativeModules, Platform } from 'react-native';

export const HOME_WIDGET_SNAPSHOT_KEY = 'sub2api_home_widget_snapshot';

export type HomeWidgetMetric = {
  label: string;
  value: string;
  detail?: string;
};

export type HomeWidgetGroupUsage = {
  id: string;
  name: string;
  requests: string;
  tokens: string;
  cost: string;
  percent: number;
};

export type HomeWidgetSnapshot = {
  version: 1;
  title: string;
  rangeLabel: string;
  updatedAt: string;
  updatedAtLabel: string;
  summary: {
    requests: HomeWidgetMetric;
    tokens: HomeWidgetMetric;
    cost: HomeWidgetMetric;
    accounts: HomeWidgetMetric;
  };
  groups: HomeWidgetGroupUsage[];
};

type WidgetDataModule = {
  saveSnapshot?: (json: string) => Promise<void>;
};

const widgetDataModule = NativeModules.Sub2ApiWidgetData as WidgetDataModule | undefined;

export async function saveHomeWidgetSnapshot(snapshot: HomeWidgetSnapshot) {
  if (Platform.OS === 'web' || !widgetDataModule?.saveSnapshot) return;

  try {
    await widgetDataModule.saveSnapshot(JSON.stringify(snapshot));
  } catch {
    // Widgets are optional native surfaces; the app should keep working if unavailable.
  }
}
