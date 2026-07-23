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

function getWidgetDataModule() {
  return NativeModules.Sub2ApiWidgetData as WidgetDataModule | undefined;
}

export async function saveHomeWidgetSnapshot(snapshot: HomeWidgetSnapshot) {
  const widgetDataModule = getWidgetDataModule();
  if (Platform.OS === 'web') return true;
  if (!widgetDataModule?.saveSnapshot) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[home-widget] Sub2ApiWidgetData native module is unavailable.');
    }

    return false;
  }

  try {
    await widgetDataModule.saveSnapshot(JSON.stringify(snapshot));
    return true;
  } catch (error) {
    // Widgets are optional native surfaces; the app should keep working if unavailable.
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[home-widget] Failed to save widget snapshot.', error);
    }

    return false;
  }
}
