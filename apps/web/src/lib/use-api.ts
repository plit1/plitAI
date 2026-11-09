'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from './api';

/** 로딩·오류 상태가 있는 GET 훅 */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(!!path);
  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true); setError(null);
    try { setData(await api<T>(path)); } catch (e) { setError(e instanceof ApiError ? e : new ApiError(0, 'NETWORK', '네트워크 오류가 발생했어요.')); } finally { setLoading(false); }
  }, [path]);
  useEffect(() => { load(); }, [load]);
  // path 가 막 정해진 첫 렌더(effect 실행 전)에도 로딩으로 취급 → data 가 null 인 채로 렌더되는 구간 제거
  return { data, error, loading: loading || (!!path && data === null && error === null), reload: load, setData };
}
