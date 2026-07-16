import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';
import { AppState } from 'react-native';

type RefreshCallback = (() => void | Promise<void>) | undefined;

type AutoRefreshOptions = {
  enabled?: boolean;
  intervalMs?: number;
  refreshing?: boolean;
};

export const DEFAULT_AUTO_REFRESH_INTERVAL_MS = 30_000;

export function useAutoRefresh(
  onRefresh: RefreshCallback,
  {
    enabled = true,
    intervalMs = DEFAULT_AUTO_REFRESH_INTERVAL_MS,
    refreshing = false,
  }: AutoRefreshOptions = {}
) {
  const callbackRef = useRef(onRefresh);
  const refreshingRef = useRef(refreshing);
  const hasFocusedRef = useRef(false);
  const hasRefreshCallback = Boolean(onRefresh);
  callbackRef.current = onRefresh;
  refreshingRef.current = refreshing;

  useFocusEffect(
    useCallback(() => {
      if (!enabled || !hasRefreshCallback || intervalMs <= 0) return undefined;

      let currentAppState = AppState.currentState;
      let interval: ReturnType<typeof setInterval> | undefined;

      const refresh = () => {
        if (refreshingRef.current || !callbackRef.current) return;

        try {
          void Promise.resolve(callbackRef.current()).catch(() => undefined);
        } catch {
          return;
        }
      };

      const stopInterval = () => {
        if (interval) clearInterval(interval);
        interval = undefined;
      };

      const startInterval = () => {
        stopInterval();
        interval = setInterval(refresh, intervalMs);
      };

      if (hasFocusedRef.current) {
        refresh();
      } else {
        hasFocusedRef.current = true;
      }

      if (currentAppState === 'active') startInterval();

      const appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
        const becameActive = currentAppState !== 'active' && nextAppState === 'active';
        currentAppState = nextAppState;

        if (nextAppState === 'active') {
          if (becameActive) refresh();
          startInterval();
        } else {
          stopInterval();
        }
      });

      return () => {
        stopInterval();
        appStateSubscription.remove();
      };
    }, [enabled, hasRefreshCallback, intervalMs])
  );
}
