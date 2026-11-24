"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";

/** 비동기 로드 + 재시도 + 조용한 새로고침 */
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loaderRef = useRef(loader);
  useLayoutEffect(() => {
    loaderRef.current = loader;
  });

  const reload = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const v = await loaderRef.current();
      setData(v);
      setError(null);
    } catch (e) {
      // 조용한 새로고침 실패는 기존 화면 유지
      if (!silent) setError(errorMessage(e));
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    loaderRef
      .current()
      .then((v) => {
        if (!alive) return;
        setData(v);
        setError(null);
      })
      .catch((e) => alive && setError(errorMessage(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, setData, error, loading, reload };
}

/** 알림 실시간 구독 + 주기 새로고침(실시간이 끊겨도 안전하게) */
export function useAlertRefresh(onRefresh: () => void, intervalMs = 5000, filterId?: string) {
  const ref = useRef(onRefresh);
  useLayoutEffect(() => {
    ref.current = onRefresh;
  });
  useEffect(() => {
    const unsub = api.subscribeAlerts((id) => {
      if (!filterId || id === filterId || id === "*") ref.current();
    });
    const t = setInterval(() => ref.current(), intervalMs);
    const onVis = () => document.visibilityState === "visible" && ref.current();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      unsub();
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [intervalMs, filterId]);
}

/** 현재 시각 (prerender 중에는 0, 브라우저에서 바로 채워짐) */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const first = setTimeout(() => setNow(Date.now()), 0);
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [intervalMs]);
  return now;
}
