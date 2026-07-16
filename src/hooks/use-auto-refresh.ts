import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
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
  const [isAutoRefreshing, setIsAutoRefreshing] = useState(false);
  const callbackRef = useRef(onRefresh);
  const refreshingRef = useRef(refreshing);
  const hasFocusedRef = useRef(false);
  const autoRefreshActiveRef = useRef(false);
  const refreshObservedRef = useRef(false);
  const settleTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hasRefreshCallback = Boolean(onRefresh);
  callbackRef.current = onRefresh;
  refreshingRef.current = refreshing;

  const finishAutoRefresh = useCallback(() => {
    autoRefreshActiveRef.current = false;
    refreshObservedRef.current = false;
    if (settleTimeoutRef.current) clearTimeout(settleTimeoutRef.current);
    settleTimeoutRef.current = undefined;
    setIsAutoRefreshing(false);
  }, []);

  useEffect(() => {
    if (!autoRefreshActiveRef.current) return;

    if (refreshing) {
      refreshObservedRef.current = true;
      if (settleTimeoutRef.current) clearTimeout(settleTimeoutRef.current);
      settleTimeoutRef.current = undefined;
      return;
    }

    if (refreshObservedRef.current) finishAutoRefresh();
  }, [finishAutoRefresh, refreshing]);

  useFocusEffect(
    useCallback(() => {
      if (!enabled || !hasRefreshCallback || intervalMs <= 0) return undefined;

      let currentAppState = AppState.currentState;
      let interval: ReturnType<typeof setInterval> | undefined;

      const refresh = () => {
        if (refreshingRef.current || !callbackRef.current) return;

        autoRefreshActiveRef.current = true;
        refreshObservedRef.current = false;
        setIsAutoRefreshing(true);
        if (settleTimeoutRef.current) clearTimeout(settleTimeoutRef.current);
        settleTimeoutRef.current = setTimeout(() => {
          if (!refreshObservedRef.current) finishAutoRefresh();
        }, 1_500);

        try {
          void Promise.resolve(callbackRef.current()).catch(() => undefined);
        } catch {
          finishAutoRefresh();
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
        finishAutoRefresh();
      };
    }, [enabled, finishAutoRefresh, hasRefreshCallback, intervalMs])
  );

  return { isAutoRefreshing };
}
