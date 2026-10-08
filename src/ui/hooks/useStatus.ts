import { useCallback, useEffect, useMemo, useState } from "react";

// 화면 아래 안내(잠시 뒤 사라짐)와 오류(누르면 닫힘)
export function useStatus() {
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(t);
  }, [notice]);

  const showError = useCallback((what: string, e: unknown) => {
    console.error(e);
    setError(`${what}: ${e instanceof Error ? e.message : String(e)}`);
  }, []);

  const clearError = useCallback(() => setError(null), []);
  // 같은 객체를 유지해야 이걸 의존하는 콜백들이 매 렌더마다 새로 만들어지지 않는다
  return useMemo(
    () => ({ notice, error, showNotice: setNotice, showError, clearError }),
    [notice, error, showError, clearError],
  );
}

export type Status = ReturnType<typeof useStatus>;
